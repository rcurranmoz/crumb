// Every auto-reject domain needs two hand-synced entries: a selector in
// data/auto-reject.json and a match pattern in the manifest's auto-reject
// content_scripts block. Miss the second and the selector ships but the script
// never loads on that host — nothing else would notice. See issues #54 / #116.
import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const readJson = (p) => JSON.parse(readFileSync(resolve(__dirname, p), "utf8"));

const autoReject = readJson("../data/auto-reject.json");
const manifest = readJson("../extension/manifest.json");

const block = manifest.content_scripts.find((cs) =>
  cs.js.includes("auto-reject.js"),
);
const matchedHosts = block.matches.map((m) => m.match(/^\*:\/\/([^/]+)\/\*$/)?.[1]);

test("every auto-reject.json domain has a manifest match", () => {
  for (const host of Object.keys(autoReject)) {
    assert.ok(matchedHosts.includes(host), `${host} missing from manifest matches`);
  }
});

test("every manifest auto-reject match has a selector", () => {
  for (const host of matchedHosts) {
    assert.ok(host, "match pattern is not of the form *://host/*");
    assert.ok(autoReject[host], `${host} has a manifest match but no selector`);
  }
});
