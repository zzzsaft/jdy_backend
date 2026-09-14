import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import dotenv from "dotenv";

// No secret values, fingerprints or provider response bodies are printed.
const write = process.argv.includes("--write");
const targetArg = process.argv.indexOf("--connect-dir");
if (targetArg < 0 || !process.argv[targetArg + 1]) throw new Error("--connect-dir is required");
const target = path.resolve(process.argv[targetArg + 1], ".env");
const basePath = path.resolve(".env");
const read = p => fs.existsSync(p) ? dotenv.parse(fs.readFileSync(p)) : {};
const base = read(basePath), production = read(path.resolve(".env.prod")), existing = read(target);
// Match src/config/env.ts: base .env wins, production only fills absent keys.
const source = { ...production, ...base };
const direct = ["DAHUA_CLIENT_ID", "DAHUA_CLIENT_SECRET", "PARKING_SECRET", "XFT_HOST", "XFT_APP_APPID", "XFT_APP_AUTHORITY_SECRET", "XFT_APPID", "XFT_AUTHORITY_SECRET", "XFT_ENTERPRISE_ID", "JDY_API_KEY", "FBT_HOST", "FBT_APPID", "FBT_KEY", "DEEPSEEK_API_KEY", "BESTSIGN_SERVER_HOST", "BESTSIGN_CLIENT_ID", "BESTSIGN_CLIENT_SECRET", "BESTSIGN_PRIVATE_KEY"];
const candidates = Object.fromEntries(direct.map(key => [key, source[key]]));
candidates.AMAP_API_KEY = source.GAODE_KEY;
if (source.JDY_HOST) candidates.JDY_API_BASE_URL = source.JDY_HOST.replace(/\/$/, "") + "/v5";
// SSO encryption needs only a public key. Preserve any existing Connect key.
if (!existing.XFT_SSO_PUBLIC_KEY?.trim()) {
  if (source.RSA_PRIVATE_KEY?.trim()) {
    try {
      const raw = source.RSA_PRIVATE_KEY.trim();
      const pem = raw.includes("-----BEGIN") ? raw : `-----BEGIN RSA PRIVATE KEY-----\n${raw}\n-----END RSA PRIVATE KEY-----`;
      candidates.XFT_SSO_PUBLIC_KEY = crypto.createPublicKey(crypto.createPrivateKey(pem)).export({ type: "spki", format: "pem" }).toString();
    } catch { throw new Error("Unable to derive XFT SSO public key from legacy OA configuration"); }
  } else candidates.XFT_SSO_PUBLIC_KEY = undefined;
}
candidates.XFT_SSO_CONNECTOR_ID = source.XFT_SSO_CONNECTOR_ID || "223147993689554944";
candidates.XFT_SSO_FLOW_ID = source.XFT_SSO_FLOW_ID || "224943279282388992";
const updates = {};
const missing = [];
for (const [key,value] of Object.entries(candidates)) {
  if (existing[key]?.trim()) continue;
  if (value?.trim()) updates[key] = value;
  else missing.push(key);
}
const tokenKey = "CONNECTOR_JDY_BACKEND_TOKEN";
if (existing[tokenKey]?.trim() && base[tokenKey]?.trim() && existing[tokenKey] !== base[tokenKey]) throw new Error("Existing OA and Connect module tokens differ; neither was overwritten");
const moduleToken = existing[tokenKey]?.trim() || base[tokenKey]?.trim() || crypto.randomBytes(32).toString("hex");
if (!existing[tokenKey]?.trim()) updates[tokenKey] = moduleToken;
const oaUpdates = base[tokenKey]?.trim() ? {} : { [tokenKey]: moduleToken };
function append(file, values) {
  if (!Object.keys(values).length) return;
  const lines = Object.entries(values).map(([key,value]) => {
    // Single-quoted dotenv values preserve literal $ and backslashes. Provider values must not contain a single quote.
    if (value.includes("'")) throw new Error(`Unsupported quote in ${key}; no secret printed`);
    return `${key}='${value}'`;
  });
  const encoded = "\n# Connect provider migration: fill missing values only\n" + lines.join("\n") + "\n";
  const parsed = dotenv.parse(encoded);
  for (const [key,value] of Object.entries(values)) if (parsed[key] !== value) throw new Error(`Round-trip failed for ${key}`);
  fs.appendFileSync(file, encoded, { encoding: "utf8", mode: 0o600 });
  const verified = read(file);
  for (const [key,value] of Object.entries(values)) if (verified[key] !== value) throw new Error(`Verification failed for ${key}`);
}
if (write) { append(target, updates); append(basePath, oaUpdates); }
console.log(JSON.stringify({ mode: write ? "written-and-verified" : "dry-run", connectAdded: Object.keys(updates), oaAdded: Object.keys(oaUpdates), missingSource: missing, existingNonemptyValuesPreserved: true }));
