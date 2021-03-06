const Apify = require('apify');
const _ = require('underscore');
const {
    tools,
    browserTools,
    constants: { META_KEY, DEFAULT_VIEWPORT, DEVTOOLS_TIMEOUT_SECS },
} = require('@mnmkng/scraper-tools');

const GlobalStore = require('./global_store');
const createBundle = require('./bundle.browser');
const SCHEMA = require('../INPUT_SCHEMA');

const { utils: { log, puppeteer } } = Apify;

/**
 * Replicates the INPUT_SCHEMA with JavaScript types for quick reference
 * and IDE type check integration.
 *
 * @typedef {Object} Input
 * @property {Object[]} startUrls
 * @property {boolean} useRequestQueue
 * @property {Object[]} pseudoUrls
 * @property {string} linkSelector
 * @property {string} pageFunction
 * @property {Object} proxyConfiguration
 * @property {boolean} debugLog
 * @property {boolean} browserLog
 * @property {boolean} injectJQuery
 * @property {boolean} injectUnderscore
 * @property {boolean} downloadMedia
 * @property {boolean} downloadCss
 * @property {boolean} ignoreSslErrors
 * @property {number} maxRequestRetries
 * @property {number} maxPagesPerCrawl
 * @property {number} maxResultsPerCrawl
 * @property {number} maxCrawlingDepth
 * @property {number} maxConcurrency
 * @property {number} pageLoadTimeoutSecs
 * @property {number} pageFunctionTimeoutSecs
 * @property {Object} customData
 * @property {Array} initialCookies
 */

/**
 * Holds all the information necessary for constructing a crawler
 * instance and creating a context for a pageFunction invocation.
 */
class CrawlerSetup {
    /* eslint-disable class-methods-use-this */
    constructor(input) {
        // Set log level early to prevent missed messages.
        if (input.debugLog) log.setLevel(log.LEVELS.DEBUG);

        // Keep this as string to be immutable.
        this.rawInput = JSON.stringify(input);

        // Attempt to load page function from disk if not present on input.
        tools.maybeLoadPageFunctionFromDisk(input, __dirname);

        // Validate INPUT if not running on Apify Cloud Platform.
        if (!Apify.isAtHome()) tools.checkInputOrThrow(input, SCHEMA);

        /**
         * @type {Input}
         */
        this.input = input;
        this.env = Apify.getEnv();

        // Validations
        if (this.input.pseudoUrls.length && !this.input.useRequestQueue) {
            throw new Error('Cannot enqueue links using Pseudo URLs without using a Request Queue. '
                + 'Either select the "Use Request Queue" option to enable Request Queue or '
                + 'remove your Pseudo URLs.');
        }
        this.input.pseudoUrls.forEach((purl) => {
            if (!tools.isPlainObject(purl)) throw new Error('The pseudoUrls Array must only contain Objects.');
            if (purl.userData && !tools.isPlainObject(purl.userData)) throw new Error('The userData property of a pseudoUrl must be an Object.');
        });
        this.input.initialCookies.forEach((cookie) => {
            if (!tools.isPlainObject(cookie)) throw new Error('The initialCookies Array must only contain Objects.');
        });

        // Used to store page specific data.
        this.pageContexts = new WeakMap();

        // Used to store data that persist navigations
        this.globalStore = new GlobalStore();

        // Excluded resources
        this.blockedResources = new Set(['font', 'image', 'media', 'stylesheet']);
        if (this.input.downloadMedia) ['font', 'image', 'media'].forEach(m => this.blockedResources.delete(m));
        if (this.input.downloadCss) this.blockedResources.delete('stylesheet');

        // Start Chromium with Debugger any time the page function includes the keyword.
        this.devtools = this.input.pageFunction.includes('debugger;');

        // Initialize async operations.
        this.crawler = null;
        this.requestList = null;
        this.requestQueue = null;
        this.dataset = null;
        this.keyValueStore = null;
        this.initPromise = this._initializeAsync();
    }

    async _initializeAsync() {
        // RequestList
        this.requestList = await Apify.openRequestList('WEB_SCRAPER', this.input.startUrls);

        // RequestQueue if selected
        if (this.input.useRequestQueue) this.requestQueue = await Apify.openRequestQueue();

        // Dataset
        this.dataset = await Apify.openDataset();
        const { itemsCount } = await this.dataset.getInfo();
        this.pagesOutputted = itemsCount || 0;

        // KeyValueStore
        this.keyValueStore = await Apify.openKeyValueStore();
    }

