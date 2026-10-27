#!/bin/sh
# Extracts the engine/UI <script>s from index.html and runs the Node tests.
cd "$(dirname "$0")"
node -e 'const fs=require("fs");const h=fs.readFileSync("../index.html","utf8");[...h.matchAll(/<script id="(\w+)">([\s\S]*?)<\/script>/g)].forEach(x=>fs.writeFileSync(x[1]+".js",x[2]));' \
 && node --check engine.js && node --check ui.js && node engine.test.js && node ui.test.js; s=$?; rm -f engine.js ui.js; exit $s
