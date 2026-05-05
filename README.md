# Crumb

Block cookie nags in Firefox. Don't give a crumb.

A minimal, declarative cookie-banner blocker. No telemetry, no DOM scanning, no
"reject all" auto-clicking — just hides the banner and blocks the scripts.

## How it works

Three outputs are generated from a set of source filter lists at build time:

- **`extension/data/dnr-rules.json`** — a `declarativeNetRequest` static
  ruleset that blocks consent-management scripts at the network layer.
- **`extension/data/generic.css`** — element-hide rules with no domain scope,
  injected on every page via `content_scripts`.
- **`extension/data/cosmetic.js`** — a `{ hostname: "selectors" }` lookup
  table consumed by a ~25-line content script that walks parent domains and
  inserts a single `<style>` at `document_start`.

That's the entire runtime. No background script.

## Source lists

Source-of-truth lives in `data/` and follows the same layout as
[Hush](https://github.com/oblador/hush):

| File | Purpose |
| --- | --- |
| `data/vendor/fanboy-cookiemonster.txt` | Pinned snapshot of [Fanboy's Cookie Monster](https://easylist.to/) |
| `data/generic.txt` | Element-hide rules with no domain scope |
| `data/site-specific.txt` | Per-domain element-hide and network rules |
| `data/third-party.txt` | Cross-site network blocks |
| `data/ignored.txt` | Subtractive: lines here are stripped from sources before parsing |

## Build

```sh
npm install
npm run build       # writes extension/data/{dnr-rules.json,generic.css,cosmetic.js}
npm run dev         # web-ext run — launches Firefox with the extension loaded
npm run lint        # web-ext lint
npm run package     # minified build + zipped artifact in web-ext-artifacts/
```

## Credits

- Filter list strategy and curated overlay structure are adapted from
  [Hush](https://github.com/oblador/hush) by Joel Arvidsson (MIT).
- [Fanboy's Cookie Monster](https://easylist.to/) by Ryan Brown
  ([CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)).

## License

MIT — see [LICENSE](LICENSE).
