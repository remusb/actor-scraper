async function pageFunction(context) {
    const { request, log, $ } = context;
    const title = $('title').text();
    log.info(`URL: ${request.url} TITLE: ${title}`);
    let entries = {};
    const domain = context.customData.DOMAIN;
    const terenuriStore = await context.Apify.openKeyValueStore('terenuri' );

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
        entry.size = 0;
        entry.title = $('div.titlu h1').text().trim();

        $('div.header_info div div:first-child span.hidden-print').remove();
        const locationText = $('div.header_info div div:first-child').text().trim();
        const detaliiText = $('#b_detalii_text p').text().trim();

        let sectorInfo = detaliiText.match(/sector(ul)? (\d)/i);
        if (sectorInfo != null && sectorInfo.length > 2) {
            entry.sector = parseInt(sectorInfo[2]);
        }
        sectorInfo = entry.title.match(/sector(ul)? (\d)/i);
        if (sectorInfo != null && sectorInfo.length > 2) {
            entry.sector = parseInt(sectorInfo[2]);
        }
        sectorInfo = locationText.match(/sector(ul)? (\d)/i);
        if (sectorInfo != null && sectorInfo.length > 2) {
            entry.sector = parseInt(sectorInfo[2]);
        }
        entry.location = locationText;
        entry.detail = detaliiText;
        entry.size = $("ul.lista-tabelara li:contains('Suprafaţă') span").text().trim();

        return entry;
    }

    async function crawlListing() {
        const elems = $('div.box-anunt[id]').toArray();
        let skipped = 0;
        let cnt = 0;

        for (let i = 0; i < elems.length; i++) {
            const $el = $(elems[i]);
            let priceText = $('div.pret span.pret-mare', $el).text().trim();
            if (priceText == null) {
                priceText = "0";
            }

            // format number
            priceText = priceText.replace(/ /g, '');
            priceText = priceText.replace(/\./g, '');
            priceText = priceText.replace(/,/g, '.');
            let price = parseFloat(priceText);

            const entry = {
                id: $el.attr('id'),
                title: '',
                price: price,
                fav: false,
                executare: $('.box-tip-licitatie', $el).length > 0,
                notified: false
            };
            entry.url = $('a[itemprop=name]', $el).attr('href');

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
