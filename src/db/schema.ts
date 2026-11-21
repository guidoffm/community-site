// Datenbankschema. Änderungen: hier anpassen → `npm run db:generate` → Migration einchecken.
// Migrationen müssen abwärtskompatibel sein (Rolling Update, siehe CLAUDE.md).
import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true });
const timestamps = {
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
};

// ---------------------------------------------------------------- Benutzer
/**
 * Platzhalter-Konto „Gelöschter Benutzer“ (per Migration angelegt). Vergangene Events gelöschter Konten
 * werden ihm zugeordnet, damit die Historie erhalten bleibt. Kein Login möglich, in keiner Community.
 */
export const DELETED_USER_ID = "00000000-0000-0000-0000-00000000dead";
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  /** bcrypt-Hash; "!" = kein Passwort gesetzt (Anmeldung nur per Passkey oder E-Mail-Code) */
  passwordHash: text("password_hash").notNull(),
  /** Sessions, die vor diesem Zeitpunkt ausgestellt wurden, sind ungültig */
  passwordChangedAt: ts("password_changed_at"),
  /** null = Registrierung noch nicht per E-Mail bestätigt (Login gesperrt, Job unverified-cleanup löscht nach 24 h) */
  emailVerifiedAt: ts("email_verified_at"),
  /** Site-Admin: darf Communities anlegen. Vergabe über SITE_ADMIN_EMAILS (beim Start bzw. bei E-Mail-Bestätigung). */
  isSiteAdmin: boolean("is_site_admin").notNull().default(false),
  /** Zustimmung zu den Nutzungsbedingungen (Fassung siehe src/lib/terms.ts) */
  termsAcceptedAt: ts("terms_accepted_at"),
  termsVersion: text("terms_version"),
  /** Gesperrt durch Site-Admin (Meldeverfahren) – keine Anmeldung möglich */
  blockedAt: ts("blocked_at"),
  blockedReason: text("blocked_reason"),
  ...timestamps,
});

/** Bestätigungslinks der Registrierung. Gespeichert wird nur der SHA-256-Hash des Tokens. */
export const emailVerifications = pgTable(
  "email_verifications",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** Bei der Registrierung gewählte Communities – Beitritt erst nach Bestätigung */
    communityIds: jsonb("community_ids").$type<string[]>().notNull().default([]),
    /** Rücksprungziel nach Bestätigung (z. B. Community-Subdomain) */
    next: text("next"),
    expiresAt: ts("expires_at").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("email_verifications_user_idx").on(t.userId)],
);

/** Passkeys (WebAuthn). Gespeichert wird nur der öffentliche Schlüssel. */
export const passkeys = pgTable(
  "passkeys",
  {
    /** Credential-ID (base64url) */
    id: text("id").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** öffentlicher Schlüssel (COSE, base64url) */
    publicKey: text("public_key").notNull(),
    counter: integer("counter").notNull().default(0),
    transports: jsonb("transports").$type<string[]>(),
    deviceType: text("device_type"),
    backedUp: boolean("backed_up").notNull().default(false),
    name: text("name").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    lastUsedAt: ts("last_used_at"),
  },
  (t) => [index("passkeys_user_idx").on(t.userId)],
);

/** Einmalige WebAuthn-Challenges (5 min). Die ID liegt im Cookie c15k_wa des Browsers. */
export const authChallenges = pgTable("auth_challenges", {
  id: uuid("id").primaryKey().defaultRandom(),
  challenge: text("challenge").notNull(),
  kind: text("kind").notNull(), // passkey-login | passkey-register
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  expiresAt: ts("expires_at").notNull(),
});

/** Einmal-Codes für die Anmeldung per E-Mail (10 min, max. 5 Versuche). Gespeichert wird nur ein Hash. */
export const loginCodes = pgTable(
  "login_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: ts("expires_at").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("login_codes_email_idx").on(t.email)],
);

/** Links zum Zurücksetzen des Passworts (1 h gültig, einmalig). Gespeichert wird nur der SHA-256-Hash. */
export const passwordResets = pgTable(
  "password_resets",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("password_resets_user_idx").on(t.userId)],
);

