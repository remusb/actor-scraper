async function pageFunction(context) {
    const { request, log, $ } = context;
    const domain = context.customData.DOMAIN;
    const adStore = await context.Apify.openKeyValueStore('terenuri' );
    const configStore = await context.Apify.openKeyValueStore('configs' );
    const configMap = await configStore.getValue('scrappers');
    const maxRetry = configMap.maxRetry;
    const ronToEur = configMap.ronToEur;

    const entries = await crawlPage();

    async function crawlPage(context) {
        const title = $('title').text().trim();
        log.info(`URL: ${request.url} TITLE: ${title}`);
        let entries = {};
        let cnt = 0;
        let skipped = 0;

        const elems = $('a.Xanunt').toArray();
        log.info(`Processing ${elems.length} entries`);
        if (elems.length == 0) {
            log.info(`Enqueue page again: ${request.url}`);
            let retryCount = 0;
            if ('userData' in request) {
                retryCount = request.userData.retryCount;
            }
            if (retryCount >= maxRetry) throw new Error('Retry count reach!');
            context.enqueueRequest({
                url: request.url + '&_dc=' + Math.random(),
                userData: {
                    retryCount: retryCount + 1
                }
            });
        }

        for (let i = 0; i < elems.length; i++) {
            const $el = elems[i];
            let priceText = $('div div.divXpret', $el).text();
            // format number
            if (priceText.includes("nespecificat")) {
                continue;
            }
            let price = parseNumber($('div div.divXpret', $el));
            if (priceText.includes("RON")) {
                price = Math.round(price/ronToEur);
            }

            let entry = {
                id: $($el).attr('href'),
                type: 'teren',
                title: $('div div.divXanuntT', $el).text(),
                price: price,
                detail: $('div p:first-child', $el).text(),
                fav: false,
                executare: true,
                sector: 0,
                size: 0
            };
            entry.url = domain + '/' + entry.id;
            let sectorInfo = entry.detail.match(/sector(ul)? (\d)/i);
            if (sectorInfo != null && sectorInfo.length > 2) {
                entry.sector = parseInt(sectorInfo[2]);
            }
            sectorInfo = entry.title.match(/sector(ul)? (\d)/i);
            if (sectorInfo != null && sectorInfo.length > 2) {
                entry.sector = parseInt(sectorInfo[2]);
            }
            entry = preProcess(entry);
            if (entry == null) {
                skipped++;
                continue;
            }

            const storeEntry = await adStore.getValue(entry.id);
            if (process.env.FORCE_ADD != "1" && storeEntry != null && storeEntry.price == entry.price) {
                skipped++;
                continue;
            }
            entry = postProcess(entry);

            if (entry != null) {
                if (process.env.SAMPLE == "1") {
                    console.log(JSON.stringify(entry, null, 2));
                    return;
                } else {
                    await adStore.setValue(entry.id, entry);
                }

                entries[entry.id] = entry;
                cnt++;
            }
        }

        log.info( `Parsed ${cnt} entries` );
        log.info( `Skipped ${skipped} entries` );
        return entries;
    }

    // COMMON

    return entries;
}
