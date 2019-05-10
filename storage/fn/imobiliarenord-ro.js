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
    const mpPrice = parseInt(configMap.mpPrice);

    if (request.userData.label === "DETAIL") {
        const entry = crawlPage(request.userData.entry);

        if (entry != null) {
            entries[entry.id] = entry;

            if (process.env.SAMPLE == "1" || process.env.SAMPLE_KEY == entry.id) {
                console.log('SAMPLE:');
                console.log(JSON.stringify(entry));
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
        entry.title = $('h1.entry-title').text().trim();

        const detaliiText = $('#description').text().trim().replace(/\n/g, ' ').replace(/\s\s+/g, ' ');
        let sectorInfo = detaliiText.match(/sector(ul)? (\d)/i);
        if (sectorInfo != null && sectorInfo.length > 2) {
            entry.sector = parseInt(sectorInfo[2]);
        }

        sectorInfo = entry.title.match(/sector(ul)? (\d)/i);
        if (sectorInfo != null && sectorInfo.length > 2) {
            entry.sector = parseInt(sectorInfo[2]);
        }

        entry.location = $('span.adres_area').text().trim();
        sectorInfo = entry.location.match(/sector(ul)? (\d)/i);
        if (sectorInfo != null && sectorInfo.length > 2) {
            entry.sector = parseInt(sectorInfo[2]);
        }

        entry.detail = detaliiText;

        entry.size = $("#details div.listing_detail strong:contains('Dimensiune')").parent().text().trim();
        entry.size = entry.size.replace(/\s/g, '');
        entry.size = entry.size.replace(/,/g, '.');
        let sizeInfo = entry.size.match(/([\d\.]+)/i);
        if (sizeInfo != null && sizeInfo.length > 1) {
            entry.size = parseFloat(sizeInfo[1]);
        }
        if (entry.price === 0) {
            const price = parsePrice($('span.price_area').text().trim());
            if ((price < minPrice || price > maxPrice) && price > mpPrice) {
                log.info(`Skipping because of price: ${price}`);
                return;
            }
            entry.price = price;
        }

        let newPrice = entry.price;
        if (newPrice <= mpPrice) {
            newPrice = entry.price * entry.size;
            entry.title = entry.title + " - " + newPrice + " EUR";
        }
        if (newPrice > maxPrice) {
            log.info(`Skipping ${entry.id} because of price: ${entry.price}`);
            return null;
        }

        return entry;
    }

    async function crawlListing() {
        const elems = $('div.property_unit_type3[data-listid]').toArray();
        let skipped = 0;
        let cnt = 0;

        for (let i = 0; i < elems.length; i++) {
            const $el = elems[i];
            const price = parsePrice($('div.listing_unit_price_wrapper', $el).text().trim());
            if ((price < minPrice || price > maxPrice) && price > mpPrice) {
                log.info(`Skipping because of price: ${price}`);
                continue;
            }

            const fullId = $('div.unit_type3_details a', $el).attr('href');
            const idSegments = fullId.match(/\/properties\/([A-Za-z0-9\-\.]+)\//i);
            if (idSegments == null || idSegments.length < 2) {
                log.error(`ID match issue: ${JSON.stringify(fullId)}`);
                continue;
            }
            const entry = {
                id: idSegments[1],
                title: $('div.info_container_unit_3 h4 a', $el).text().trim(),
                price: price,
                fav: false,
                executare: false,
                notified: false,
                url: $('div.unit_type3_details a', $el).attr('href')
            };
            console.log(`${entry.id} - ${price}`);

            const storeEntry = await adStore.getValue(entry.id);
            if (process.env.FORCE_ADD != "1" && storeEntry != null && storeEntry.price == entry.price && process.env.SAMPLE_KEY != entry.id) {
                // log.info(`Skipping ${entry.id}`);
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
                cnt++;
            }
        }

        log.info( `Parsed ${cnt} entries` );
        log.info( `Skipped ${skipped} entries` );
    }

    function parsePrice(priceText) {
        if (priceText == null || priceText == "") {
            priceText = "0";
        }
        isRon = false;
        if (priceText.includes("RON")) {
            isRon = true;
        }

        // format number
        priceText = priceText.replace(/[A-Za-z\s]/g, '');
        priceText = priceText.replace(/\./g, '');
        priceText = priceText.replace(/,/g, '.');
        let price = parseFloat(priceText);
        if (isRon) {
            price = Math.round(price/ronToEur);
        }
        if (typeof price !== "number" || isNaN(price)) {
            return 0;
        }

        return price
    }

    return entries;
}
