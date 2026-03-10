CREATE TABLE IF NOT EXISTS auth.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_key TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES auth.organizations(id),
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL,
  UNIQUE(org_id, username)
);

CREATE TABLE IF NOT EXISTS auth.signing_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kid TEXT UNIQUE NOT NULL,
  private_pem TEXT NOT NULL,
  public_pem TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
