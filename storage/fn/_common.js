function parseText($strObj) {
    if (typeof $strObj === "string") {
        return $strObj.trim().replace(/\n/g, ' ').replace(/\s\s+/g, ' ');
    }

    return $strObj.text().trim().replace(/\n/g, ' ').replace(/\s\s+/g, ' ');
}

function parseNumber($numberObj, stdFmt) {
    let numberText = '';
    stdFmt = stdFmt || false;

    if (typeof $numberObj === "number") {
        return $numberObj;
    } else if (typeof $numberObj === "string") {
        numberText = $numberObj;
    } else {
        $('sup,sub', $numberObj).remove();
        numberText = $numberObj.text();
    }

    if (numberText == null || numberText == "") {
        numberText = "0";
    }

    // format number
    if (!stdFmt) {
        numberText = numberText.replace(/[:A-zÀ-ž\.\s€]/gi, '');
        numberText = numberText.replace(/,/g, '.');
    } else {
        numberText = numberText.replace(/[:A-zÀ-ž,\s€]/gi, '');
    }
    let nr = parseFloat(numberText);
    if (typeof nr !== "number" || isNaN(nr)) {
        return 0;
    }

    return nr;
}

function preProcess(entry) {
    if (entry.type == 'teren') {
        if (configMap.minPrice > 0 && (entry.price < configMap.minPrice || entry.price > configMap.maxPrice) && entry.price > configMap.mpPrice) {
            log.info(`Skipping ${entry.url} - price: ${entry.price}`);
            return null;
        }
    } else if (entry.type == 'casa') {
        if (configMap.minPriceHouse > 0 && (entry.price < configMap.minPriceHouse || entry.price > configMap.maxPriceHouse) && entry.price > configMap.mpPriceHouse) {
            log.info(`Skipping ${entry.url} - price: ${entry.price}`);
            return null;
        }
    }

    return entry;
}

function postProcess(entry) {
    entry.size = parseNumber(entry.size);
    entry.domain = context.customData.DOMAIN;

    if (entry.size > 0 && entry.size < configMap.minSizeTeren) {
      log.info(`Skipping ${entry.url} - teren size: ${entry.size}`);
      return null;
    }

    if (entry.type == 'teren') {
        if (entry.price <= configMap.mpPrice && entry.size > 0) {
            newPrice = entry.price * entry.size;
            entry.title = entry.title + " - " + newPrice + " EUR";
        }
    } else if (entry.type == 'casa') {
        if (entry.year > 0 && configMap.minYear > 0 && entry.year < configMap.minYear) {
            log.info(`Skipping ${entry.url} - year: ${entry.year}`);
            return null;
        }
        if (entry.rooms > 0 && configMap.minRooms > 0 && entry.rooms < configMap.minRooms) {
            log.info(`Skipping ${entry.url} - rooms: ${entry.rooms}`);
            return null;
        }
        if (entry.house > 0 && configMap.minSizeHouse > 0 && (entry.house > configMap.maxSizeHouse || entry.house < configMap.minSizeHouse)) {
            log.info(`Skipping ${entry.url} - house size: ${entry.house}`);
            return null;
        }
        if (entry.price <= configMap.mpPriceHouse && entry.size > 0) {
            newPrice = entry.price * entry.house;
            entry.title = entry.title + " - " + newPrice + " EUR";
        }
    }

    return entry;
}
