#!/usr/bin/env bash

# Try to get start script from package.json.
PACKAGE_START=$(node -e "
    try {
        const packageJson = require('./package.json');
        const startScript = packageJson && packageJson.scripts && packageJson.scripts.start
            ? packageJson.scripts.start
            : null;

        console.log(startScript || '');
    } catch (err) {}
")

# If not found print warning and fallback to old "node main.js".
if [ -z "$PACKAGE_START" ]; then
    printf '\nWARNING: The npm start script not found in package.json. Using "node main.js" instead. Please update your package.json file. For more information see https://github.com/apifytech/apify-cli/blob/master/MIGRATIONS.md\n\n'
fi
START_SCRIPT=${PACKAGE_START:='node main.js'}

INPUT_TPL=$(</storage/tpl/INPUT.json)
if [[ -z "$START_URL" || -z "$PSEUDO_URL" || -z "$DOMAIN" ]]; then
    echo "START_URL=$START_URL - PSEUDO_URL=$PSEUDO_URL - DOMAIN=$DOMAIN"
    exit 1
fi
rm -rf /storage/request_queues/${APIFY_DEFAULT_KEY_VALUE_STORE_ID}
rm -rf /storage/key_value_stores/${APIFY_DEFAULT_KEY_VALUE_STORE_ID}
mkdir -p /storage/key_value_stores/${APIFY_DEFAULT_KEY_VALUE_STORE_ID}

INPUT_TPL="${INPUT_TPL//%START_URL/${START_URL}}"
INPUT_TPL="${INPUT_TPL//%PSEUDO_URL/${PSEUDO_URL}}"
echo "${INPUT_TPL//%DOMAIN/${DOMAIN}}" > /storage/key_value_stores/${APIFY_DEFAULT_KEY_VALUE_STORE_ID}/INPUT.json

cp -f /storage/fn/${APIFY_DEFAULT_KEY_VALUE_STORE_ID}.js /usr/src/app/src/page_function.js
node -e "
var fs = require('fs');
var cm = fs.readFileSync('/storage/fn/_common.js', 'utf8');
var fn = fs.readFileSync('/storage/fn/${APIFY_DEFAULT_KEY_VALUE_STORE_ID}.js', 'utf8');
var res = fn.replace('// COMMON', cm);
fs.writeFileSync('/usr/src/app/src/page_function.js', res, 'utf8');
"

timeout 5m $START_SCRIPT
