#!/usr/bin/env bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR/../cheerio-scraper"

FORCE_ADD=0
if [[ -n "$1" ]]; then
    FORCE_ADD=$1
fi

FORCE_NOTIFY=0
if [[ -n "$2" ]]; then
    FORCE_NOTIFY=$2
fi

/usr/local/bin/docker-compose build
INPUT_TPL=$(<../storage/tpl/INPUT.json)
for file in ../storage/fn/*.js; do
    baseFile=$(basename -- ${file})
    key="${baseFile%%.*}"
    echo "Running ${key}"

    ee=$(docker run -v ${PWD}:/workdir mikefarah/yq yq r docker-compose.yaml "services.${key}.environment")
    eval "${ee//- /}"
    if [[ -z "$START_URL" || -z "$PSEUDO_URL" || -z "$DOMAIN" ]]; then
        echo "START_URL=$START_URL - PSEUDO_URL=$PSEUDO_URL - DOMAIN=$DOMAIN"
        continue
    fi

    mkdir -p ../storage/key_value_stores/${key}
    INPUT_TPL="${INPUT_TPL//%START_URL/${START_URL}}"
    INPUT_TPL="${INPUT_TPL//%PSEUDO_URL/${PSEUDO_URL}}"
    echo "${INPUT_TPL//%DOMAIN/${DOMAIN}}" > ../storage/key_value_stores/${key}/INPUT.json

    /usr/local/bin/docker-compose run --rm -e "FORCE_ADD=${FORCE_ADD}" ${key}

    unset START_URL
    unset PSEUDO_URL
    unset DOMAIN
done

cd "$DIR/../../actor-notify-email"
/usr/local/bin/docker-compose build
/usr/local/bin/docker-compose run --rm -e "GMAIL_USER=$GMAIL_USER" -e "GMAIL_PASSWORD=$GMAIL_PASSWORD" -e "INCLUDE_NOTIFIED=$FORCE_NOTIFY" -e "CONTAINS=Bucurestii|Jiului|Damaroaia|Bazilescu" actor-notify-email
/usr/local/bin/docker-compose run --rm -e "GMAIL_USER=$GMAIL_USER" -e "GMAIL_PASSWORD=$GMAIL_PASSWORD" -e "INCLUDE_NOTIFIED=$FORCE_NOTIFY" -e "SECTOR=1" actor-notify-email
/usr/local/bin/docker-compose run --rm -e "GMAIL_USER=$GMAIL_USER" -e "GMAIL_PASSWORD=$GMAIL_PASSWORD" -e "INCLUDE_NOTIFIED=$FORCE_NOTIFY" actor-notify-email
