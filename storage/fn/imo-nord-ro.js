async function pageFunction(context) {
    const { request, log, $ } = context;
    const title = $('title').text();
    log.info(`URL: ${request.url} TITLE: ${title}`);
    let entries = {};
    const domain = context.customData.DOMAIN;
    const terenuriStore = await context.Apify.openKeyValueStore('terenuri' );
    const configStore = await context.Apify.openKeyValueStore('configs' );
    const configMap = await configStore.getValue('scrappers');
    const maxRetry = configMap.maxRetry;
    const ronToEur = configMap.ronToEur;
    const minPrice = parseInt(configMap.minPrice);
    const maxPrice = parseInt(configMap.maxPrice);

    if (request.userData.label === "DETAIL") {
        const entry = crawlPage(request.userData.entry);
        entries[entry.id] = entry;
        await terenuriStore.setValue(entry.id, entry);
        // console.log(`Updated ${entry.id}`);
    } else {
        await crawlListing();
    }

    function crawlPage(entry) {
        context.skipLinks();
        entry.sector = 0;

        const detaliiText = $('div.property_desc p').text().trim().replace(/\n/g, ' ').replace(/\s\s+/g, ' ');
        let sectorInfo = detaliiText.match(/sector(ul)? (\d)/i);
        if (sectorInfo != null && sectorInfo.length > 2) {
            entry.sector = parseInt(sectorInfo[2]);
        }

        sectorInfo = entry.title.match(/sector(ul)? (\d)/i);
        if (sectorInfo != null && sectorInfo.length > 2) {
            entry.sector = parseInt(sectorInfo[2]);
        }

        entry.location = '';
        entry.detail = detaliiText;

        $('div.boxed_mini_details1 span.area strong').remove();
        entry.size = $('div.boxed_mini_details1 span.area').text().trim();

        return entry;
    }

    async function crawlListing() {
        const elems = $('div.boxes').toArray();
        let skipped = 0;
        let cnt = 0;

        for (let i = 0; i < elems.length; i++) {
            const $el = elems[i];
            let priceText = $('div.ImageWrapper div.status_type', $el).text().trim();

            // format number
            priceText = priceText.replace(/\s/g, '');
            priceText = priceText.replace(/\./g, '');
            priceText = priceText.replace(/,/g, '.');
            if (priceText.includes("nespecificat")) {
                continue;
            }
            let price = parseFloat(priceText);
            if (priceText.includes("RON")) {
                price = Math.round(price/ronToEur);
            }
            if (price < minPrice || price > maxPrice) {
                log.info(`Skipping because of price: ${price}`);
                continue;
            }

            const id = $('a[itemprop=url] span.favorites', $el).attr('data-id');
            const fullId = $('div.ImageWrapper a', $el).attr('href');
            const idSegments = fullId.match(/\/oferte-imobiliare\/view\/([A-Za-z0-9\-\.]+)/i);
            if (idSegments == null || idSegments.length < 2) {
                log.error(`ID match issue: ${JSON.stringify(fullId)}`);
                continue;
            }
            const entry = {
                id: idSegments[1],
                title: $('h2.title a', $el).text().trim(),
                price: price,
                fav: false,
                executare: false,
                notified: false,
                url: domain + $('h2.title a', $el).attr('href')
            };

            const storeEntry = await terenuriStore.getValue(entry.id);
            if (process.env.FORCE_ADD != "1" && storeEntry != null && storeEntry.price == entry.price) {
                // log.info(`Skipping ${entry.id}`);
                skipped++;
                continue;
            }

            context.enqueueRequest({
                url: entry.url,
                userData: {
                    label: 'DETAIL',
                    entry: entry
                }
            });
            cnt++;
        }

        log.info( `Parsed ${cnt} entries` );
        log.info( `Skipped ${skipped} entries` );
    }

    return entries;
}
