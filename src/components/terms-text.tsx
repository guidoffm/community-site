import { APP_NAME, IMPRINT_URL, OPERATOR_NAME, PRIVACY_URL, siteUrl } from "@/lib/domains";
import { MIN_AGE, TERMS_VERSION } from "@/lib/terms";

/** Nutzungsbedingungen (ENTWURF – vor endgültiger Verwendung rechtlich prüfen lassen). */
export function TermsText() {
  const h = "mt-6 text-lg font-bold";
  return (
    <div className="space-y-3 text-sm leading-relaxed text-slate-700">
      <p className="text-xs text-slate-500">Fassung vom {new Date(TERMS_VERSION).toLocaleDateString("de-DE")}</p>

      <h2 className={h}>1. Anbieter und Geltungsbereich</h2>
      <p>
        {APP_NAME} (www.15k.de und die Community-Adressen unter 15k.de) ist ein Angebot der {OPERATOR_NAME} (siehe{" "}
        <a href={IMPRINT_URL} className="link">Impressum</a>). Diese Bedingungen gelten für die Nutzung der Plattform durch registrierte
        Nutzer und Besucher.
      </p>

      <h2 className={h}>2. Registrierung und Konto</h2>
      <p>
        Die Nutzung ist kostenlos. Registrieren dürfen sich Personen ab {MIN_AGE} Jahren. Die Angaben bei der Registrierung müssen
        zutreffen; jede Person darf nur ein Konto führen. Zugangsdaten (Passkey, Passwort, Anmeldecodes) sind geheim zu halten. Ein
        Anspruch auf Registrierung oder auf die Aufnahme in eine bestimmte Community besteht nicht.
      </p>

      <h2 className={h}>3. Communities</h2>
      <p>
        Communities werden von {OPERATOR_NAME} eingerichtet und von deren Administratoren betreut. Administratoren können Titel,
        Beschreibung und Mitglieder ihrer Community verwalten und Beitrittsregeln festlegen.
      </p>

      <h2 className={h}>4. Inhalte der Nutzer</h2>
      <p>Für Nachrichten, Events, Homepages und Fotos, die du einstellst, bist du selbst verantwortlich. Insbesondere ist untersagt:</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>rechtswidrige Inhalte, z. B. Beleidigungen, Bedrohungen, Volksverhetzung oder Inhalte, die Jugendschutzvorschriften verletzen,</li>
        <li>Inhalte, die Rechte Dritter verletzen – insbesondere Urheberrechte und das Recht am eigenen Bild: Fotos, auf denen andere Personen erkennbar sind, nur mit deren Einverständnis,</li>
        <li>Belästigung, Hassrede, Diskriminierung, Spam und unaufgeforderte Werbung,</li>
        <li>Schadsoftware, Phishing und Versuche, die Plattform oder Konten anderer zu missbrauchen.</li>
      </ul>
      <p>
        Du räumst {OPERATOR_NAME} das einfache, unentgeltliche Recht ein, deine Inhalte im Rahmen der Plattform zu speichern und den
        jeweils berechtigten Nutzern anzuzeigen. Dieses Recht endet, wenn du die Inhalte oder dein Konto löschst (vergangene Events
        bleiben ohne deinen Namen erhalten, siehe Datenschutzerklärung).
      </p>

      <h2 className={h}>5. Meldungen und Moderation</h2>
      <p>
        Rechtswidrige oder gegen diese Bedingungen verstoßende Inhalte kann jede Person über den Link „Melden“ am jeweiligen Inhalt
        melden (<a href={siteUrl("/report")} className="link">Meldeformular</a>). Wir prüfen Meldungen zeitnah, sorgfältig und
        objektiv und informieren die meldende Person über unsere Entscheidung. Werden Inhalte entfernt oder Konten gesperrt, erhält
        die betroffene Person eine Begründung per E-Mail und kann sich dagegen unter{" "}
        <a href="mailto:mail@altiros.de" className="link">mail@altiros.de</a> beschweren. Zentrale Kontaktstelle für Behörden und
        Nutzer nach dem Digital Services Act ist ebenfalls mail@altiros.de (Deutsch, Englisch).
      </p>

      <h2 className={h}>6. Sperrung und Beendigung</h2>
      <p>
        Bei Verstößen gegen diese Bedingungen können wir Inhalte entfernen und Konten vorübergehend oder dauerhaft sperren; dabei
        berücksichtigen wir die Schwere und Häufigkeit des Verstoßes. Du kannst dein Konto jederzeit unter „Mein Konto“ löschen. Wir
        können die Nutzung mit einer Frist von zwei Wochen beenden oder die Plattform einstellen; aus wichtigem Grund auch fristlos.
      </p>

      <h2 className={h}>7. Verfügbarkeit und Haftung</h2>
      <p>
        Wir bemühen uns um einen störungsfreien Betrieb, eine bestimmte Verfügbarkeit wird jedoch nicht zugesagt. Wir haften
        unbeschränkt bei Vorsatz, grober Fahrlässigkeit sowie bei Verletzung von Leben, Körper oder Gesundheit; im Übrigen ist die
        Haftung – soweit gesetzlich zulässig – ausgeschlossen, da die Plattform unentgeltlich angeboten wird. Für Inhalte der Nutzer
        sind wir nicht verantwortlich, solange wir keine Kenntnis von deren Rechtswidrigkeit haben.
      </p>

      <h2 className={h}>8. Datenschutz</h2>
      <p>
        Welche Daten wir verarbeiten, steht in der <a href={PRIVACY_URL} className="link">Datenschutzerklärung</a>.
      </p>

      <h2 className={h}>9. Änderungen</h2>
      <p>
        Wir können diese Bedingungen anpassen, etwa bei neuen Funktionen oder geänderter Rechtslage. Über wesentliche Änderungen
        informieren wir dich; die Nutzung danach setzt deine erneute Zustimmung voraus.
      </p>

      <h2 className={h}>10. Schlussbestimmungen</h2>
      <p>
        Es gilt deutsches Recht. Ist der Nutzer Verbraucher, gilt diese Rechtswahl nur, soweit dadurch nicht zwingende
        Verbraucherschutzvorschriften des Staates seines gewöhnlichen Aufenthalts entzogen werden. Wir nehmen nicht an
        Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teil.
      </p>
    </div>
  );
}