// ---------------------------------------------------------------- Communities
export const memberRole = pgEnum("member_role", ["admin", "member"]);

export const communities = pgTable("communities", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** zugleich Subdomain: <slug>.15k.de */
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description").notNull().default(""),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  /** open = jeder kann beitreten | request = auf Anfrage (Admin entscheidet) | invite = nur mit Einladung */
  joinMode: text("join_mode").notNull().default("open"),
  /** Logo und Titelbild (Bilder mit community_id) */
  logoImageId: uuid("logo_image_id"),
  coverImageId: uuid("cover_image_id"),
  ...timestamps,
});

/** Beitrittsanfragen (joinMode = request) */
export const joinRequests = pgTable(
  "join_requests",
  {
    communityId: uuid("community_id").notNull().references(() => communities.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    message: text("message"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.communityId, t.userId] })],
);

/** Einladungen: per E-Mail (einmalig) oder als teilbarer Link. Gespeichert wird nur der Hash des Tokens. */
export const communityInvites = pgTable(
  "community_invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id").notNull().references(() => communities.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    /** email | link */
    kind: text("kind").notNull(),
    email: text("email"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    expiresAt: ts("expires_at").notNull(),
    usedAt: ts("used_at"),
    revokedAt: ts("revoked_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("community_invites_community_idx").on(t.communityId)],
);

export const memberships = pgTable(
  "memberships",
  {
    communityId: uuid("community_id").notNull().references(() => communities.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: memberRole("role").notNull().default("member"),
    joinedAt: ts("joined_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.communityId, t.userId] }), index("memberships_user_idx").on(t.userId)],
);

// ---------------------------------------------------------------- Nachrichten
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id").notNull().references(() => communities.id, { onDelete: "cascade" }),
    senderId: uuid("sender_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    subject: text("subject").notNull(),
    body: text("body").notNull(),
    parentId: uuid("parent_id").references((): any => messages.id, { onDelete: "set null" }), // eslint-disable-line @typescript-eslint/no-explicit-any
    /** Absender hat die Nachricht aus „Gesendet“ gelöscht */
    senderDeletedAt: ts("sender_deleted_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("messages_sender_idx").on(t.senderId, t.createdAt)],
);

export const messageRecipients = pgTable(
  "message_recipients",
  {
    messageId: uuid("message_id").notNull().references(() => messages.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    readAt: ts("read_at"),
    /** Empfänger hat die Nachricht aus dem Posteingang gelöscht */
    deletedAt: ts("deleted_at"),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.userId] }), index("message_recipients_user_idx").on(t.userId, t.readAt)],
);

// ---------------------------------------------------------------- Events
export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    communityId: uuid("community_id").notNull().references(() => communities.id, { onDelete: "cascade" }),
    organizerId: uuid("organizer_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull(),
    location: text("location").notNull(),
    /** Optionaler Karten-Link (Google Maps, OpenStreetMap …); leer = automatisch aus dem Ort */
    mapUrl: text("map_url"),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at"),
    /** maximale Personenzahl (inkl. Begleitpersonen); null = unbegrenzt */
    capacity: integer("capacity"),
    /** Begleitpersonen erlaubt (max. MAX_GUESTS je Anmeldung) */
    allowGuests: boolean("allow_guests").notNull().default(false),
    ...timestamps,
  },
  (t) => [index("events_community_idx").on(t.communityId, t.startsAt)],
);

export const eventRegistrations = pgTable(
  "event_registrations",
  {
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** confirmed | waitlist */
    status: text("status").notNull().default("confirmed"),
    /** Begleitpersonen (zusätzlich zur angemeldeten Person) */
    guests: integer("guests").notNull().default(0),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.userId] })],
);

