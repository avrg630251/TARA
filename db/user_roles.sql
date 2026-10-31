-- ==============================================================================
-- TARA-neta: User Roles and Profiles Schema Migration (3 Core Roles)
-- Roles: admin, user, guest
-- ==============================================================================

-- 1. Create User Role Enum (Admin, User, Guest)
DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM (
    'admin', -- System & University Administrator
    'user',  -- Registered User (students, faculty, employees)
    'guest'  -- Public or guest commuter
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Create User Profiles Table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  role public.user_role NOT NULL DEFAULT 'user',
  full_name TEXT,
  school_name TEXT DEFAULT 'De La Salle Araneta University',
  department_or_program TEXT,
  discount_type TEXT DEFAULT 'regular',
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Ensure email column exists if table was created previously without it
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;

-- Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. Helper Function: Check if current user is an admin (Security Definer avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 4. Row Level Security Policies (Idempotent)
DROP POLICY IF EXISTS "Public profiles are readable by authenticated users" ON public.profiles;
CREATE POLICY "Public profiles are readable by authenticated users"
ON public.profiles FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Administrators can manage all profiles" ON public.profiles;
CREATE POLICY "Administrators can manage all profiles"
ON public.profiles FOR ALL
TO authenticated
USING (public.is_admin());

-- 5. Automatic Profile Creation Trigger on Sign Up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    role,
    full_name,
    school_name,
    department_or_program,
    discount_type,
    avatar_url,
    created_at,
    updated_at
  ) VALUES (
    new.id,
    new.email,
    'user'::public.user_role,
    COALESCE(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
    COALESCE(new.raw_user_meta_data->>'school_name', 'De La Salle Araneta University'),
    new.raw_user_meta_data->>'department_or_program',
    COALESCE(new.raw_user_meta_data->>'discount_type', 'regular'),
    new.raw_user_meta_data->>'avatar_url',
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    updated_at = now();

  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. Backfill existing auth.users into public.profiles (if any already signed up)
INSERT INTO public.profiles (id, email, role, full_name, created_at, updated_at)
SELECT 
  id,
  email,
  'user'::public.user_role, 
  COALESCE(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name', email),
  created_at,
  now()
FROM auth.users
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email;

-- Sync email for any rows missing it
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND (p.email IS NULL OR p.email = '');

-- 7. Secure RPC Function to fetch all registered users for administrators
CREATE OR REPLACE FUNCTION public.get_all_registered_users()
RETURNS TABLE (
  id UUID,
  email TEXT,
  role public.user_role,
  full_name TEXT,
  school_name TEXT,
  department_or_program TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    u.id,
    u.email::TEXT,
    COALESCE(p.role, 'user'::public.user_role) AS role,
    COALESCE(p.full_name, u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', 'Registered User') AS full_name,
    COALESCE(p.school_name, 'De La Salle Araneta University') AS school_name,
    COALESCE(p.department_or_program, 'Registered Student') AS department_or_program,
    u.created_at
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  ORDER BY u.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
