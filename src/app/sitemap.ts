import type { MetadataRoute } from "next";
import { listPublicRoutes } from "../modules/catalog/queries";

const SITE_URL = process.env.SITE_URL ?? "https://irice.ir";

export const revalidate = 3600;

/**
 * Variety pages are the acquisition surface and rank highest. Lot passports
 * are listed too — they are the pages a QR scan lands on, and having them
 * indexed is what makes the traceability claim verifiable from outside.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { varieties, lotCodes } = await listPublicRoutes();

  return [
    { url: SITE_URL, changeFrequency: "daily", priority: 1 },
    ...varieties.map((v) => ({
      url: `${SITE_URL}/rice/${v.slug}`,
      lastModified: v.updatedAt,
      changeFrequency: "daily" as const,
      priority: 0.9,
    })),
    ...lotCodes.map((l) => ({
      url: `${SITE_URL}/lot/${l.code}`,
      lastModified: l.updatedAt,
      changeFrequency: "weekly" as const,
      priority: 0.4,
    })),
  ];
}
