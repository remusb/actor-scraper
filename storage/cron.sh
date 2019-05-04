#!/usr/bin/env bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR/../cheerio-scraper"

FORCE_ADD=0
if [[ -n "$1" ]]; then
    FORCE_ADD=$1
fi

for file in "$DIR/../storage/fn/*.js"; do
    key=$(basename ${file%.*})
    echo "Running ${key}"
    docker-compose run --rm -e "FORCE_ADD=${FORCE_ADD}" ${key}
done

cd "$DIR/../../actor-notify-email"
docker-compose run --rm -e "GMAIL_USER=$GMAIL_USER" -e "GMAIL_PASSWORD=$GMAIL_PASSWORD" -e "CONTAINS=Bucurestii" actor-notify-email
docker-compose run --rm -e "GMAIL_USER=$GMAIL_USER" -e "GMAIL_PASSWORD=$GMAIL_PASSWORD" -e "SECTOR=1" actor-notify-email
docker-compose run --rm -e "GMAIL_USER=$GMAIL_USER" -e "GMAIL_PASSWORD=$GMAIL_PASSWORD" -e "AD_TYPE=executare" actor-notify-email
