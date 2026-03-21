require('dotenv').config({ path: '.env.local' });
const { sql } = require('@vercel/postgres');

(async () => {
  await sql`ALTER TABLE onboarding_rounds ADD COLUMN IF NOT EXISTS form_type text NOT NULL DEFAULT 'newsletter'`;
  await sql`
    UPDATE onboarding_rounds r
    SET form_type = 'podcast'
    WHERE EXISTS (
      SELECT 1
      FROM placements p
      WHERE p.onboarding_round_id = r.id
        AND (
          p.publication = 'Peak Daily Podcast'
          OR p.type IN (':30 Pre-Roll', ':30 Mid-Roll', '15 Minute Interview')
        )
    )
  `;
  const check = await sql`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = 'onboarding_rounds' AND column_name = 'form_type'
  `;
  console.log('form_type column present:', check.rows.length === 1);
})();
