#!/usr/bin/env bash
set -euo pipefail

# Remote deploy script executed on the VPS host.
# Requirements: docker, docker compose, project repository checked out.

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed" >&2
  exit 1
fi

if ! command -v docker compose >/dev/null 2>&1; then
  echo "Docker Compose plugin is not installed" >&2
  exit 1
fi

if [[ ! -f docker-compose.yml ]]; then
  echo "docker-compose.yml not found in $(pwd)" >&2
  exit 1
fi

echo "Pulling latest images and building..."
docker compose pull || true
docker compose build

echo "Applying database migrations (if any)..."
# Placeholder: add Alembic migrations or custom DB tasks here
echo "No migrations defined."

echo "Starting containers..."
docker compose up -d --remove-orphans

echo "Pruning dangling images..."
docker image prune -f

echo "Deployment complete."
