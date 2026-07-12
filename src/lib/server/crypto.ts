import crypto from "crypto";

// AES-256-GCM for API keys at rest. Keys are only ever decrypted server-side
// when a request to an AI provider is made — never sent back to the browser
// (scope document, Information Security section). SERVER-ONLY.

function key() {
  return crypto
    .createHash("sha256")
    .update(process.env.API_KEY_ENCRYPTION_SECRET!)
    .digest();
}

export function encrypt(plainText: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((b) => b.toString("base64")).join(".");
}

export function decrypt(payload: string): string {
  const [iv, tag, encrypted] = payload
    .split(".")
    .map((part) => Buffer.from(part, "base64"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString("utf8");
}
