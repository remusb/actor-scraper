async function pageFunction(context) {
    const { request, log, $ } = context;
    const title = $('title').text();
    log.info(`URL: ${request.url} TITLE: ${title}`);
    let entries = {};
    const domain = context.customData.DOMAIN;
    const adStore = await context.Apify.openKeyValueStore('terenuri' );
    const configStore = await context.Apify.openKeyValueStore('configs' );
    const configMap = await configStore.getValue('scrappers');
    const maxRetry = configMap.maxRetry;
    const ronToEur = configMap.ronToEur;
    const minPrice = parseInt(configMap.minPrice);
    const maxPrice = parseInt(configMap.maxPrice);

    if (request.userData.label === "DETAIL") {
        const entry = crawlPage(request.userData.entry);
        if (entry != null) {
            entries[entry.id] = entry;

            if (process.env.SAMPLE == "1") {
                console.log(JSON.stringify(entry, null, 2));
            } else {
                await adStore.setValue(entry.id, entry);
                console.log(`Updated ${entry.id}`);
            }
        }
    } else {
        await crawlListing();
    }

    function crawlPage(entry) {
        context.skipLinks();
        entry.sector = 0;

        const detaliiText = $('div.mb30 p').text().trim().replace(/\n/g, ' ').replace(/\s\s+/g, ' ');
        let sectorInfo = detaliiText.match(/sector(ul)? (\d)/i);
        if (sectorInfo != null && sectorInfo.length > 2) {
            entry.sector = parseInt(sectorInfo[2]);
        }

        sectorInfo = entry.title.match(/sector(ul)? (\d)/i);
        if (sectorInfo != null && sectorInfo.length > 2) {
            entry.sector = parseInt(sectorInfo[2]);
        }

        entry.location = $("div.property-list dt:contains('Locatie')").next().text().trim() + ', ' + $("div.property-list dt:contains('Zona')").next().text().trim();
        sectorInfo = entry.location.match(/sector(ul)? (\d)/i);
        if (sectorInfo != null && sectorInfo.length > 2) {
            entry.sector = parseInt(sectorInfo[2]);
        }

        entry.detail = detaliiText;
        entry.size = $('div.col-sm-6:nth-child(2) .module-content span').text().trim();

        entry = postProcess(entry);

        return entry;
    }

    async function crawlListing() {
        const elems = $('.property-row').toArray();
        let skipped = 0;
        let cnt = 0;

        for (let i = 0; i < elems.length; i++) {
            const $el = elems[i];
            let priceText = $('div.property-row-meta-item:first-child strong', $el).text().trim();

            let price = parseNumber(priceText);
            if (priceText.includes("RON")) {
                price = Math.round(price/ronToEur);
            }

            const fullId = $('a.property-row-image', $el).attr('href');
            const idSegments = fullId.match(/\/brizaland\/ro\/detalii\/([A-Za-z0-9\-\.]+)/i);
            if (idSegments == null || idSegments.length < 2) {
                log.error(`ID match issue: ${JSON.stringify(fullId)}`);
                continue;
            }
            let entry = {
                id: idSegments[1],
                type: 'teren',
                title: $('h2.property-row-title', $el).text().trim().replace(/\n/g, ' ').replace(/\s\s+/g, ' '),
                price: price,
                fav: false,
                executare: false,
                notified: false,
                url: domain + $('a.property-row-image', $el).attr('href')
            };

            const storeEntry = await adStore.getValue(entry.id);
            if (process.env.FORCE_ADD != "1" && storeEntry != null && storeEntry.price == entry.price) {
                skipped++;
                continue;
            }

            entry = preProcess(entry);
            if (entry == null) {
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

    // COMMON

    return entries;
}
