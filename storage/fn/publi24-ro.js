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

        const detaliiText = $('div.ad-detail').text().trim().replace(/\n/g, ' ').replace(/\s\s+/g, ' ');
        let sectorInfo = detaliiText.match(/sector(ul)? (\d)/i);
        if (sectorInfo != null && sectorInfo.length > 2) {
            entry.sector = parseInt(sectorInfo[2]);
        }

        sectorInfo = entry.title.match(/sector(ul)? (\d)/i);
        if (sectorInfo != null && sectorInfo.length > 2) {
            entry.sector = parseInt(sectorInfo[2]);
        }

        $("div[itemtype='https://schema.org/Place'] span.fa-map-marker").remove();
        $("div[itemtype='https://schema.org/Place'] #showMap").remove();
        const locationText = $("div[itemtype='https://schema.org/Place']").text().trim().replace(/\n/g, ' ').replace(/\s\s+/g, ' ');
        sectorInfo = locationText.match(/sector(ul)? (\d)/i);
        if (sectorInfo != null && sectorInfo.length > 2) {
            entry.sector = parseInt(sectorInfo[2]);
        }

        entry.location = locationText;
        entry.detail = detaliiText;
        entry.size = 0;

        return entry;
    }

    async function crawlListing() {
        const elems = $('ul.listing li[itemscope]').toArray();
        let skipped = 0;
        let cnt = 0;

        for (let i = 0; i < elems.length; i++) {
            const $el = elems[i];
            let priceText = $('strong.price', $el).text().trim();

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

            const id = $('a[itemprop=url] span.favorites', $el).attr('data-id');
            const entry = {
                id: id,
                title: $('a[itemprop=name]', $el).text().trim(),
                price: price,
                fav: false,
                executare: false,
                notified: false,
                url: $('a[itemprop=url]', $el).attr('href')
            };

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
