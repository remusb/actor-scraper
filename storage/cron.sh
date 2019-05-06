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
for file in ../storage/fn/*.js; do
    baseFile=$(basename -- ${file})
    key="${baseFile%%.*}"
    echo "Running ${key}"
    /usr/local/bin/docker-compose run --rm -e "FORCE_ADD=${FORCE_ADD}" ${key}
done

cd "$DIR/../../actor-notify-email"
/usr/local/bin/docker-compose build
/usr/local/bin/docker-compose run --rm -e "GMAIL_USER=$GMAIL_USER" -e "GMAIL_PASSWORD=$GMAIL_PASSWORD" -e "INCLUDE_NOTIFIED=$FORCE_NOTIFY" -e "CONTAINS=Bucurestii|Jiului|Damaroaia|Bazilescu" actor-notify-email
/usr/local/bin/docker-compose run --rm -e "GMAIL_USER=$GMAIL_USER" -e "GMAIL_PASSWORD=$GMAIL_PASSWORD" -e "INCLUDE_NOTIFIED=$FORCE_NOTIFY" -e "SECTOR=1" actor-notify-email
/usr/local/bin/docker-compose run --rm -e "GMAIL_USER=$GMAIL_USER" -e "GMAIL_PASSWORD=$GMAIL_PASSWORD" -e "INCLUDE_NOTIFIED=$FORCE_NOTIFY" actor-notify-email
