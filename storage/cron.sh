#!/usr/bin/env bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR/.."
git pull origin master

cd "$DIR/../cheerio-scraper"

FORCE_ADD=0
if [[ -n "$1" ]]; then
    FORCE_ADD=$1
fi

FORCE_NOTIFY=0
if [[ -n "$2" ]]; then
    FORCE_NOTIFY=$2
fi

USE_SAMPLE=0
if [[ -n "$3" ]]; then
    USE_SAMPLE=$3
fi

/usr/local/bin/docker-compose build
for file in ../storage/fn/*.js; do
    baseFile=$(basename -- ${file})
    key="${baseFile%%.*}"
    if [[ "$key" == "_"* ]]; then continue; fi

    echo "Running ${key}"

    /usr/local/bin/docker-compose run --rm -e "FORCE_ADD=${FORCE_ADD}" -e "SAMPLE=${USE_SAMPLE}" ${key}
done

cd "$DIR/../../actor-notify-email"
git pull origin master

/usr/local/bin/docker-compose build
/usr/local/bin/docker-compose run --rm -e "NOTIFY_TYPE=terenuri" -e "GMAIL_USER=$GMAIL_USER" -e "GMAIL_PASSWORD=$GMAIL_PASSWORD" -e "INCLUDE_NOTIFIED=$FORCE_NOTIFY" -e "CONTAINS=Bucurestii|Jiului|Damaroaia|Bazilescu|Domenii|Mihalache" actor-notify-email
/usr/local/bin/docker-compose run --rm -e "NOTIFY_TYPE=terenuri" -e "GMAIL_USER=$GMAIL_USER" -e "GMAIL_PASSWORD=$GMAIL_PASSWORD" -e "INCLUDE_NOTIFIED=$FORCE_NOTIFY" -e "SECTOR=1" actor-notify-email
/usr/local/bin/docker-compose run --rm -e "NOTIFY_TYPE=terenuri" -e "GMAIL_USER=$GMAIL_USER" -e "GMAIL_PASSWORD=$GMAIL_PASSWORD" -e "INCLUDE_NOTIFIED=$FORCE_NOTIFY" actor-notify-email

/usr/local/bin/docker-compose run --rm -e "SALE_TYPE=executare" -e "NOTIFY_TYPE=terenuri" -e "GMAIL_USER=$GMAIL_USER" -e "GMAIL_PASSWORD=$GMAIL_PASSWORD" -e "INCLUDE_NOTIFIED=$FORCE_NOTIFY" -e "CONTAINS=Bucurestii|Jiului|Damaroaia|Bazilescu|Domenii|Mihalache" actor-notify-email
/usr/local/bin/docker-compose run --rm -e "SALE_TYPE=executare" -e "NOTIFY_TYPE=terenuri" -e "GMAIL_USER=$GMAIL_USER" -e "GMAIL_PASSWORD=$GMAIL_PASSWORD" -e "INCLUDE_NOTIFIED=$FORCE_NOTIFY" -e "SECTOR=1" actor-notify-email
/usr/local/bin/docker-compose run --rm -e "SALE_TYPE=executare" -e "NOTIFY_TYPE=terenuri" -e "GMAIL_USER=$GMAIL_USER" -e "GMAIL_PASSWORD=$GMAIL_PASSWORD" -e "INCLUDE_NOTIFIED=$FORCE_NOTIFY" actor-notify-email

/usr/local/bin/docker-compose run --rm -e "NOTIFY_TYPE=case" -e "GMAIL_USER=$GMAIL_USER" -e "GMAIL_PASSWORD=$GMAIL_PASSWORD" -e "INCLUDE_NOTIFIED=$FORCE_NOTIFY" -e "CONTAINS=Bucurestii|Jiului|Damaroaia|Bazilescu|Domenii|Mihalache" actor-notify-email
/usr/local/bin/docker-compose run --rm -e "NOTIFY_TYPE=case" -e "GMAIL_USER=$GMAIL_USER" -e "GMAIL_PASSWORD=$GMAIL_PASSWORD" -e "INCLUDE_NOTIFIED=$FORCE_NOTIFY" -e "SECTOR=1" actor-notify-email
/usr/local/bin/docker-compose run --rm -e "NOTIFY_TYPE=case" -e "GMAIL_USER=$GMAIL_USER" -e "GMAIL_PASSWORD=$GMAIL_PASSWORD" -e "INCLUDE_NOTIFIED=$FORCE_NOTIFY" actor-notify-email
