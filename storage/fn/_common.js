function parseNumber(numberText) {
    if (numberText == null || numberText == "") {
        numberText = "0";
    }

    // format number
    numberText = numberText.replace(/[A-Za-z\s]/g, '');
    numberText = numberText.replace(/\./g, '');
    numberText = numberText.replace(/,/g, '.');
    let nr = parseFloat(numberText);
    if (typeof nr !== "number" || isNaN(nr)) {
        return 0;
    }

    return nr;
}
