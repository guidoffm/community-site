"use client"

import { useCallback, useEffect, useState } from "react"

export type GalleryImage = {
  id: string
  caption: string | null
  width: number
  height: number
  uploaderName?: string
  canDelete: boolean
}

export function ImageGallery({
  images,
  deleteAction,
  emptyText,
}: {
  images: GalleryImage[]
  deleteAction?: (formData: FormData) => Promise<void>
  emptyText: string
}) {
  const [open, setOpen] = useState<number | null>(null)
  const close = useCallback(() => setOpen(null), [])
  const step = useCallback(
    (d: number) => setOpen((i) => (i === null ? null : (i + d + images.length) % images.length)),
    [images.length],
  )

  useEffect(() => {
    if (open === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close()
      if (e.key === "ArrowRight") step(1)
      if (e.key === "ArrowLeft") step(-1)
    }
    document.addEventListener("keydown", onKey)
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = ""
    }
  }, [open, close, step])

  // Index korrigieren, falls ein Bild gelöscht wurde
  useEffect(() => {
    if (open !== null && open >= images.length) setOpen(images.length ? images.length - 1 : null)
  }, [images.length, open])

  if (images.length === 0) return <p className="text-sm text-slate-500">{emptyText}</p>
  const current = open !== null ? images[open] : null

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {images.map((img, i) => (
          <li key={img.id} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <button type="button" onClick={() => setOpen(i)} className="block w-full" aria-label={`Bild ${i + 1} in voller Größe anzeigen`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/images/${img.id}?size=thumb`}
                alt={img.caption ?? ""}
                loading="lazy"
                width={480}
                height={480}
                className="aspect-square w-full object-cover transition hover:opacity-90"
              />
            </button>
            {(img.caption || img.uploaderName || img.canDelete) && (
              <div className="space-y-1 p-2 text-xs text-slate-600">
                {img.caption && <p className="line-clamp-2">{img.caption}</p>}
                {img.uploaderName && <p className="text-slate-400">von {img.uploaderName}</p>}
                {img.canDelete && deleteAction && (
                  <form action={deleteAction} onSubmit={(e) => { if (!confirm("Bild wirklich löschen?")) e.preventDefault() }}>
                    <input type="hidden" name="imageId" value={img.id} />
                    <button type="submit" className="text-red-600 hover:underline">Löschen</button>
                  </form>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {current && open !== null && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4"
          onClick={close}
        >
          <div className="absolute right-3 top-3 flex gap-2">
            <a
              href={`/api/images/${current.id}`}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="rounded-lg bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/20"
            >
              Original öffnen
            </a>
            <button onClick={close} className="rounded-lg bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/20" aria-label="Schließen">
              ✕
            </button>
          </div>
          {images.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); step(-1) }}
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 px-4 py-3 text-2xl text-white hover:bg-white/20"
                aria-label="Vorheriges Bild"
              >‹</button>
              <button
                onClick={(e) => { e.stopPropagation(); step(1) }}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/10 px-4 py-3 text-2xl text-white hover:bg-white/20"
                aria-label="Nächstes Bild"
              >›</button>
            </>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={current.id}
            src={`/api/images/${current.id}`}
            alt={current.caption ?? ""}
            width={current.width}
            height={current.height}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] max-w-full object-contain"
          />
          <p className="mt-3 text-center text-sm text-white/80" onClick={(e) => e.stopPropagation()}>
            {current.caption}
            {current.uploaderName && <span className="text-white/50"> · von {current.uploaderName}</span>}
            <span className="ml-2 text-white/50">{open + 1} / {images.length}</span>
          </p>
        </div>
      )}
    </>
  )
}
