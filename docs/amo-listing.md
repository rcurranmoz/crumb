# AMO listing copy (draft)

Paste these into the corresponding fields at
<https://addons.mozilla.org/developers/addon/submit/>.

---

## Name
Crumb

## Summary (max 250 characters)
Block cookie nags. Don't give a crumb. A minimal, declarative cookie-banner
blocker — no telemetry, no DOM scanning, no auto-clicking. Just hides the
banner and blocks the scripts.

## Description (long)
Crumb hides cookie-consent banners and blocks the scripts that load them.
That's it.

**What makes Crumb different**

- **Declarative.** Crumb ships a fixed list of CSS selectors and network
  rules built from Fanboy's Cookie Monster list plus a small curated overlay.
  The browser's built-in declarativeNetRequest engine does the network
  blocking. A 25-line content script handles the per-domain stylesheet.
- **No telemetry.** Crumb has no background script, no remote calls, no
  analytics, no crash reporting. Nothing leaves your browser.
- **No auto-clicking.** Crumb does not press "Reject All" buttons or
  interact with consent dialogs. Under GDPR you must explicitly consent to
  non-essential cookies; sites that respect that will treat a hidden banner
  as no consent given.
- **Open source, MIT.** Every filter and every line of code is on GitHub.

**Credits**

Crumb is a Firefox port of [Hush](https://github.com/oblador/hush) by Joel
Arvidsson. Filter list courtesy of
[Fanboy](https://easylist.to/) (CC BY 3.0).

## Categories
- Primary: Privacy & Security
- Secondary: Web Development (or omit)

## Tags
cookies, gdpr, privacy, banners, consent, ccpa

## Support email
<rcurran@mozilla.com>  <!-- or a public alias if you'd rather not -->

## Support site
<https://github.com/rcurranmoz/crumb/issues>

## Privacy policy URL
<https://github.com/rcurranmoz/crumb/blob/main/PRIVACY.md>

## Homepage URL
<https://github.com/rcurranmoz/crumb>

## License
MIT (matches LICENSE in repo root).

---

## Source code submission notes (for AMO reviewers)

Crumb is built from filter-list source files into three runtime artifacts:

```sh
npm install
npm run build:min
```

This regenerates everything under `extension/data/`:
- `dnr-rules.json` — declarativeNetRequest static ruleset
- `generic.css` — domain-less element-hide rules
- `cosmetic.js` — domain → selectors lookup, read by `extension/inject.js`

The runtime is `extension/inject.js` (≈25 lines) and `extension/manifest.json`.
There is no minification or obfuscation; the only code transformation is
JSON-stringifying the parsed filter rules.
