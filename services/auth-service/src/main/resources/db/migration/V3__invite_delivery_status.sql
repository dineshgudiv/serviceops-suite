ALTER TABLE auth.invite_tokens
  ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'CREATED',
  ADD COLUMN IF NOT EXISTS delivery_error TEXT NULL,
  ADD COLUMN IF NOT EXISTS last_delivery_attempt_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ NULL;

UPDATE auth.invite_tokens
SET delivery_status = CASE
  WHEN accepted_at IS NOT NULL THEN 'ACCEPTED'
  WHEN expires_at < now() THEN 'EXPIRED'
  ELSE 'CREATED'
END
WHERE delivery_status IS NULL OR delivery_status = '';
