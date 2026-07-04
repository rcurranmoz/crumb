<div align="center">

<img src="assets/icon-source.png" width="180" height="180" alt="Crumb logo" />

# 🍪 Crumb

**Block cookie nags in Firefox. Don't give a crumb.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Firefox MV3](https://img.shields.io/badge/firefox-MV3-orange.svg)](https://addons.mozilla.org/firefox/addon/crumb/)
[![Tests](https://img.shields.io/badge/tests-17%20passing-brightgreen.svg)](scripts/src/parse.test.js)

</div>

---

## ✨ Why Crumb?

Cookie consent banners are the worst thing about the modern web. Crumb makes them go away.

It's a Firefox port of the [Hush](https://github.com/oblador/hush) philosophy — same source-of-truth, same declarative approach, same trust model. Tiny, open, and built for people who trust extensions less the more they do.

### 🥇 vs. "I don't care about cookies" (the abandoned one)

The original was acquired by Avast, now owned by [Gen Digital](https://en.wikipedia.org/wiki/Gen_Digital) — the same conglomerate behind Avast, AVG, and Norton, with a [documented history](https://en.wikipedia.org/wiki/Avast#Jumpshot_subsidiary_data_privacy_scandal) of harvesting user data and selling it. It hasn't shipped a meaningful update in two years and recent reviews say it no longer blocks reliably.

Crumb is built today against a fresh upstream snapshot, has no parent company, no telemetry, no remote configuration, and the entire build pipeline is on GitHub under MIT. If you don't trust the binary, read the source, refresh the filter list yourself, and rebuild from it.

### 🤫 Like Hush

| | Crumb | Hush |
| --- | :-: | :-: |
| No auto-clicking, no scripted UI interaction, by default[^1] | ✅ | ✅ |
| Zero telemetry, zero remote calls | ✅ | ✅ |
| Open source, MIT | ✅ | ✅ |
| Bundled Fanboy's Cookie Monster + curated overlay | ✅ | ✅ |
| Minimal, event-driven runtime | ✅ | ✅ |
| Platform | Firefox | Safari |

[^1]: Off by default. Some cookie walls (Google, Yahoo) are a standalone page rather than a banner over real content, so there's nothing to hide — only an opt-in checkbox in the popup that clicks "Reject all" on the small, hardcoded list of portals in `data/auto-reject.json`. Never auto-*accepts* anything.

---

## 🚀 Install

[![Get the Add-on](https://blog.mozilla.org/addons/files/2020/04/get-the-addon-fx-apr-2020.svg)](https://addons.mozilla.org/firefox/addon/crumb/)

Or load it manually from source — see [Build](#-build) below.

---

## 🛠️ How it works

Three filter outputs are generated from source lists at build time:

- **`extension/data/dnr-rules.json`** — a `declarativeNetRequest` static ruleset that blocks consent-management scripts at the network layer.
- **`extension/data/generic.css`** — element-hide rules with no domain scope, injected on every page via `content_scripts`.
- **`extension/data/cosmetic.js`** — a `{ hostname: "selectors" }` lookup table consumed by the content script.

The runtime is intentionally small and event-driven:

- **Content script** (`inject.js`) — walks parent domains of the current host, inserts a single `<style>` at `document_start`, and once it confirms a banner was hidden, restores `body { overflow }` so the page can scroll past common scroll-lock tricks.
- **Auto-reject content script** (`auto-reject.js`) — opt-in only, scoped via `content_scripts.matches` to the handful of domains in `data/auto-reject.json`. Reads a `browser.storage.local` flag set by the popup checkbox; if enabled, clicks the "Reject all" button on standalone consent-wall pages that have no underlying content to hide.
- **Background script** (`background.js`) — a per-tab message router for the toolbar badge. No timers, no polling, no remote calls.
- **Popup** (`popup.html`) — a status panel showing version, current site, whether a per-host or generic rule fired, the number of elements hidden, and two links — plus one opt-in checkbox for the auto-reject behavior above. No other toggles, no other settings to misconfigure.

## 📚 Source lists

Source-of-truth lives in `data/` and follows the same layout as Hush:

| File | Purpose |
| --- | --- |
| `data/vendor/fanboy-cookiemonster.txt` | Pinned snapshot of [Fanboy's Cookie Monster](https://easylist.to/) |
| `data/generic.txt` | Element-hide rules with no domain scope |
| `data/site-specific.txt` | Per-domain element-hide and network rules |
| `data/third-party.txt` | Cross-site network blocks |
| `data/ignored.txt` | Subtractive — lines here are stripped from sources before parsing |
| `data/auto-reject.json` | Hand-authored `{ hostname: selector }` map for the opt-in auto-reject feature — not filter-derived |

## 🧱 Build

```sh
npm install
npm run fetch       # refresh the Fanboy snapshot from upstream
npm run build       # writes extension/data/{dnr-rules.json,generic.css,cosmetic.js,auto-reject.js}
npm run dev         # web-ext run — launches Firefox with the extension loaded
npm run test        # parser unit tests
npm run lint        # web-ext lint
npm run package     # minified build + zipped artifact in web-ext-artifacts/
```

## 🐛 A site is still showing a banner

Open an [issue](https://github.com/rcurranmoz/crumb/issues) with the URL and, if you can, a CSS selector for the banner element (right-click → Inspect). Most fixes are a one-line addition to `data/site-specific.txt`.

---

## 🙏 Credits

- Filter list strategy and curated overlay structure are adapted from [Hush](https://github.com/oblador/hush) by Joel Arvidsson (MIT).
- [Fanboy's Cookie Monster](https://easylist.to/) by Ryan Brown ([CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)).

## 📄 License

MIT — see [LICENSE](LICENSE).
