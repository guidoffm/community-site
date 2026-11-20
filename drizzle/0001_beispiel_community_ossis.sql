-- Beispiel-Community „Ossis“ (https://ossis.15k.de). Idempotent.
INSERT INTO "communities" ("title", "slug", "description")
VALUES (
  'Ossis',
  'ossis',
  'Für alle, die im Osten aufgewachsen sind, dort leben oder sich einfach verbunden fühlen. Hier tauschen wir Erinnerungen aus, verabreden uns zu Treffen und teilen Fotos von gemeinsamen Erlebnissen.'
)
ON CONFLICT ("slug") DO NOTHING;
