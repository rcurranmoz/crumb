# Crumb — Privacy Policy

**Effective date: 2026-05-05**

Crumb is a content-blocking extension for Firefox. It does not collect, store,
transmit, or share any data about you, your browsing, or your device.

## What Crumb does

When you visit a web page, Crumb inserts a stylesheet that hides cookie-consent
banners, and the browser's built-in `declarativeNetRequest` engine blocks a
fixed list of consent-management scripts at the network layer. Both the
stylesheet contents and the network rules are bundled with the extension and
do not change at runtime.

## What Crumb does not do

- No telemetry, analytics, crash reporting, or usage metrics.
- No remote configuration or rule fetching after install.
- No reading or transmission of page content, form data, cookies, or browsing
  history.
- No background script and no persistent storage.
- No advertising or third-party SDKs.

## Permissions

Crumb requests two permissions, both used solely for the local blocking
described above:

- `declarativeNetRequest` — to install the static block list.
- `<all_urls>` host access — to inject the stylesheet on every page.

Neither permission is used for data collection.

## Source code

Crumb is open source under the MIT license. The full source — including every
filter list and the build pipeline that produces the extension — lives at
<https://github.com/rcurran/crumb>.

## Contact

Issues or questions: <https://github.com/rcurran/crumb/issues>.
