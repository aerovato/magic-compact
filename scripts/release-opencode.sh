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

npm version "$version" --no-git-tag-version --workspaces=false --prefix packages/opencode-plugin

git add "packages/opencode-plugin/package.json"
git commit -m "opencode@v$version"
git tag "opencode@v$version"
git push origin main "opencode@v$version"
