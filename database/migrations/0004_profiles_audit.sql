-- On Supabase the `auth` schema + `auth.users` already exist, so these two
-- IF NOT EXISTS statements are no-ops there. On a plain local Postgres
-- (docker-compose `postgis/postgis`) they create a minimal shim so this
-- migration — and local role testing — still works.
-- Note: IF NOT EXISTS still requires CREATE privilege on the schema before
-- Postgres checks whether the object exists, and Supabase's `postgres` role
-- doesn't have CREATE on the reserved `auth` schema — so catch that instead
-- of relying on IF NOT EXISTS alone.
DO $$
BEGIN
  CREATE SCHEMA IF NOT EXISTS auth;
EXCEPTION WHEN insufficient_privilege THEN
  NULL;
END $$;

DO $$
BEGIN
  CREATE TABLE IF NOT EXISTS auth.users (
    id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text
  );
EXCEPTION WHEN insufficient_privilege THEN
  NULL;
END $$;

-- Supabase manages auth.users; this mirrors role + display data for joins.
CREATE TABLE profiles (
  id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       text,
  full_name   text,
  role        user_role NOT NULL DEFAULT 'citizen',
  ward_scope  text[] DEFAULT '{}',                    -- wards this user may act on ('{}' = all)
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor      uuid,
  action     text NOT NULL,                           -- 'source.ingest', 'conflict.resolve', ...
  entity     text NOT NULL,                           -- 'data_sources:<id>'
  detail     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_entity_idx ON audit_logs (entity, created_at DESC);

-- Auto-provision a profile for every new auth user. Without this an
-- authenticated user has no `profiles` row, AuthGuard falls back to role
-- 'citizen', and every @Roles('admin'|'official'|'analyst') route 403s.
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'citizen')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Promote the first admin AFTER that user signs up:
--   UPDATE profiles SET role = 'admin' WHERE email = 'you@example.com';
