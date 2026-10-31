-- ==============================================================================
-- TARA-neta: Commuter Reports & Audit Logs Schema Migration
-- ==============================================================================

-- 1. Commuter Reports Table
CREATE TABLE IF NOT EXISTS public.commuter_reports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  user_role TEXT NOT NULL DEFAULT 'user',
  category TEXT NOT NULL,
  route_or_area TEXT NOT NULL,
  description TEXT NOT NULL,
  urgency TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'submitted',
  admin_response TEXT,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  verified_at TIMESTAMPTZ
);

ALTER TABLE public.commuter_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can submit a commuter report" ON public.commuter_reports;
CREATE POLICY "Anyone can submit a commuter report"
ON public.commuter_reports FOR INSERT
TO authenticated, anon
WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can view commuter reports" ON public.commuter_reports;
CREATE POLICY "Anyone can view commuter reports"
ON public.commuter_reports FOR SELECT
TO authenticated, anon
USING (true);

DROP POLICY IF EXISTS "Admins can update commuter reports" ON public.commuter_reports;
CREATE POLICY "Admins can update commuter reports"
ON public.commuter_reports FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- 2. Date-Stamped System Audit Logs Table
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  details TEXT NOT NULL,
  is_verified BOOLEAN DEFAULT true,
  timestamp TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read audit logs" ON public.audit_logs;
CREATE POLICY "Anyone can read audit logs"
ON public.audit_logs FOR SELECT
TO authenticated, anon
USING (true);

DROP POLICY IF EXISTS "Anyone can record audit logs" ON public.audit_logs;
CREATE POLICY "Anyone can record audit logs"
ON public.audit_logs FOR INSERT
TO authenticated, anon
WITH CHECK (true);
