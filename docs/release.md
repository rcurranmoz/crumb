# Release flow

Releases happen automatically on merge to `main` when the version in
`extension/manifest.json` is bumped relative to the previous commit.
The pipeline lives in [`.github/workflows/release.yml`](../.github/workflows/release.yml)
and the upload script in [`scripts/amo-upload.js`](../scripts/amo-upload.js).

## What it does

1. Detects the version bump by diffing `extension/manifest.json` against `HEAD~1`. If unchanged, the job exits silently — docs-only merges don't trigger a release.
2. `npm ci && npm run package` — produces `web-ext-artifacts/crumb-<version>.zip`.
3. `git archive` against the merge commit — produces `web-ext-artifacts/crumb-<version>-source.zip`.
4. Uploads both to AMO via the v5 REST API as a single `listed` version (`POST /addons/upload/`, poll `GET /addons/upload/{uuid}/` for validation, then `POST /addons/addon/<gecko-id>/versions/` with `upload` + `source`).
5. Creates a GitHub release tagged `v<version>` with both zips attached and auto-generated commit-log release notes.

## Required secrets

In **Settings → Secrets and variables → Actions** on the repo:

| Name | Value |
|---|---|
| `AMO_JWT_ISSUER` | The "JWT issuer" string from <https://addons.mozilla.org/developers/addon/api/key/> |
| `AMO_JWT_SECRET` | The "JWT secret" string from the same page |

The workflow won't succeed until both exist.

## Local dry-run

To exercise the upload flow from your laptop (e.g., to test a fix before
merging), pull the secrets from your password manager and run:

```sh
export AMO_JWT_ISSUER=...
export AMO_JWT_SECRET=...

npm run package
VERSION=$(jq -r .version extension/manifest.json)
git archive --format=zip --prefix=crumb-${VERSION}-source/ \
  -o web-ext-artifacts/crumb-${VERSION}-source.zip HEAD

npm run release:upload
```

This is functionally identical to what CI does and uploads to the live
listing, so only run it when you actually want to publish.

## Failure modes

- **`validation failed: …`** — AMO rejected the xpi. Fix and re-merge with another version bump (AMO won't accept the same version twice, even on retry).
- **`409` on version create** — the version already exists on AMO. Bump and re-merge.
- **`401`** — JWT auth error. The API key may have been rotated; update the GH Actions secrets.
- **Validation timeout** — the script polls for up to 5 minutes. If AMO is slow, retry by re-running the workflow.
