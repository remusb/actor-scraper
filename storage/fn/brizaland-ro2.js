async function pageFunction(context) {
    const { request, log, $ } = context;
    const title = $('title').text();
    log.info(`URL: ${request.url} TITLE: ${title}`);
    let entries = {};
    const domain = context.customData.DOMAIN;
    const adStore = await context.Apify.openKeyValueStore('case' );
    const configStore = await context.Apify.openKeyValueStore('configs' );
    const configMap = await configStore.getValue('scrappers');
    const ronToEur = configMap.ronToEur;

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
        entry.year = parseNumber($("div.property-list dt:contains('An constructie')").next().text());

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
            if (price < configMap.minPriceHouse || price > configMap.maxPriceHouse) {
                log.info(`Skipping because of price: ${price}`);
                continue;
            }

            const fullId = $('a.property-row-image', $el).attr('href');
            const idSegments = fullId.match(/\/brizaland\/ro\/detalii\/([A-Za-z0-9\-\.]+)/i);
            if (idSegments == null || idSegments.length < 2) {
                log.error(`ID match issue: ${JSON.stringify(fullId)}`);
                continue;
            }
            let entry = {
                id: idSegments[1],
                type: 'casa',
                title: $('h2.property-row-title', $el).text().trim().replace(/\n/g, ' ').replace(/\s\s+/g, ' '),
                price: price,
                fav: false,
                notified: false,
                house: parseNumber($('div.property-row-meta-item:nth-child(2) strong', $el).text().trim()),
                rooms: parseNumber($('div.property-row-meta-item:nth-child(3) strong', $el).text().trim()),
                baths: parseNumber($('div.property-row-meta-item:nth-child(4) strong', $el).text().trim()),
                size: parseNumber($('ul.property-row-location li:nth-child(2)', $el).text().trim().replace('teren ', '')),
                url: domain + $('a.property-row-image', $el).attr('href')
            };

            if (entry.rooms > 0 && entry.rooms < configMap.minRooms) {
                log.info(`Skipping because of rooms: ${entry.rooms}`);
                continue;
            }

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
