// Datenbankschema. Änderungen: hier anpassen → `npm run db:generate` → Migration einchecken.
// Migrationen müssen abwärtskompatibel sein (Rolling Update, siehe CLAUDE.md).
import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true });
const timestamps = {
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
};

// ---------------------------------------------------------------- Benutzer
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  /** Sessions, die vor diesem Zeitpunkt ausgestellt wurden, sind ungültig */
  passwordChangedAt: ts("password_changed_at"),
  ...timestamps,
});

// ---------------------------------------------------------------- Communities
export const memberRole = pgEnum("member_role", ["admin", "member"]);

export const communities = pgTable("communities", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** zugleich Subdomain: <slug>.15k.de */
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description").notNull().default(""),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  ...timestamps,
});

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
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at"),
    ...timestamps,
  },
  (t) => [index("events_community_idx").on(t.communityId, t.startsAt)],
);

export const eventRegistrations = pgTable(
  "event_registrations",
  {
    eventId: uuid("event_id").notNull().references(() => events.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.userId] })],
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
    check("images_owner_chk", sql`num_nonnulls(${t.homepageUserId}, ${t.eventId}) = 1`),
  ],
);

/** Speicherobjekte, deren Löschung noch aussteht (Bild-Zeilen wurden per Cascade entfernt). Job storage-cleanup. */
export const storageDeletions = pgTable("storage_deletions", {
  key: text("key").primaryKey(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

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
