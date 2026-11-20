#!/usr/bin/env sh
# Baut das Image mit dem lokalen Docker – nur linux/arm64 – und pusht es.
set -e

IMAGE="${IMAGE:-ghcr.io/guidoffm/community-site}"
VERSION=$(node -p "require('./package.json').version")

echo "Building $IMAGE:$VERSION (linux/arm64) ..."
docker build \
  --platform linux/arm64 \
  -t "$IMAGE:$VERSION" \
  -t "$IMAGE:latest" \
  .
docker push "$IMAGE:$VERSION"
docker push "$IMAGE:latest"
echo "Done: $IMAGE:$VERSION"
