#!/bin/sh

docker stop citwwf-bot && docker rm citwwf-bot && \
docker build -t citwwf-discord-bot . && \
echo "Ready to run"
