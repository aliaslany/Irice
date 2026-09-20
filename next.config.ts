import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  // The catalog is read-mostly and revalidated per page; no image CDN yet.
  experimental: {},
};

export default config;
