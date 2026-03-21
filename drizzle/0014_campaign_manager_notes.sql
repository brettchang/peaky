CREATE TABLE IF NOT EXISTS "campaign_manager_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"author_name" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "campaign_manager_notes" ADD CONSTRAINT "campaign_manager_notes_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "campaign_manager_notes_campaign_id_idx" ON "campaign_manager_notes" USING btree ("campaign_id");
