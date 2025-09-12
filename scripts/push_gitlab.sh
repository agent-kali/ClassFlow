#!/usr/bin/env bash
set -euo pipefail

REPO_PATH="/Users/danielalexandrov/Desktop/E-Home-project"

usage() {
  echo "Usage: scripts/push_gitlab.sh <gitlab_repo_url> [--all] [--tags]"
  echo "  <gitlab_repo_url>: e.g. git@gitlab.com:USERNAME/REPO.git (SSH) or https://gitlab.com/USERNAME/REPO.git"
  echo "  --all  Push all branches"
  echo "  --tags Push all tags"
}

REMOTE_URL=""
PUSH_ALL=false
PUSH_TAGS=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --all)  PUSH_ALL=true; shift;;
    --tags) PUSH_TAGS=true; shift;;
    -h|--help) usage; exit 0;;
    *) REMOTE_URL="$1"; shift;;
  esac
done

if [[ -z "${REMOTE_URL:-}" ]]; then
  usage; exit 1
fi

# Ensure we're operating on the repository
if [[ ! -d "$REPO_PATH/.git" ]]; then
  echo "Error: $REPO_PATH is not a git repository"; exit 1
fi

# Configure or update 'gitlab' remote
if git -C "$REPO_PATH" remote get-url gitlab >/dev/null 2>&1; then
  EXISTING_URL="$(git -C "$REPO_PATH" remote get-url gitlab)"
  if [[ "$EXISTING_URL" != "$REMOTE_URL" ]]; then
    git -C "$REPO_PATH" remote set-url gitlab "$REMOTE_URL"
    echo "Updated remote 'gitlab' -> $REMOTE_URL"
  else
    echo "Remote 'gitlab' already set to $REMOTE_URL"
  fi
else
  git -C "$REPO_PATH" remote add gitlab "$REMOTE_URL"
  echo "Added remote 'gitlab' -> $REMOTE_URL"
fi

# Show remotes
git -C "$REPO_PATH" remote -v

# Push
CURRENT_BRANCH="$(git -C "$REPO_PATH" rev-parse --abbrev-ref HEAD || true)"

if [[ "$PUSH_ALL" == true ]]; then
  git -C "$REPO_PATH" push --all gitlab
else
  if [[ -n "$CURRENT_BRANCH" && "$CURRENT_BRANCH" != "HEAD" ]]; then
    git -C "$REPO_PATH" push -u gitlab "$CURRENT_BRANCH"
  else
    echo "Detached HEAD; use --all or checkout a branch to push."
  fi
fi

if [[ "$PUSH_TAGS" == true ]]; then
  git -C "$REPO_PATH" push --tags gitlab
fi

echo "Done."
