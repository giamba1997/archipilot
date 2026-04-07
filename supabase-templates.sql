-- ============================================================
-- ArchiPilot — Template columns for profiles
-- Run this in Supabase SQL Editor
-- ============================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS post_template text DEFAULT 'general';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pv_template text DEFAULT 'standard';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS remark_numbering text DEFAULT 'none';