    /**
     * Resolves to a `PuppeteerCrawler` instance.
     * constructor.
     * @returns {Promise<PuppeteerCrawler>}
     */
    async createCrawler() {
        await this.initPromise;

        const options = {
            handlePageFunction: this._handlePageFunction.bind(this),
            requestList: this.requestList,
            requestQueue: this.requestQueue,
            handlePageTimeoutSecs: this.devtools ? DEVTOOLS_TIMEOUT_SECS : this.input.pageFunctionTimeoutSecs,
            gotoFunction: this._gotoFunction.bind(this),
            handleFailedRequestFunction: this._handleFailedRequestFunction.bind(this),
            maxConcurrency: this.input.maxConcurrency,
            maxRequestRetries: this.input.maxRequestRetries,
            maxRequestsPerCrawl: this.input.maxPagesPerCrawl,
            proxyUrls: this.input.proxyConfiguration.proxyUrls,
            // launchPuppeteerFunction: use default,
            launchPuppeteerOptions: {
                ...(_.omit(this.input.proxyConfiguration, 'proxyUrls')),
                ignoreHTTPSErrors: this.input.ignoreSslErrors,
                defaultViewport: DEFAULT_VIEWPORT,
                devtools: this.devtools,
            },
        };

        this.crawler = new Apify.PuppeteerCrawler(options);

        return this.crawler;
    }

    async _gotoFunction({ request, page }) {
        const start = process.hrtime();

        // Create a new page context with a new random key for Apify namespace.
        const pageContext = {
            apifyNamespace: await tools.createRandomHash(),
            skipLinks: false,
        };
        this.pageContexts.set(page, pageContext);

        // Attach a console listener to get all logs as soon as possible.
        if (this.input.browserLog) browserTools.dumpConsole(page);

        // Add Error.prototype.toJSON unless already there.
        await browserTools.maybeAddErrorToJson(page);

        // Hide WebDriver before navigation
        await puppeteer.hideWebDriver(page);

        // Prevent download of stylesheets and media, unless selected otherwise
        if (this.blockedResources.size) await puppeteer.blockResources(page, Array.from(this.blockedResources));

        // Add initial cookies, if any.
        if (this.input.initialCookies.length) await page.setCookie(...this.input.initialCookies);

        tools.logPerformance(request, 'gotoFunction INIT', start);
        const handleStart = process.hrtime();

        // Attach function handles to the page to enable use of Node.js APIs from Browser context.
        pageContext.browserHandles = {
            saveSnapshot: browserTools.createBrowserHandle(page, () => browserTools.saveSnapshot({ page })),
            skipLinks: browserTools.createBrowserHandle(page, () => { pageContext.skipLinks = true; }),
            globalStore: browserTools.createBrowserHandlesForObject(
                page,
                this.globalStore,
                ['size', 'clear', 'delete', 'entries', 'get', 'has', 'keys', 'set', 'values'],
            ),
            log: browserTools.createBrowserHandlesForObject(
                page,
                log,
                ['LEVELS', 'setLevel', 'getLevel', 'debug', 'info', 'warning', 'error', 'exception'],
            ),
            apify: browserTools.createBrowserHandlesForObject(page, Apify, ['getValue', 'setValue']),
        };
        if (this.requestQueue) {
            pageContext.browserHandles.requestQueue = browserTools.createBrowserHandlesForObject(
                page,
                this.requestQueue,
                ['addRequest'],
            );
        }
        tools.logPerformance(request, 'gotoFunction INJECTION HANDLES', handleStart);

        const evalStart = process.hrtime();
        await Promise.all([
            page.evaluateOnNewDocument(createBundle, pageContext.apifyNamespace),
            page.evaluateOnNewDocument(browserTools.wrapPageFunction(this.input.pageFunction, pageContext.apifyNamespace)),
        ]);
        tools.logPerformance(request, 'gotoFunction INJECTION EVAL', evalStart);


        // Invoke navigation.
        const navStart = process.hrtime();
        const response = await page.goto(request.url, {
            timeout: (this.devtools ? DEVTOOLS_TIMEOUT_SECS : this.input.pageLoadTimeoutSecs) * 1000,
            waitUntil: 'domcontentloaded',
        });
        tools.logPerformance(request, 'gotoFunction NAVIGATION', navStart);

        // Make sure handles attached in the meantime.
        const delayStart = process.hrtime();
        const promises = Object.entries(pageContext.browserHandles)
            .map(async ([name, promise]) => {
                // Unwrap promises.
                pageContext.browserHandles[name] = await promise;
            });
        await Promise.all(promises.concat(page.waitFor(namespace => !!window[namespace], {}, pageContext.apifyNamespace)));

        // Inject selected libraries
        if (this.input.injectJQuery) await puppeteer.injectJQuery(page);
        if (this.input.injectUnderscore) await puppeteer.injectUnderscore(page);

        tools.logPerformance(request, 'gotoFunction INJECTION DELAY', delayStart);
        tools.logPerformance(request, 'gotoFunction EXECUTION', start);
        return response;
    }

    _handleFailedRequestFunction({ request }) { // eslint-disable-line class-methods-use-this
        const lastError = request.errorMessages[request.errorMessages.length - 1];
        const errorMessage = lastError ? lastError.split('\n')[0] : 'no error';
        log.error(`Request ${request.id} failed and will not be retried anymore. Marking as failed.\nLast Error Message: ${errorMessage}`);
        return this._handleResult(request, {}, null, true);
    }

