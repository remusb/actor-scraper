function parseNumber($numberObj) {
    let numberText = '';

    if (typeof $numberObj === "number") {
        return $numberObj;
    } else if (typeof $numberObj === "string") {
        numberText = $numberObj;
    } else {
        numberText = $numberObj
            .clone()    //clone the element
            .children() //select all the children
            .remove()   //remove all the children
            .end()  //again go back to selected element
            .text();
    }

    if (numberText == null || numberText == "") {
        numberText = "0";
    }

    // format number
    numberText = numberText.replace(/[a-z\.\s]/gi, '');
    numberText = numberText.replace(/,/g, '.');
    let nr = parseFloat(numberText);
    if (typeof nr !== "number" || isNaN(nr)) {
        return 0;
    }

    return nr;
}

function preProcess(entry) {
    if (entry.type == 'teren') {
        if ((entry.price < configMap.minPrice || entry.price > configMap.maxPrice) && entry.price > configMap.mpPrice) {
            log.info(`Skipping ${entry.url} - price: ${entry.price}`);
            return null;
        }
    } else if (entry.type = 'casa') {
        if (entry.rooms > 0 && entry.rooms < configMap.minRooms) {
            log.info(`Skipping ${entry.url} - rooms: ${entry.rooms}`);
            return null;
        }
        if ((entry.price < configMap.minPriceHouse || entry.price > configMap.maxPriceHouse) && entry.price > configMap.mpPriceHouse) {
            log.info(`Skipping ${entry.url} - rooms: ${entry.rooms}`);
            return null;
        }
    }

    return entry;
}

function postProcess(entry) {
    entry.size = parseNumber(entry.size);
    entry.domain = context.customData.DOMAIN;

    if (entry.type == 'teren') {
        if (entry.price <= configMap.mpPrice && entry.size > 0) {
            newPrice = entry.price * entry.size;
            entry.title = entry.title + " - " + newPrice + " EUR";
        }
    } else if (entry.type = 'casa') {
        if (entry.price <= configMap.mpPriceHouse && entry.size > 0) {
            newPrice = entry.price * entry.house;
            entry.title = entry.title + " - " + newPrice + " EUR";
        }
    }

    return entry;
}
