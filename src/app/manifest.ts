import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Dangote Refinery IPO Guide by Eusate",
    short_name: "Dangote IPO Guide",
    description: "Unofficial, free guide to the Dangote Petroleum Refinery IPO: price, dates, how to subscribe and where to buy.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fafaf8",
    theme_color: "#e0882e",
    lang: "en",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
