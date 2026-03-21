UPDATE campaigns
SET campaign_manager = 'Brett'
WHERE campaign_manager IS NULL
   OR campaign_manager NOT IN ('Matheus', 'Brett', 'Will');

ALTER TABLE campaigns
ALTER COLUMN campaign_manager SET NOT NULL;

ALTER TABLE campaigns
DROP CONSTRAINT IF EXISTS campaigns_campaign_manager_chk;

ALTER TABLE campaigns
ADD CONSTRAINT campaigns_campaign_manager_chk
CHECK (campaign_manager IN ('Matheus', 'Brett', 'Will'));
