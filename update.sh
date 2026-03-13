#!/bin/bash

set -e

IMAGE=dunk-discord-bot

git pull
docker build -t "$IMAGE" .

docker stop "$IMAGE" || true
docker rm "$IMAGE" || true

exec docker run --init \
  --name "$IMAGE" \
  --restart unless-stopped \
  -v "$PWD/config.json:/bot/config.json" \
  -v "$PWD/secrets.json:/bot/secrets.json" \
  -v "$PWD/data:/bot/data" \
  -d -t "$IMAGE"