#!/bin/sh

set -eu

version=${1:-}

if [ -z "$version" ]; then
  printf '%s\n' 'Usage: npm run release-claude -- <version>' >&2
  exit 1
fi

case "$version" in
  *[!0-9.]* | '' | *.*.*.* | .* | *.)
    printf '%s\n' 'Version must be in X.Y.Z format.' >&2
    exit 1
    ;;
esac

npm version "$version" --no-git-tag-version --prefix packages/claude-code-plugin

node - "$version" <<'EOF'
const fs = require("node:fs");

const version = process.argv[2];

const pluginManifestPath = "packages/claude-code-plugin/.claude-plugin/plugin.json";
const pluginManifest = JSON.parse(fs.readFileSync(pluginManifestPath, "utf8"));
pluginManifest.version = version;
fs.writeFileSync(pluginManifestPath, `${JSON.stringify(pluginManifest, null, 2)}\n`);

const marketplacePath = ".claude-plugin/marketplace.json";
const marketplace = JSON.parse(fs.readFileSync(marketplacePath, "utf8"));
const plugin = marketplace.plugins.find(entry => entry.name === "claude-magic-compact");

if (!plugin) {
  throw new Error("Marketplace entry claude-magic-compact not found.");
}

if (!plugin.source || plugin.source.source !== "npm") {
  throw new Error("Marketplace entry claude-magic-compact must use npm source.");
}

plugin.source.version = version;
fs.writeFileSync(marketplacePath, `${JSON.stringify(marketplace, null, 2)}\n`);
EOF

git add \
  ".claude-plugin/marketplace.json" \
  "packages/claude-code-plugin/.claude-plugin/plugin.json" \
  "packages/claude-code-plugin/package.json"
git commit -m "claude@v$version"
git tag "claude@v$version"
git push origin main --follow-tags
