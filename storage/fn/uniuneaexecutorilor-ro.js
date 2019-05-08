async function pageFunction(context) {
    const { request, log, $ } = context;
    const title = $('title').text();
    log.info(`URL: ${request.url} TITLE: ${title}`);
    let entries = {};
    const domain = context.customData.DOMAIN;
    const adStore = await context.Apify.openKeyValueStore('terenuri' );
    const configStore = await context.Apify.openKeyValueStore('configs' );
    const configMap = await configStore.getValue('scrappers');
    const ronToEur = configMap.ronToEur;

    if (request.userData.label === "DETAIL") {
        const entry = crawlPage(request.userData.entry);
        entries[entry.id] = entry;

        if (process.env.SAMPLE == "1") {
            console.log('SAMPLE:');
            console.log(JSON.stringify(entry));
        } else {
            await adStore.setValue(entry.id, entry);
            console.log(`Updated ${entry.id}`);
        }
    } else {
        await crawlListing();
    }

    function crawlPage(entry) {
        context.skipLinks();
        entry.detail = `<a href="${domain}/document/${entry.id}" target="_blank">Document</a>`;
        entry.sector = 0;
        entry.size = 0;

        const detailText = $('div.listing-excerpt p').text().trim();

        let sectorInfo = detailText.match(/sector(ul)? (\d)/i);
        if (sectorInfo != null && sectorInfo.length > 2) {
            entry.detail += `, Sector ${sectorInfo[2]}`;
            entry.sector = parseInt(sectorInfo[2]);
        }

        sectorInfo = entry.title.match(/sector(ul)? (\d)/i);
        if (sectorInfo != null && sectorInfo.length > 2) {
            entry.sector = parseInt(sectorInfo[2]);
        }

        return entry;
    }

    async function crawlListing() {
        const elems = $('div.property-listing').toArray();
        let skipped = 0;
        let cnt = 0;

        for (let i = 0; i < elems.length; i++) {
            const $el = elems[i];
            const title = $('div.listing-title a', $el).attr('title');

            $('div.listing-property-price sup small', $el).remove();
            let priceText = $('div.listing-property-price sup', $el).text().trim();

            // format number
            priceText = priceText.replace(/\./g, '');
            priceText = priceText.replace(/,/g, '.');
            if (priceText.includes("nespecificat")) {
                continue;
            }
            let price = parseFloat(priceText);
            if (priceText.includes("RON")) {
                price = Math.round(price/ronToEur);
            }

            const fullId = $('div.listing-title a', $el).attr('href');
            const idSegments = fullId.match(/\/publication\/(\d+)/i);
            if (idSegments == null || idSegments.length < 2) {
                log.error(`ID match issue: ${JSON.stringify(fullId)}`);
                continue;
            }

            const entry = {
                id: idSegments[1],
                title: $('div.listing-title a', $el).attr('title'),
                price: price,
                fav: false,
                executare: true,
                notified: false
            };
            entry.url = domain + fullId;

            const storeEntry = await adStore.getValue(entry.id);
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
