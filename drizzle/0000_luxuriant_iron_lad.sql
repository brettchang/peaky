CREATE TABLE "billing_onboarding" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"fillout_link" text NOT NULL,
	"complete" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"billing_contact_name" text,
	"billing_contact_email" text,
	"billing_address" text,
	"po_number" text,
	"invoice_cadence" jsonb,
	"special_instructions" text
);
--> statement-breakpoint
CREATE TABLE "campaign_invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"xero_invoice_id" text NOT NULL,
	"linked_at" timestamp with time zone NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"client_id" text NOT NULL,
	"status" text NOT NULL,
	"campaign_manager" text,
	"contact_name" text,
	"contact_email" text,
	"ad_line_items" jsonb,
	"placements_description" text,
	"performance_table_url" text,
	"notes" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"portal_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "copy_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"placement_id" text NOT NULL,
	"version" integer NOT NULL,
	"copy_text" text NOT NULL,
	"revision_notes" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_rounds" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"label" text,
	"fillout_link" text NOT NULL,
	"complete" boolean DEFAULT false NOT NULL,
	"onboarding_doc_url" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "placement_invoices" (
	"id" text PRIMARY KEY NOT NULL,
	"placement_id" text NOT NULL,
	"xero_invoice_id" text NOT NULL,
	"linked_at" timestamp with time zone NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "placements" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"publication" text NOT NULL,
	"scheduled_date" text,
	"status" text NOT NULL,
	"current_copy" text DEFAULT '' NOT NULL,
	"copy_version" integer DEFAULT 0 NOT NULL,
	"revision_notes" text,
	"onboarding_round_id" text,
	"copy_producer" text,
	"notes" text,
	"stats" jsonb,
	"image_url" text,
	"logo_url" text,
	"link_to_placement" text,
	"conflict_preference" text,
	"beehiiv_post_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"published_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "xero_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"tenant_name" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_onboarding" ADD CONSTRAINT "billing_onboarding_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_invoices" ADD CONSTRAINT "campaign_invoices_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "copy_versions" ADD CONSTRAINT "copy_versions_placement_id_placements_id_fk" FOREIGN KEY ("placement_id") REFERENCES "public"."placements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onboarding_rounds" ADD CONSTRAINT "onboarding_rounds_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placement_invoices" ADD CONSTRAINT "placement_invoices_placement_id_placements_id_fk" FOREIGN KEY ("placement_id") REFERENCES "public"."placements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "placements" ADD CONSTRAINT "placements_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_onboarding_campaign_id_idx" ON "billing_onboarding" USING btree ("campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_invoices_campaign_invoice_idx" ON "campaign_invoices" USING btree ("campaign_id","xero_invoice_id");--> statement-breakpoint
CREATE INDEX "campaign_invoices_campaign_id_idx" ON "campaign_invoices" USING btree ("campaign_id");--> statement-breakpoint
CREATE INDEX "campaigns_client_id_idx" ON "campaigns" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "clients_portal_id_idx" ON "clients" USING btree ("portal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "copy_versions_placement_version_idx" ON "copy_versions" USING btree ("placement_id","version");--> statement-breakpoint
CREATE INDEX "onboarding_rounds_campaign_id_idx" ON "onboarding_rounds" USING btree ("campaign_id");--> statement-breakpoint
CREATE UNIQUE INDEX "placement_invoices_placement_invoice_idx" ON "placement_invoices" USING btree ("placement_id","xero_invoice_id");--> statement-breakpoint
CREATE INDEX "placement_invoices_placement_id_idx" ON "placement_invoices" USING btree ("placement_id");--> statement-breakpoint
CREATE INDEX "placements_campaign_id_idx" ON "placements" USING btree ("campaign_id");