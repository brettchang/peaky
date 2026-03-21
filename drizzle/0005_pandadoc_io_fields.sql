ALTER TABLE "campaigns" ADD COLUMN "currency" text DEFAULT 'CAD' NOT NULL;
ALTER TABLE "campaigns" ADD COLUMN "tax_eligible" boolean DEFAULT true NOT NULL;
ALTER TABLE "campaigns" ADD COLUMN "pandadoc_document_id" text;
ALTER TABLE "campaigns" ADD COLUMN "pandadoc_status" text;
ALTER TABLE "campaigns" ADD COLUMN "pandadoc_document_url" text;
ALTER TABLE "campaigns" ADD COLUMN "pandadoc_created_at" timestamp with time zone;
