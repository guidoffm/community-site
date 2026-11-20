import Link from "next/link"

export default function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1>Seite nicht gefunden</h1>
      <p className="mt-2 text-slate-600">Die Seite existiert nicht oder du hast keinen Zugriff darauf.</p>
      <Link href="/" className="btn mt-6">Zur Startseite</Link>
    </div>
  )
}
