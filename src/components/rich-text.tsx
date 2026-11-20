/** Klartext mit Zeilenumbrüchen; http(s)-URLs werden zu Links. Kein HTML vom Nutzer. */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g)
  return (
    <div className="whitespace-pre-wrap break-words">
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <a key={i} href={p} target="_blank" rel="noreferrer nofollow ugc" className="link">{p}</a>
        ) : (
          p
        ),
      )}
    </div>
  )
}
