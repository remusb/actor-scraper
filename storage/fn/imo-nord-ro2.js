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

        const detaliiText = parseText($('div.property_desc p'));
        let sectorInfo = detaliiText.match(/sector(ul)? (\d)/i);
        if (sectorInfo != null && sectorInfo.length > 2) {
            entry.sector = parseInt(sectorInfo[2]);
        }

        sectorInfo = entry.title.match(/sector(ul)? (\d)/i);
        if (sectorInfo != null && sectorInfo.length > 2) {
            entry.sector = parseInt(sectorInfo[2]);
        }

        entry.detail = detaliiText;
        entry.location = $("div.other_details div div div:contains('Localitate')").next().text().trim();
        entry.size = parseNumber($("div.other_details div div div:contains('Suprafata Lot')").next());
        entry.house = parseNumber($("div.other_details div div div:contains('Suprafata Utila')").next());
        entry.rooms = parseNumber($("div.other_details div div div:contains('Total Incaperi')").next());
        entry.baths = parseNumber($("div.other_details div div div:contains('Numar Total Bai')").next());
        entry.year = parseNumber($("div.other_details div div div:contains('An Constructie')").next());

        entry = postProcess(entry);

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
            let price = parseNumber($('div.ImageWrapper div.status_type', $el));
            if (priceText.includes("RON")) {
                price = Math.round(price/ronToEur);
            }

            const fullId = $('div.ImageWrapper a', $el).attr('href');
            const idSegments = fullId.match(/\/oferte-imobiliare\/view\/([A-Za-z0-9\-\.]+)/i);
            if (idSegments == null || idSegments.length < 2) {
                log.error(`ID match issue: ${JSON.stringify(fullId)}`);
                continue;
            }
            let entry = {
                id: idSegments[1],
                type: 'casa',
                title: $('h2.title a', $el).text().trim(),
                price: price,
                fav: false,
                executare: false,
                notified: false,
                url: domain + $('h2.title a', $el).attr('href')
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
