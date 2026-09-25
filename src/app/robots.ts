import type { MetadataRoute } from "next";

const SITE_URL = process.env.SITE_URL ?? "https://irice.ir";

/**
 * Crawl the catalog, never the private surface. The noindex meta on these
 * pages already keeps them out of results; disallowing them here also stops
 * crawl budget being spent on pages that only ever redirect a logged-out bot
 * to a login form.
 *
 * `/certificates/file/` stays crawlable on purpose: the lab reports are the
 * public evidence behind the lot passports.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api/", "/cart", "/checkout", "/account", "/orders/", "/pay/"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
