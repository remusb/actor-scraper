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
        entry.size = 0;

        const detaliiText = $('#description p[itemprop=description]').text().trim();

        let sectorInfo = detaliiText.match(/sector(ul)? (\d)/i);
        if (sectorInfo != null && sectorInfo.length > 2) {
            entry.sector = parseInt(sectorInfo[2]);
        }
        sectorInfo = entry.title.match(/sector(ul)? (\d)/i);
        if (sectorInfo != null && sectorInfo.length > 2) {
            entry.sector = parseInt(sectorInfo[2]);
        }
        entry.detail = detaliiText;
        entry.size = $("div.filter_margin span:contains('Suprafață')").next().text().trim();
        entry.executare = $("div.checked-field span:contains('Executare')").length > 0;

        entry = postProcess(entry);

        return entry;
    }

    async function crawlListing() {
        const elems = $('#list_cart_holder a.item_cart[id]').toArray();
        let skipped = 0;
        let cnt = 0;

        for (let i = 0; i < elems.length; i++) {
            const $el = $(elems[i]);
            let priceText = $('span.price', $el).text().trim();

            // format number
            if (priceText.includes("nespecificat")) {
                continue;
            }
            let price = parseNumber(priceText);
            if (priceText.includes("ron")) {
                price = Math.round(price/ronToEur);
            }
            const id = $el.attr('href').trim().replace(`${domain}/`, '');

            let entry = {
                id: id,
                type: 'teren',
                url: $el.attr('href'),
                title: $('span.title', $el).text().trim(),
                price: price,
                fav: false,
                notified: false,
                location: $('span.area', $el).text().trim()
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
