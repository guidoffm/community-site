ALTER TABLE "message_recipients" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "sender_deleted_at" timestamp with time zone;