/**
 * Serves an uploaded certificate on every request, reading it fresh from
 * disk — see modules/certificates/storage.ts for why this can't just be a
 * file under `public/`.
 */
import { NextResponse } from "next/server";
import { readCertificateFile } from "../../../../modules/certificates/storage";

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ filename: string }> },
): Promise<NextResponse> {
  const { filename } = await params;

  let bytes: Buffer;
  try {
    bytes = await readCertificateFile(filename);
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const contentType = CONTENT_TYPE_BY_EXT[ext] ?? "application/octet-stream";

  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "content-type": contentType,
      // The filename is a fresh random uuid every time — the same URL never
      // points at different content, so this is safe to cache forever.
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
