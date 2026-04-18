-- Add Stripe-related fields to the profiles table
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text;

-- Index for fast Stripe customer lookups (used by webhooks)
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer ON profiles(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;
