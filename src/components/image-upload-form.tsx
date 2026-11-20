/** Normales Formular (keine Server Action) → POST an Route-Handler, damit große Dateien möglich sind. */
export function ImageUploadForm({ target, eventId, returnTo }: { target: "homepage" | "event"; eventId?: string; returnTo: string }) {
  return (
    <form action="/api/images" method="post" encType="multipart/form-data" className="space-y-3 rounded-lg bg-slate-50 p-4">
      <input type="hidden" name="target" value={target} />
      {eventId && <input type="hidden" name="eventId" value={eventId} />}
      <input type="hidden" name="returnTo" value={returnTo} />
      <div>
        <label className="label" htmlFor="files">Bilder auswählen (JPG, PNG, WebP, GIF – max. 10 MB je Bild)</label>
        <input id="files" name="files" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple required className="block w-full text-sm" />
      </div>
      <div>
        <label className="label" htmlFor="caption">Bildunterschrift (optional, gilt für alle ausgewählten Bilder)</label>
        <input id="caption" name="caption" maxLength={200} className="input" />
      </div>
      <button type="submit" className="btn">Hochladen</button>
    </form>
  )
}

export function UploadFeedback({ uploaded, uploadError }: { uploaded?: string; uploadError?: string }) {
  return (
    <>
      {uploaded && <p className="alert-success">{uploaded} Bild(er) hochgeladen.</p>}
      {uploadError && <p className="alert-error">{uploadError}</p>}
    </>
  )
}
