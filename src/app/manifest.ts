import type { MetadataRoute } from "next";
import { SITE_NAME_FA, SITE_TAGLINE_FA } from "../modules/seo/structured-data";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME_FA} — ${SITE_TAGLINE_FA}`,
    short_name: SITE_NAME_FA,
    description: "برنج ایرانی با شناسنامه محموله: خاستگاه، سال برداشت و قیمت شفاف هر کیلوگرم.",
    lang: "fa",
    dir: "rtl",
    start_url: "/",
    display: "browser",
    // --color-bg and --color-brand-strong from the light theme.
    background_color: "#fbfaf7",
    theme_color: "#2c4d29",
    icons: [{ src: "/icon.svg", type: "image/svg+xml", sizes: "any" }],
  };
}
