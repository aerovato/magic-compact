#!/bin/sh

set -eu

version=${1:-}

if [ -z "$version" ]; then
  printf '%s\n' 'Usage: npm run release-opencode -- <version>' >&2
  exit 1
fi

case "$version" in
  *[!0-9.]* | '' | *.*.*.* | .* | *.)
    printf '%s\n' 'Version must be in X.Y.Z format.' >&2
    exit 1
    ;;
esac

cd packages/opencode-plugin
npm version "$version" --git-tag-version --tag-version-prefix='opencode@v'
git push origin main --follow-tags