    /**
     * First of all, it initializes the state that is exposed to the user via
     * `pageFunction` context.
     *
     * Then it invokes the user provided `pageFunction` with the prescribed context
     * and saves it's return value.
     *
     * Finally, it makes decisions based on the current state and post-processes
     * the data returned from the `pageFunction`.
     * @param {Object} environment
     * @returns {Function}
     */
    async _handlePageFunction({ request, response, page, autoscaledPool }) {
        const start = process.hrtime();

        const pageContext = this.pageContexts.get(page);

        /**
         * PRE-PROCESSING
         */
        // Make sure that an object containing internal metadata
        // is present on every request.
        tools.ensureMetaData(request);

        // Abort the crawler if the maximum number of results was reached.
        const aborted = await this._handleMaxResultsPerCrawl(autoscaledPool);
        if (aborted) return;

        // Setup Context and pass the configuration down to Browser.
        const contextOptions = {
            crawlerSetup: Object.assign(
                _.pick(this, ['rawInput', 'env']),
                _.pick(this.input, ['customData', 'useRequestQueue', 'injectJQuery', 'injectUnderscore']),
            ),
            browserHandles: pageContext.browserHandles,
            pageFunctionArguments: {
                request,
                response: {
                    status: response && response.status(),
                    headers: response && response.headers(),
                },
            },
        };

        /**
         * USER FUNCTION EXECUTION
         */
        tools.logPerformance(request, 'handlePageFunction PREPROCESSING', start);
        const startUserFn = process.hrtime();

        const namespace = pageContext.apifyNamespace;
        const output = await page.evaluate(async (ctxOpts, namespc) => {
            /* eslint-disable no-shadow */
            const context = window[namespc].createContext(ctxOpts);
            const output = {};
            try {
                output.pageFunctionResult = await window[namespc].pageFunction(context);
            } catch (err) {
                output.pageFunctionError = err;
            }
            // This needs to be added after pageFunction has run.
            output.requestFromBrowser = context.request;

            // Stringify manually because error info seems to get lost.
            return JSON.stringify(output);
        }, contextOptions, namespace);

        tools.logPerformance(request, 'handlePageFunction USER FUNCTION', startUserFn);
        const finishUserFn = process.hrtime();

        /**
         * POST-PROCESSING
         */
        const { pageFunctionResult, requestFromBrowser, pageFunctionError } = JSON.parse(output);
        // Merge requestFromBrowser into request to preserve modifications that
        // may have been made in browser context.
        Object.assign(request, requestFromBrowser);

        // Throw error from pageFunction, if any.
        if (pageFunctionError) throw tools.createError(pageFunctionError);

        // Enqueue more links if Pseudo URLs and a link selector are available,
        // unless the user invoked the `skipLinks()` context function
        // or maxCrawlingDepth would be exceeded.
        if (!pageContext.skipLinks) await this._handleLinks(page, request);

        // Save the `pageFunction`s result (or just metadata) to the default dataset.
        await this._handleResult(request, response, pageFunctionResult);

        tools.logPerformance(request, 'handlePageFunction POSTPROCESSING', finishUserFn);
        tools.logPerformance(request, 'handlePageFunction EXECUTION', start);
    }

    async _handleMaxResultsPerCrawl(autoscaledPool) {
        if (!this.input.maxResultsPerCrawl || this.pagesOutputted < this.input.maxResultsPerCrawl) return false;
        log.info(`User set limit of ${this.input.maxResultsPerCrawl} results was reached. Finishing the crawl.`);
        await autoscaledPool.abort();
        return true;
    }

    async _handleLinks(page, request) {
        const start = process.hrtime();

        const currentDepth = request.userData[META_KEY].depth;
        const hasReachedMaxDepth = this.input.maxCrawlingDepth && currentDepth >= this.input.maxCrawlingDepth;
        if (hasReachedMaxDepth) {
            log.debug(`Request ${request.id} reached the maximum crawling depth of ${currentDepth}.`);
            return;
        }
        const canEnqueue = this.input.pseudoUrls.length && this.input.linkSelector;
        if (!canEnqueue) return;

        await Apify.utils.enqueueLinks({
            page,
            selector: this.input.linkSelector,
            pseudoUrls: this.input.pseudoUrls,
            requestQueue: this.requestQueue,
            userData: {
                [META_KEY]: {
                    parentRequestId: request.id,
                    depth: currentDepth + 1,
                },
            },
        });

        tools.logPerformance(request, 'handleLinks EXECUTION', start);
    }

    async _handleResult(request, response, pageFunctionResult, isError) {
        const start = process.hrtime();
        const payload = tools.createDatasetPayload(request, response, pageFunctionResult, isError);
        await Apify.pushData(payload);
        this.pagesOutputted++;
        tools.logPerformance(request, 'handleResult EXECUTION', start);
    }
}

module.exports = CrawlerSetup;
