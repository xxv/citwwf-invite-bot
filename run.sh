#!/bin/sh

docker run -d  --name citwwf-bot   --env-file .env   --restart unless-stopped   citwwf-discord-bot