/** Verschickte Event-Erinnerungen (je Person und Stufe höchstens eine). Job event-reminders. */
export const eventReminders = pgTable(
  "event_reminders",
  {
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** 3d | 1d | 4h */
    kind: text("kind").notNull(),
    sentAt: ts("sent_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.userId, t.kind] })],
);

// ---------------------------------------------------------------- Homepages & Bilder
export const visibility = pgEnum("visibility", [
  "members", // nur eingeloggte Nutzer, die eine Community mit dem Inhaber teilen
  "public",
]);

export const homepages = pgTable("homepages", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  visibility: visibility("visibility").notNull().default("members"),
  ...timestamps,
});

/**
 * Hochgeladenes Bild – gehört entweder zu einer Homepage oder zu einem Event.
 * Die UUID wird beim Upload vergeben; Objekte im Speicher: images/<uuid>/full und images/<uuid>/thumb.
 */
export const images = pgTable(
  "images",
  {
    id: uuid("id").primaryKey(),
    uploaderId: uuid("uploader_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    homepageUserId: uuid("homepage_user_id").references(() => homepages.userId, { onDelete: "cascade" }),
    eventId: uuid("event_id").references(() => events.id, { onDelete: "cascade" }),
    /** Logo/Titelbild einer Community */
    communityId: uuid("community_id").references(() => communities.id, { onDelete: "cascade" }),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    caption: text("caption"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("images_homepage_idx").on(t.homepageUserId, t.createdAt),
    index("images_event_idx").on(t.eventId, t.createdAt),
    check("images_owner_chk", sql`num_nonnulls(${t.homepageUserId}, ${t.eventId}, ${t.communityId}) = 1`),
  ],
);

/** Speicherobjekte, deren Löschung noch aussteht (Bild-Zeilen wurden per Cascade entfernt). Job storage-cleanup. */
export const storageDeletions = pgTable("storage_deletions", {
  key: text("key").primaryKey(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

// ---------------------------------------------------------------- Meldungen (DSA Art. 16)
export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** message | image | homepage | event | community */
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    /** Kurzbeschreibung des gemeldeten Inhalts zum Zeitpunkt der Meldung (bleibt nach Entfernen erhalten) */
    targetLabel: text("target_label").notNull(),
    reason: text("reason").notNull(),
    details: text("details").notNull(),
    reporterId: uuid("reporter_id").references(() => users.id, { onDelete: "set null" }),
    reporterName: text("reporter_name"),
    reporterEmail: text("reporter_email"),
    status: text("status").notNull().default("open"), // open | removed | blocked | dismissed
    decisionNote: text("decision_note"),
    decidedBy: uuid("decided_by").references(() => users.id, { onDelete: "set null" }),
    decidedAt: ts("decided_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("reports_status_idx").on(t.status, t.createdAt), index("reports_target_idx").on(t.targetType, t.targetId)],
);

// ---------------------------------------------------------------- Mail-Outbox
/** Fertig gerenderte Mails; der Worker verschickt sie (mehrere Replikas: FOR UPDATE SKIP LOCKED). */
export const mailOutbox = pgTable(
  "mail_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    toEmail: text("to_email").notNull(),
    toName: text("to_name"),
    subject: text("subject").notNull(),
    text: text("text").notNull(),
    html: text("html"),
    /** [{ filename, contentType, contentBase64 }] */
    attachments: jsonb("attachments").$type<{ filename: string; contentType: string; contentBase64: string }[]>(),
    status: text("status").notNull().default("pending"), // pending | sent | failed
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    runAfter: ts("run_after").notNull().defaultNow(),
    createdAt: ts("created_at").notNull().defaultNow(),
    sentAt: ts("sent_at"),
  },
  (t) => [index("mail_outbox_pending_idx").on(t.status, t.runAfter)],
);

// ---------------------------------------------------------------- Betrieb
export const jobRuns = pgTable(
  "job_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    job: text("job").notNull(),
    trigger: text("trigger").notNull(), // cron | manual
    status: text("status").notNull(), // running | success | failed | skipped
    result: jsonb("result"),
    error: text("error"),
    startedAt: ts("started_at").notNull().defaultNow(),
    finishedAt: ts("finished_at"),
  },
  (t) => [index("job_runs_job_idx").on(t.job, t.startedAt)],
);

export const rateLimitHits = pgTable(
  "rate_limit_hits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    key: text("key").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("rate_limit_hits_key_idx").on(t.key, t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type Community = typeof communities.$inferSelect;
export type Event = typeof events.$inferSelect;
export type Homepage = typeof homepages.$inferSelect;
export type Image = typeof images.$inferSelect;
