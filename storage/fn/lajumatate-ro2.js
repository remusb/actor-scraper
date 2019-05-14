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

            if (process.env.SAMPLE == "1" || process.env.SAMPLE_KEY == entry.id) {
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
        entry.location = $("#extra-fields div span:contains('Zona')").next().text().trim();

        const detaliiText = $('#description p[itemprop=description]').text().trim();
        let sectorInfo = detaliiText.match(/sector(ul)? (\d)/i);
        if (sectorInfo != null && sectorInfo.length > 2) {
            entry.sector = parseInt(sectorInfo[2]);
        }

        sectorInfo = entry.title.match(/sector(ul)? (\d)/i);
        if (sectorInfo != null && sectorInfo.length > 2) {
            entry.sector = parseInt(sectorInfo[2]);
        }

        sectorInfo = entry.location.match(/sector(ul)? (\d)/i);
        if (sectorInfo != null && sectorInfo.length > 2) {
            entry.sector = parseInt(sectorInfo[2]);
        }

        entry.detail = detaliiText;
        entry.size = parseNumber($("#extra-fields div span:contains('Suprafață teren')").next());
        entry.house = parseNumber($("#extra-fields div span:contains('Suprafața utilă')").next());
        entry.baths = 0;
        entry.year = parseNumber($("#extra-fields div span:contains('An finalizare')").next());
        entry.rooms = parseNumber($("#extra-fields div span:contains('Număr camere')").next());

        entry = postProcess(entry);

        return entry;
    }

    async function crawlListing() {
        const elems = $('#list_cart_holder a.item_cart.main_items').toArray();
        let skipped = 0;
        let cnt = 0;

        for (let i = 0; i < elems.length; i++) {
            const $el = $(elems[i]);
            const id = process.env.APIFY_DEFAULT_KEY_VALUE_STORE_ID + '-' + $el.attr('href').trim().replace(`${domain}/`, '');
            let priceText = $('span.price', $el).text().trim();
            let price = parseNumber($('span.price', $el));
            if (priceText.includes("ron")) {
                price = Math.round(price/ronToEur);
            }

            let entry = {
                id: id,
                type: 'casa',
                url: $el.attr('href'),
                title: $('span.title', $el).text().trim(),
                price: price,
                fav: false,
                notified: false,
                executare: false
            };

            const storeEntry = await adStore.getValue(entry.id);
            if (process.env.FORCE_ADD != "1" && storeEntry != null && storeEntry.price == entry.price
                && process.env.SAMPLE_KEY != entry.id) {
                skipped++;
                continue;
            }
            entry = preProcess(entry);
            if (entry == null) {
                skipped++;
                continue;
            }

            if (!('SAMPLE_KEY' in process.env) || process.env.SAMPLE_KEY == entry.id) {
                context.enqueueRequest({
                    url: entry.url,
                    userData: {
                        label: 'DETAIL',
                        entry: entry
                    }
                });
            }
            cnt++;
        }

        log.info( `Parsed ${cnt} entries` );
        log.info( `Skipped ${skipped} entries` );
    }

    // COMMON

    return entries;
}
