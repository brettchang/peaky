ALTER TABLE "campaigns" ADD COLUMN IF NOT EXISTS "portal_id" text;

UPDATE "campaigns"
SET "portal_id" = 'cmp_' || substring(md5("id") for 12)
WHERE "portal_id" IS NULL;

ALTER TABLE "campaigns" ALTER COLUMN "portal_id" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "campaigns_portal_id_idx"
  ON "campaigns" USING btree ("portal_id");

UPDATE "onboarding_rounds" AS r
SET "form_link" = regexp_replace(r."form_link", '/portal/[^/]+/', '/portal/' || c."portal_id" || '/')
FROM "campaigns" AS c
WHERE r."campaign_id" = c."id"
  AND r."form_link" IS NOT NULL
  AND r."form_link" LIKE '%/portal/%/%';

UPDATE "billing_onboarding" AS b
SET "form_link" = regexp_replace(b."form_link", '/portal/[^/]+/', '/portal/' || c."portal_id" || '/')
FROM "campaigns" AS c
WHERE b."campaign_id" = c."id"
  AND b."form_link" IS NOT NULL
  AND b."form_link" LIKE '%/portal/%/%';
