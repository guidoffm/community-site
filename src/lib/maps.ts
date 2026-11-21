/** Karten-Suche zu einer Adresse – öffnet auf dem Handy die Karten-App. */
export const mapSearchUrl = (location: string) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;

/** Karten-Link eines Events: eigener Link des Organisators oder automatisch aus dem Ort. */
export const eventMapUrl = (e: { location: string; mapUrl?: string | null }) => e.mapUrl || mapSearchUrl(e.location);
