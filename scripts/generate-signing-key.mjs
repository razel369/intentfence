import { webcrypto } from "node:crypto";
import { writeFile } from "node:fs/promises";

const privateKeyPath = process.argv[2];
if (!privateKeyPath) {
  throw new Error("Pass a destination path for the private JWK.");
}

const kid = "intentfence-es256-2026-07";
const keyPair = await webcrypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"],
);

const publicJwk = await webcrypto.subtle.exportKey("jwk", keyPair.publicKey);
const privateJwk = await webcrypto.subtle.exportKey("jwk", keyPair.privateKey);

for (const jwk of [publicJwk, privateJwk]) {
  jwk.alg = "ES256";
  jwk.kid = kid;
  jwk.use = "sig";
}

await writeFile(privateKeyPath, JSON.stringify(privateJwk), {
  encoding: "utf8",
  mode: 0o600,
});

process.stdout.write(`${JSON.stringify(publicJwk)}\n`);
