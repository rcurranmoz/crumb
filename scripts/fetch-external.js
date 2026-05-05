import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const destDir = resolve(__dirname, "..", "data", "vendor");

const SOURCES = {
  "fanboy-cookiemonster": "https://secure.fanboy.co.nz/fanboy-cookiemonster.txt",
};

// Drop uBlock-specific pseudoclasses we cannot translate to plain CSS.
const isUnsupportedSelector = (line) =>
  line.includes(":has-text") ||
  line.includes(":xpath") ||
  line.includes(":-abp");

await Promise.all(
  Object.entries(SOURCES).map(async ([name, url]) => {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Fetching ${url} failed with status ${response.status}`);
    }
    const filtered = (await response.text())
      .split("\n")
      .filter((line) => !isUnsupportedSelector(line))
      .join("\n");
    const dest = resolve(destDir, `${name}.txt`);
    await writeFile(dest, filtered);
    console.info(`Saved ${url} → ${dest}`);
  }),
);
