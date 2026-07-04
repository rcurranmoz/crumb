import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAll } from "./src/parse.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const SOURCES = [
  "data/vendor/fanboy-cookiemonster.txt",
  "data/generic.txt",
  "data/third-party.txt",
  "data/site-specific.txt",
];
const IGNORE = "data/ignored.txt";

const read = (p) => readFileSync(resolve(root, p), "utf8");

const ignored = new Set(
  read(IGNORE).split("\n").map((l) => l.trim()).filter(Boolean),
);

const stripIgnored = (text) =>
  text
    .split("\n")
    .filter((line) => !ignored.has(line.trim()))
    .join("\n");

const rules = SOURCES.flatMap((src) => parseAll(stripIgnored(read(src))));

// Cosmetic: domain → Set<selector>; "" key holds generic (no-domain) selectors.
const cosmetic = new Map();
const addSelector = (domain, selector) => {
  if (!cosmetic.has(domain)) cosmetic.set(domain, new Set());
  cosmetic.get(domain).add(selector);
};

const dnr = [];

for (const rule of rules) {
  if (rule.kind === "network") {
    dnr.push(rule);
  } else if (rule.kind === "hide") {
    if (rule.domains.length === 0) addSelector("", rule.selector);
    else for (const d of rule.domains) addSelector(d, rule.selector);
  } else if (rule.kind === "hide-exception") {
    for (const d of rule.domains) {
      cosmetic.get(d)?.delete(rule.selector);
    }
  }
}

// Network output: assign IDs and a default priority.
const dnrOut = dnr.map((r, i) => ({
  id: i + 1,
  priority: r.action.type === "allow" ? 2 : 1,
  action: r.action,
  condition: r.condition,
}));

// Cosmetic output: { hostname: "sel1, sel2" } — runtime joins into one rule.
// "" key holds generic selectors (for counting only; CSS is handled by generic.css).
const cosmeticOut = {};
for (const [domain, selectors] of cosmetic) {
  if (selectors.size === 0) continue;
  cosmeticOut[domain] = [...selectors].join(",\n");
}

// Generic CSS: one combined rule, hidden everywhere.
const generic = cosmetic.get("");
const genericCss = generic && generic.size
  ? `${[...generic].join(",\n")} { display: none !important; }\n`
  : "";

const outDir = resolve(root, "extension", "data");
mkdirSync(outDir, { recursive: true });

const minify = process.env.MINIFY === "1";
const json = (data) =>
  minify ? JSON.stringify(data) : JSON.stringify(data, null, 2);

writeFileSync(resolve(outDir, "dnr-rules.json"), json(dnrOut));
writeFileSync(resolve(outDir, "generic.css"), genericCss);
// Cosmetic data ships as a JS file so content_scripts can read it via shared
// scope without an extra fetch on every navigation.
writeFileSync(
  resolve(outDir, "cosmetic.js"),
  `globalThis.__crumbCosmetic = ${json(cosmeticOut)};\n`,
);

// Auto-reject map (opt-in, see auto-reject.js): domain → "reject all" button
// selector for full-page consent portals. Hand-authored, not filter-derived,
// so just pass it through in the same shared-scope JS format as cosmetic.js.
const autoReject = JSON.parse(read("data/auto-reject.json"));
writeFileSync(
  resolve(outDir, "auto-reject.js"),
  `globalThis.__crumbAutoReject = ${json(autoReject)};\n`,
);

const networkBlocks = dnrOut.filter((r) => r.action.type === "block").length;
const networkAllows = dnrOut.filter((r) => r.action.type === "allow").length;
const cosmeticDomains = Object.keys(cosmeticOut).length;
const cosmeticSelectors = Object.values(cosmeticOut)
  .reduce((sum, s) => sum + s.split(",\n").length, 0);
const genericSelectors = generic?.size ?? 0;

console.log(`network block:   ${networkBlocks}`);
console.log(`network allow:   ${networkAllows}`);
console.log(`cosmetic domains:${cosmeticDomains}`);
console.log(`cosmetic rules:  ${cosmeticSelectors}`);
console.log(`generic rules:   ${genericSelectors}`);
