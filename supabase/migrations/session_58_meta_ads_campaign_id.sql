ALTER TABLE ad_campaigns
ADD COLUMN IF NOT EXISTS meta_campaign_id text;

CREATE UNIQUE INDEX IF NOT EXISTS ad_campaigns_client_meta_campaign
ON ad_campaigns(client_id, meta_campaign_id)
WHERE meta_campaign_id IS NOT NULL;
