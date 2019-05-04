#!/usr/bin/env bash

cd ../cheerio-scraper

FORCE_ADD=0
if [[ -n "$1" ]]; then
    FORCE_ADD=$1
fi

for file in ../storage/fn/*.js; do
    key=$(basename ${file%.*})
    echo "Running ${key}"
    docker-compose run --rm -e "FORCE_ADD=${FORCE_ADD}" ${key}
done

cd ../../actor-notify-email
docker-compose run --rm -e "GMAIL_USER=$GMAIL_USER" -e "GMAIL_PASSWORD=$GMAIL_PASSWORD" -e "CONTAINS=Bucurestii" actor-notify-email
docker-compose run --rm -e "GMAIL_USER=$GMAIL_USER" -e "GMAIL_PASSWORD=$GMAIL_PASSWORD" -e "SECTOR=1" actor-notify-email
docker-compose run --rm -e "GMAIL_USER=$GMAIL_USER" -e "GMAIL_PASSWORD=$GMAIL_PASSWORD" -e "TYPE=executare" actor-notify-email
