import type { MetadataRoute } from "next";
import { eq } from "drizzle-orm";
import { db, t } from "@/db";
import { communityUrl, siteUrl } from "@/lib/domains";

export const dynamic = "force-dynamic";

/** Öffentliche Seiten: Startseite, Übersicht, Registrierung, jede Community-Subdomain, öffentliche Homepages. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [communities, homepages] = await Promise.all([
    db().select({ slug: t.communities.slug, updatedAt: t.communities.updatedAt }).from(t.communities),
    db().select({ userId: t.homepages.userId, updatedAt: t.homepages.updatedAt }).from(t.homepages).where(eq(t.homepages.visibility, "public")),
  ]);
  const now = new Date();
  return [
    { url: siteUrl("/"), lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: siteUrl("/communities"), lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: siteUrl("/register"), changeFrequency: "monthly", priority: 0.6 },
    ...communities.map((c) => ({ url: communityUrl(c.slug), lastModified: c.updatedAt, changeFrequency: "weekly" as const, priority: 0.8 })),
    ...homepages.map((h) => ({ url: siteUrl(`/u/${h.userId}`), lastModified: h.updatedAt, changeFrequency: "monthly" as const, priority: 0.4 })),
  ];
}
