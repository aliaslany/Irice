/**
 * Certificate file storage — local disk, not S3.
 *
 * docs/ARCHITECTURE.md's storage plan calls for S3-compatible object
 * storage; this is the interim path for a self-hosted deployment (a single
 * `next start` process on a VPS with a persistent disk, which is what this
 * project actually targets — see docs/ARCHITECTURE.md's stack choice).
 *
 * This will NOT work on an ephemeral/serverless host (Vercel and similar):
 * the filesystem there is read-only or reset between invocations, so an
 * upload would vanish. Swapping this module for an S3-compatible client is
 * the entire migration — nothing else in modules/admin or the lot passport
 * page needs to change, since both only ever see the returned URL.
 *
 * Deliberately NOT under `public/`: `next start` serves `public/` through a
 * static-asset path that is resolved once at boot, so a file written there
 * while the server is already running 404s until the next restart — verified
 * by hand (upload, fetch → 404; restart, fetch the same file → 200). Storing
 * outside `public/` and serving through the route handler at
 * app/certificates/file/[filename]/route.ts, which reads the file fresh on
 * every request, sidesteps that cache entirely.
 */
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const STORAGE_DIR = path.join(process.cwd(), "var", "certificates");
const PUBLIC_URL_PREFIX = "/certificates/file";

const ALLOWED_EXTENSIONS = new Set([".pdf", ".jpg", ".jpeg", ".png"]);
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10MB — a scanned lab report, not a video

/** Matches exactly what saveCertificateFile() generates — a fresh uuid plus an allowed extension. */
const STORED_FILENAME_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpe?g|png)$/i;

export class CertificateUploadError extends Error {
  override readonly name = "CertificateUploadError";
}

function sanitizeExtension(originalFilename: string): string {
  const ext = path.extname(originalFilename).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new CertificateUploadError(
      `پسوند فایل مجاز نیست. فرمت‌های مجاز: ${[...ALLOWED_EXTENSIONS].join(", ")}`,
    );
  }
  return ext;
}

/** Saves the file under a random name — never the customer/admin-supplied one, which is untrusted input. */
export async function saveCertificateFile(bytes: Uint8Array, originalFilename: string): Promise<string> {
  if (bytes.byteLength === 0) {
    throw new CertificateUploadError("فایل خالی است.");
  }
  if (bytes.byteLength > MAX_FILE_BYTES) {
    throw new CertificateUploadError("حجم فایل نباید بیشتر از ۱۰ مگابایت باشد.");
  }
  const ext = sanitizeExtension(originalFilename);
  const storedName = `${randomUUID()}${ext}`;

  await mkdir(STORAGE_DIR, { recursive: true });
  await writeFile(path.join(STORAGE_DIR, storedName), bytes);

  return `${PUBLIC_URL_PREFIX}/${storedName}`;
}

/**
 * Read a stored certificate back by its filename, for the route handler
 * that serves it. The filename must be exactly the shape
 * {@link saveCertificateFile} generates — this is the one check standing
 * between a request and an arbitrary path on disk, so it rejects anything
 * else rather than trying to sanitise it.
 */
export async function readCertificateFile(filename: string): Promise<Buffer> {
  if (!STORED_FILENAME_PATTERN.test(filename)) {
    throw new CertificateUploadError("نام فایل نامعتبر است.");
  }
  return readFile(path.join(STORAGE_DIR, filename));
}
