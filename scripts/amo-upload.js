#!/usr/bin/env node
// Upload the built xpi + source zip for the current manifest version to AMO.
// Used by .github/workflows/release.yml after a version bump merges to main,
// and locally via `npm run release:upload`.
import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import crypto from "node:crypto";

const ISSUER = process.env.AMO_JWT_ISSUER;
const SECRET = process.env.AMO_JWT_SECRET;

if (!ISSUER || !SECRET) {
  console.error("Missing AMO_JWT_ISSUER or AMO_JWT_SECRET in environment.");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync("extension/manifest.json", "utf8"));
const VERSION = manifest.version;
const ADDON_ID = manifest.browser_specific_settings?.gecko?.id;
if (!ADDON_ID) {
  console.error("manifest.browser_specific_settings.gecko.id not set.");
  process.exit(1);
}

const CHANNEL = "listed";
const API = "https://addons.mozilla.org/api/v5";

const xpiPath = resolve(`web-ext-artifacts/crumb-${VERSION}.zip`);
const sourcePath = resolve(`web-ext-artifacts/crumb-${VERSION}-source.zip`);

for (const p of [xpiPath, sourcePath]) {
  try {
    statSync(p);
  } catch {
    console.error(`Missing artifact: ${p}`);
    console.error("Run `npm run package` and `git archive` first.");
    process.exit(1);
  }
}

const b64url = (buf) =>
  Buffer.from(buf)
    .toString("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

// Per addons-server: HS256 JWT, short-lived (max 5min), one-shot jti.
const jwt = () => {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const body = b64url(
    JSON.stringify({
      iss: ISSUER,
      jti: crypto.randomUUID(),
      iat: now,
      exp: now + 60,
    }),
  );
  const sig = b64url(
    crypto.createHmac("sha256", SECRET).update(`${header}.${body}`).digest(),
  );
  return `${header}.${body}.${sig}`;
};

const auth = () => ({ Authorization: `JWT ${jwt()}` });

const fileBlob = (path) => new Blob([readFileSync(path)]);

const uploadXpi = async () => {
  const form = new FormData();
  form.append("upload", fileBlob(xpiPath), `crumb-${VERSION}.zip`);
  form.append("channel", CHANNEL);
  const r = await fetch(`${API}/addons/upload/`, {
    method: "POST",
    headers: auth(),
    body: form,
  });
  if (!r.ok) {
    throw new Error(`xpi upload failed (${r.status}): ${await r.text()}`);
  }
  return (await r.json()).uuid;
};

const waitValid = async (uuid) => {
  for (let i = 0; i < 60; i++) {
    const r = await fetch(`${API}/addons/upload/${uuid}/`, { headers: auth() });
    if (!r.ok) {
      throw new Error(`upload status check failed (${r.status})`);
    }
    const data = await r.json();
    if (data.processed) {
      if (!data.valid) {
        throw new Error(
          `validation failed:\n${JSON.stringify(data.validation, null, 2)}`,
        );
      }
      return;
    }
    process.stdout.write(".");
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error("validation timed out after 5 minutes");
};

const createVersion = async (uuid) => {
  const form = new FormData();
  form.append("upload", uuid);
  form.append("source", fileBlob(sourcePath), `crumb-${VERSION}-source.zip`);
  const r = await fetch(
    `${API}/addons/addon/${encodeURIComponent(ADDON_ID)}/versions/`,
    { method: "POST", headers: auth(), body: form },
  );
  if (!r.ok) {
    throw new Error(`version create failed (${r.status}): ${await r.text()}`);
  }
  return (await r.json()).version ?? VERSION;
};

(async () => {
  console.log(`Uploading crumb ${VERSION} to AMO (${CHANNEL})`);
  console.log(`  xpi:    ${xpiPath}`);
  console.log(`  source: ${sourcePath}`);

  const uuid = await uploadXpi();
  console.log(`Upload UUID: ${uuid}`);

  process.stdout.write("Waiting for validation");
  await waitValid(uuid);
  console.log(" ok");

  const v = await createVersion(uuid);
  console.log(`Created version ${v}.`);
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
