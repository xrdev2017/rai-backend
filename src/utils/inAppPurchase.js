import jwt from "jsonwebtoken";
import crypto from "crypto";

/**
 * Generates a signed JWT for Apple App Store Server API authentication.
 *
 * Required env vars:
 *   APPLE_ISSUER_ID   - Issuer ID from App Store Connect
 *   APPLE_KEY_ID      - Key ID of the .p8 private key
 *   APPLE_PRIVATE_KEY - Contents of the .p8 file (PEM format)
 *
 * @returns {string} Signed JWT bearer token
 */
export function generateAppleJWT() {
  const issuerId = process.env.APPLE_ISSUER_ID;
  const keyId = process.env.APPLE_KEY_ID;
  let rawKey = process.env.APPLE_PRIVATE_KEY;

  if (!issuerId || !keyId || !rawKey) {
    throw new Error(
      "Missing Apple credentials: APPLE_ISSUER_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY are required."
    );
  }

  // Normalize the PEM key: handle both literal \n text and real newlines
  rawKey = rawKey.replace(/\\n/g, "\n");

  // If header/footer are glued to the body (no newline after BEGIN / before END), fix it
  rawKey = rawKey
    .replace(/(-----BEGIN [A-Z ]+-----)([^\n])/, "$1\n$2")
    .replace(/([^\n])(-----END [A-Z ]+-----)/, "$1\n$2");

  // Create a proper KeyObject so jsonwebtoken always recognises it as an EC key
  const privateKey = crypto.createPrivateKey({
    key: rawKey,
    format: "pem",
  });

  const now = Math.floor(Date.now() / 1000);

  const payload = {
    iss: issuerId,
    iat: now,
    exp: now + 60 * 60, // 1 hour expiry (Apple max is 1 hour)
    aud: "appstoreconnect-v1",
    bid: process.env.APPLE_BUNDLE_ID,
  };

  const token = jwt.sign(payload, privateKey, {
    algorithm: "ES256",
    header: {
      alg: "ES256",
      kid: keyId,
      typ: "JWT",
    },
  });

  console.log(`\x1b[33mAPPLE Token: ${token}\x1b[0m`);

  return token;
}
