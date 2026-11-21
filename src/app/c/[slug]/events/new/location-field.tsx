"use client";

import { useState } from "react";
import { mapSearchUrl } from "@/lib/maps";

/** Ort mit Kartenvorschau-Link und optionalem eigenem Karten-Link. */
export function LocationField() {
  const [location, setLocation] = useState("");
  const [mapUrl, setMapUrl] = useState("");
  const preview = mapUrl.trim() || (location.trim().length >= 2 ? mapSearchUrl(location.trim()) : "");
  return (
    <div className="space-y-3 rounded-2xl border border-violet-100 bg-violet-50/40 p-3">
      <label className="block">
        <span className="label">Ort *</span>
        <input
          name="location"
          required
          maxLength={300}
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="z. B. Gaststätte Zum Anker, Hauptstraße 1, 12345 Musterstadt"
          className="input"
        />
      </label>
      <label className="block">
        <span className="label">Karten-Link (optional)</span>
        <input
          name="mapUrl"
          type="url"
          maxLength={2000}
          value={mapUrl}
          onChange={(e) => setMapUrl(e.target.value)}
          placeholder="https://maps.app.goo.gl/… oder https://www.openstreetmap.org/…"
          className="input"
        />
        <span className="mt-1 block text-xs text-slate-500">Leer lassen: Der Link wird automatisch aus dem Ort erzeugt.</span>
      </label>
      {preview && (
        <a href={preview} target="_blank" rel="noreferrer" className="link inline-flex items-center gap-1 text-sm">
          🗺️ Auf Karte prüfen
        </a>
      )}
    </div>
  );
}
