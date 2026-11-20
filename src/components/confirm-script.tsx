/** Rückfrage für Buttons mit data-confirm in normalen Formularen (ohne eigenen Client-Code je Button). */
export function ConfirmScript() {
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `document.addEventListener("submit",function(e){var b=e.submitter;if(b&&b.dataset&&b.dataset.confirm&&!confirm(b.dataset.confirm)){e.preventDefault();e.stopImmediatePropagation();}},true);`,
      }}
    />
  );
}
