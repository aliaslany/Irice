import { rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CertificateUploadError, readCertificateFile, saveCertificateFile } from "./storage";

const STORAGE_DIR = path.join(process.cwd(), "var", "certificates");

afterEach(async () => {
  await rm(STORAGE_DIR, { recursive: true, force: true });
});

describe("saveCertificateFile()", () => {
  it("saves a PDF and returns a served-file URL under a random name, not the original", async () => {
    const bytes = new TextEncoder().encode("%PDF-1.4 fake pdf content");
    const url = await saveCertificateFile(bytes, "آزمایش آلوده.pdf");

    expect(url).toMatch(/^\/certificates\/file\/[0-9a-f-]+\.pdf$/);
    const storedName = url.split("/").pop()!;
    const written = await readCertificateFile(storedName);
    expect(written.toString()).toBe("%PDF-1.4 fake pdf content");
  });

  it("accepts jpg/jpeg/png in addition to pdf", async () => {
    for (const ext of ["jpg", "jpeg", "png"]) {
      const url = await saveCertificateFile(new Uint8Array([1, 2, 3]), `scan.${ext}`);
      expect(url.endsWith(`.${ext}`)).toBe(true);
    }
  });

  it("refuses a disallowed extension", async () => {
    await expect(saveCertificateFile(new Uint8Array([1]), "malware.exe")).rejects.toThrow(
      CertificateUploadError,
    );
  });

  it("refuses an empty file", async () => {
    await expect(saveCertificateFile(new Uint8Array([]), "empty.pdf")).rejects.toThrow(
      CertificateUploadError,
    );
  });

  it("refuses a file over the size limit", async () => {
    const tooBig = new Uint8Array(10 * 1024 * 1024 + 1);
    await expect(saveCertificateFile(tooBig, "huge.pdf")).rejects.toThrow(CertificateUploadError);
  });

  it("never trusts a directory-traversal filename", async () => {
    const url = await saveCertificateFile(new Uint8Array([1]), "../../../etc/passwd.pdf");
    // The extension check passes (.pdf), but the STORED name is always a
    // fresh random uuid — the malicious path component never reaches disk.
    expect(url).not.toContain("..");
    expect(url).toMatch(/^\/certificates\/file\/[0-9a-f-]+\.pdf$/);
  });
});

describe("readCertificateFile()", () => {
  it("refuses anything that isn't exactly the generated filename shape", async () => {
    await expect(readCertificateFile("../../../etc/passwd")).rejects.toThrow(CertificateUploadError);
    await expect(readCertificateFile("not-a-uuid.pdf")).rejects.toThrow(CertificateUploadError);
    await expect(readCertificateFile("00000000-0000-0000-0000-000000000000.exe")).rejects.toThrow(
      CertificateUploadError,
    );
  });

  it("rejects a well-formed name that was never actually written", async () => {
    await expect(readCertificateFile("00000000-0000-0000-0000-000000000000.pdf")).rejects.toThrow();
  });
});
