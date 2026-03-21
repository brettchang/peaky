ALTER TABLE "onboarding_rounds"
ADD COLUMN IF NOT EXISTS "form_type" text NOT NULL DEFAULT 'newsletter';

UPDATE "onboarding_rounds" r
SET "form_type" = 'podcast'
WHERE EXISTS (
  SELECT 1
  FROM "placements" p
  WHERE p."onboarding_round_id" = r."id"
    AND (
      p."publication" = 'Peak Daily Podcast'
      OR p."type" IN (':30 Pre-Roll', ':30 Mid-Roll', '15 Minute Interview')
    )
);
