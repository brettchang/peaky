ALTER TABLE "campaign_invoices"
ADD COLUMN "dashboard_status" text NOT NULL DEFAULT 'AWAITING_PAYMENT';
