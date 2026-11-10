-- =============================================================================
-- TARA: Admin Accounts Directory, Profiles Trigger, and Managed Routes Setup
-- Run this entire script in: Supabase Dashboard -> SQL Editor -> New Query
-- =============================================================================

-- 1. Ensure public.profiles table exists with all required columns
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  role TEXT DEFAULT 'user',
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- 2. Backfill all existing accounts from auth.users into public.profiles
INSERT INTO public.profiles (id, email, full_name, role, status, created_at)
SELECT
  u.id,
  u.email,
  COALESCE(
    u.raw_user_meta_data->>'full_name',
    NULLIF(TRIM(CONCAT(u.raw_user_meta_data->>'first_name', ' ', u.raw_user_meta_data->>'last_name')), ''),
    SPLIT_PART(u.email, '@', 1),
    'Commuter'
  ),
  COALESCE(u.raw_user_meta_data->>'role', 'user'),
  'active',
  COALESCE(u.created_at, NOW())
FROM auth.users u
ON CONFLICT (id) DO UPDATE
SET
  email = EXCLUDED.email,
  full_name = COALESCE(NULLIF(public.profiles.full_name, ''), EXCLUDED.full_name),
  role = COALESCE(NULLIF(public.profiles.role, ''), EXCLUDED.role);

-- 3. Trigger to automatically sync every new signup / user update from auth.users into public.profiles
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, status, created_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NULLIF(TRIM(CONCAT(NEW.raw_user_meta_data->>'first_name', ' ', NEW.raw_user_meta_data->>'last_name')), ''),
      SPLIT_PART(NEW.email, '@', 1),
      'Commuter'
    ),
    COALESCE(NEW.raw_user_meta_data->>'role', 'user'),
    'active',
    COALESCE(NEW.created_at, NOW())
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), public.profiles.full_name);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_auth_user();

-- 4. SECURITY DEFINER RPC function so the Admin Panel Accounts tab always fetches all registered users
CREATE OR REPLACE FUNCTION public.get_all_registered_users()
RETURNS TABLE (
  id UUID,
  email TEXT,
  full_name TEXT,
  role TEXT,
  status TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.id,
    u.email::TEXT,
    COALESCE(
      p.full_name,
      u.raw_user_meta_data->>'full_name',
      NULLIF(TRIM(CONCAT(u.raw_user_meta_data->>'first_name', ' ', u.raw_user_meta_data->>'last_name')), ''),
      SPLIT_PART(u.email, '@', 1),
      'Commuter'
    )::TEXT AS full_name,
    COALESCE(p.role, u.raw_user_meta_data->>'role', 'user')::TEXT AS role,
    COALESCE(p.status, 'active')::TEXT AS status,
    COALESCE(p.created_at, u.created_at, NOW()) AS created_at
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  ORDER BY u.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_registered_users() TO authenticated, anon;

-- 5. Enable Row Level Security (RLS) on public.profiles with read/write policies for Admin Panel
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow read all profiles" ON public.profiles;
CREATE POLICY "Allow read all profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "Allow insert or update profiles" ON public.profiles;
CREATE POLICY "Allow insert or update profiles"
  ON public.profiles
  FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

-- 6. Ensure public.managed_routes table supports admin-added routes and fare overrides
CREATE TABLE IF NOT EXISTS public.managed_routes (
  id TEXT PRIMARY KEY,
  route_name TEXT NOT NULL,
  origin TEXT NOT NULL,
  destination TEXT DEFAULT 'DLSAU',
  vehicle_type TEXT DEFAULT 'jeepney',
  base_fare TEXT,
  custom_fare NUMERIC,
  custom_solo_fare NUMERIC,
  has_tricycle BOOLEAN DEFAULT false,
  is_custom_admin_route BOOLEAN DEFAULT false,
  signboard TEXT,
  what_to_say TEXT,
  origin_lat DOUBLE PRECISION,
  origin_lng DOUBLE PRECISION,
  eta_minutes INTEGER DEFAULT 25,
  status TEXT DEFAULT 'active',
  status_note TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.managed_routes ADD COLUMN IF NOT EXISTS custom_fare NUMERIC;
ALTER TABLE public.managed_routes ADD COLUMN IF NOT EXISTS custom_solo_fare NUMERIC;
ALTER TABLE public.managed_routes ADD COLUMN IF NOT EXISTS has_tricycle BOOLEAN DEFAULT false;
ALTER TABLE public.managed_routes ADD COLUMN IF NOT EXISTS is_custom_admin_route BOOLEAN DEFAULT false;
ALTER TABLE public.managed_routes ADD COLUMN IF NOT EXISTS signboard TEXT;
ALTER TABLE public.managed_routes ADD COLUMN IF NOT EXISTS what_to_say TEXT;
ALTER TABLE public.managed_routes ADD COLUMN IF NOT EXISTS origin_lat DOUBLE PRECISION;
ALTER TABLE public.managed_routes ADD COLUMN IF NOT EXISTS origin_lng DOUBLE PRECISION;

ALTER TABLE public.managed_routes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read and admin write on managed_routes" ON public.managed_routes;
CREATE POLICY "Allow public read and admin write on managed_routes"
  ON public.managed_routes
  FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);
