/**
 * The real eNamad trust-seal embed — Iran's government e-commerce
 * accreditation — or nothing. See globals/config.ts's ENAMAD_ID/ENAMAD_CODE
 * doc comment: those values only exist after the business has actually
 * registered at enamad.ir and been issued a real id/code pair. This
 * component must never render a placeholder, a "coming soon" seal, or any
 * other stand-in — an unverified trust badge is worse than no badge.
 *
 * The markup below (a link to trustseal.enamad.ir wrapping their logo
 * image, both carrying `id` and `Code`) is enamad.ir's own standard embed
 * snippet format, not something invented here.
 */
import { loadEnv } from "../globals/config";

export function EnamadBadge() {
  const env = loadEnv();
  if (!env.ENAMAD_ID || !env.ENAMAD_CODE) return null;

  return (
    <a
      href={`https://trustseal.enamad.ir/?id=${env.ENAMAD_ID}&Code=${env.ENAMAD_CODE}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="نماد اعتماد الکترونیکی"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- an external trust-seal image enamad.ir serves and signs itself; it can't route through next/image. */}
      <img
        src={`https://trustseal.enamad.ir/logo.aspx?id=${env.ENAMAD_ID}&Code=${env.ENAMAD_CODE}`}
        alt="نماد اعتماد الکترونیکی"
        width={80}
        height={80}
      />
    </a>
  );
}
