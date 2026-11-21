import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/domains";

// zur Laufzeit erzeugen (APP_URL kommt aus der Umgebung, nicht vom Build)
export const dynamic = "force-dynamic";

/** Gilt für www.15k.de und alle Community-Subdomains (gleicher Inhalt). */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // nur für angemeldete Nutzer bzw. ohne Mehrwert für Suchmaschinen
        disallow: ["/account", "/messages", "/homepage", "/password", "/verify", "/register/check-email", "/settings", "/events/new", "/api/"],
      },
    ],
    sitemap: siteUrl("/sitemap.xml"),
  };
}
