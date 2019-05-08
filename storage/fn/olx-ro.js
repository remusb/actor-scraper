async function pageFunction(context) {
    const { request, log, $ } = context;
    const title = $('title').text();
    log.info(`URL: ${request.url} TITLE: ${title}`);
    let entries = {};
    const domain = context.customData.DOMAIN;
    const adStore = await context.Apify.openKeyValueStore('terenuri' );

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
        entry.sector = 0;
        entry.size = 0;
        entry.title = $('div.offer-titlebox h1').text().trim();
        entry.detail = $('#textContent').text().trim();

        let sectorInfo = entry.detail.match(/sector(ul)? (\d)/i);
        if (sectorInfo != null && sectorInfo.length > 2) {
            entry.sector = parseInt(sectorInfo[2]);
        }

        sectorInfo = entry.title.match(/sector(ul)? (\d)/i);
        if (sectorInfo != null && sectorInfo.length > 2) {
            entry.sector = parseInt(sectorInfo[2]);
        }

        const locationText = $('a.show-map-link strong').text().trim();
        sectorInfo = locationText.match(/sector(ul)? (\d)/i);
        if (sectorInfo != null && sectorInfo.length > 2) {
            entry.sector = parseInt(sectorInfo[2]);
        }


        entry.location = locationText;
        entry.size = $("table.item th:contains('Suprafata')").next().text().trim();

        return entry;
    }

    async function crawlListing() {
        const elems = $('div.offer-wrapper').toArray();
        let skipped = 0;
        let cnt = 0;

        for (let i = 0; i < elems.length; i++) {
            const $el = elems[i];
            let priceText = $('p.price', $el).text().trim();

            // format number
            priceText = priceText.replace(/ /g, '');
            // priceText = priceText.replace(/,/g, '.');
            // if (priceText.includes("nespecificat")) {
            //     continue;
            // }
            let price = parseFloat(priceText);

            const fullId = $('a.thumb', $el).attr('href');
            const idSegments = fullId.match(/https:\/\/www\.olx\.ro\/oferta\/([A-Za-z0-9\-\.]+)#.*/i);
            if (idSegments == null || idSegments.length < 2) {
                log.error(`ID match issue: ${JSON.stringify(fullId)}`);
                continue;
            }

            const entry = {
                id: idSegments[1],
                title: '',
                price: price,
                fav: false,
                executare: false,
                notified: false
            };
            entry.url = domain + '/oferta/' + entry.id;

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
