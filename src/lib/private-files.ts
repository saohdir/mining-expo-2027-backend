import {createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID} from "node:crypto";
import {mkdir, readFile, writeFile} from "node:fs/promises";
import path from "node:path";

/** Private, encrypted-at-rest storage for sensitive uploads (payment proofs, NFR-28).
 * Files are never served publicly; only authorized API routes decrypt them. */
function key() {
  const raw = process.env.PRIVATE_FILE_KEY || process.env.QR_ENCRYPTION_KEY;
  if (!raw || raw.length < 32) throw new Error("PRIVATE_FILE_KEY/QR_ENCRYPTION_KEY not configured");
  return createHash("sha256").update("imdx-private-file:" + raw).digest();
}
const dir = () => process.env.PRIVATE_FILE_DIR || path.resolve(".data/private");
export async function storePrivate(bytes: Buffer, ext: string) {
  const id = randomUUID() + "." + ext.replace(/[^a-z0-9]/g, "");
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(bytes), c.final()]);
  await mkdir(dir(), {recursive: true, mode: 0o700});
  await writeFile(path.join(dir(), id), Buffer.concat([iv, c.getAuthTag(), body]), {flag: "wx", mode: 0o600});
  return id;
}
export async function readPrivate(id: string) {
  if (!/^[0-9a-f-]{36}\.(png|jpg|webp|pdf)$/.test(id)) throw new Error("Bad key");
  const raw = await readFile(path.join(dir(), id));
  const d = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]);
}
export const PROOF_TYPES: Record<string, {ext: string; magic: number[]}> = {
  "image/png": {ext: "png", magic: [0x89, 0x50, 0x4e, 0x47]},
  "image/jpeg": {ext: "jpg", magic: [0xff, 0xd8, 0xff]},
  "image/webp": {ext: "webp", magic: [0x52, 0x49, 0x46, 0x46]},
  "application/pdf": {ext: "pdf", magic: [0x25, 0x50, 0x44, 0x46]}
};
export function sniff(bytes: Buffer, mime: string) {
  const t = PROOF_TYPES[mime];
  return !!t && t.magic.every((b, i) => bytes[i] === b);
}
