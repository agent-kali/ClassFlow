#!/usr/bin/env bash
set -euo pipefail

# Remote deploy script executed on the VPS host.
# Requirements: docker, docker compose, project repository checked out.

PROJECT_DIR="$(pwd)"
ENV_FILE="${ENV_FILE:-.env}"  # Path to environment file relative to project

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is not installed" >&2
  exit 1
fi

if ! command -v docker compose >/dev/null 2>&1; then
  echo "Docker Compose plugin is not installed" >&2
  exit 1
fi

if [[ ! -f docker-compose.yml ]]; then
  echo "docker-compose.yml not found in ${PROJECT_DIR}" >&2
  exit 1
fi

echo "Using environment file: ${ENV_FILE}"
if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Environment file ${ENV_FILE} missing. Aborting." >&2
  exit 1
fi

echo "Pulling latest images..."
docker compose pull || true

echo "Building images..."
docker compose build

# Ensure services stop cleanly before update
if docker compose ps &>/dev/null; then
  echo "Stopping existing containers..."
  docker compose down --remove-orphans
fi

echo "Starting containers in detached mode..."
docker compose up -d --remove-orphans

echo "Running migrations (placeholder)..."
# Example: docker compose exec backend alembic upgrade head

docker compose ps

echo "Pruning dangling images..."
docker image prune -f

echo "Deployment complete."
