ALTER TABLE "billing_onboarding" ADD COLUMN "uploaded_doc_url" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "onboarding_messaging" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "onboarding_desired_action" text;--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "onboarding_submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "placements" ADD COLUMN "onboarding_brief" text;