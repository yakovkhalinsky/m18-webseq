#!/bin/sh
# Extracts the engine <script> from index.html and runs the Node tests against a mocked MIDI output.
cd "$(dirname "$0")"
node -e 'const fs=require("fs");const h=fs.readFileSync("../index.html","utf8");[...h.matchAll(/<script id="(\w+)">([\s\S]*?)<\/script>/g)].forEach(x=>fs.writeFileSync(x[1]+".js",x[2]));' \
 && node --check engine.js && node --check ui.js && node engine.test.js; s=$?; rm -f engine.js ui.js; exit $s
