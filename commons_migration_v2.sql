-- Commons Migration v2
-- Run this in the Supabase SQL editor.
-- Requires commons_migration.sql to have been run first.

-- ─────────────────────────────────────────────
-- 1. Allow authenticated users to update photo_url on their own posts/groups
-- ─────────────────────────────────────────────
-- (Posts and groups already have RLS. If you need an explicit UPDATE policy:)
-- DROP POLICY IF EXISTS "users_update_own_posts" ON posts;
-- CREATE POLICY "users_update_own_posts" ON posts
--   FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- DROP POLICY IF EXISTS "users_update_own_groups" ON groups;
-- CREATE POLICY "users_update_own_groups" ON groups
--   FOR UPDATE TO authenticated USING (auth.uid() = creator_id) WITH CHECK (auth.uid() = creator_id);


-- ─────────────────────────────────────────────
-- 2. process_exchange RPC
--    Called after both parties confirm + the scorer submits ratings.
--    Transfers tokens from receiver → provider and marks the exchange complete.
--    Uses SECURITY DEFINER so it can bypass RLS for the token transfer.
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION process_exchange(p_exchange_id UUID, p_tokens INT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ex pending_exchanges%ROWTYPE;
BEGIN
  SELECT * INTO v_ex FROM pending_exchanges WHERE id = p_exchange_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Exchange not found');
  END IF;

  IF v_ex.status = 'completed' THEN
    RETURN jsonb_build_object('error', 'Exchange already completed');
  END IF;

  IF NOT (v_ex.provider_confirmed AND v_ex.receiver_confirmed) THEN
    RETURN jsonb_build_object('error', 'Both parties must confirm before processing');
  END IF;

  -- Deduct tokens from receiver (person who received the help)
  UPDATE profiles
    SET balance = GREATEST(0, balance - p_tokens)
    WHERE id = v_ex.receiver_id;

  -- Add tokens to provider (person who gave the help)
  UPDATE profiles
    SET balance      = balance + p_tokens,
        total_earned = total_earned + p_tokens
    WHERE id = v_ex.provider_id;

  -- Increment helped count for receiver
  UPDATE profiles
    SET total_helped = total_helped + 1
    WHERE id = v_ex.receiver_id;

  -- Record the transaction in history
  INSERT INTO transactions (provider_id, receiver_id, token_amount, multiplier_applied, post_id)
  VALUES (v_ex.provider_id, v_ex.receiver_id, p_tokens, 1.0, v_ex.post_id);

  -- Mark exchange complete
  UPDATE pending_exchanges
    SET status = 'completed', token_amount = p_tokens
    WHERE id = p_exchange_id;

  RETURN jsonb_build_object('success', true, 'tokens', p_tokens);
END;
$$;

GRANT EXECUTE ON FUNCTION process_exchange(UUID, INT) TO authenticated;


-- ─────────────────────────────────────────────
-- 3. Welcome email webhook trigger
--    In Supabase Dashboard → Authentication → Webhooks (or Database → Webhooks):
--
--    Create a new webhook:
--      Table:  auth.users
--      Events: INSERT
--      URL:    https://<your-project-ref>.supabase.co/functions/v1/welcome-email
--      HTTP Headers:
--        Authorization: Bearer <your-supabase-service-role-key>
--
--    Then deploy the edge function:
--      supabase functions deploy welcome-email --project-ref <your-project-ref>
--
--    Set the RESEND_API_KEY secret:
--      supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx --project-ref <your-project-ref>
--
-- ─────────────────────────────────────────────


-- ─────────────────────────────────────────────
-- 4. Storage: allow post/group photo uploads to the avatars bucket
--    The app uploads post photos to avatars/posts/<user_id>/<timestamp>.<ext>
--    and group photos to avatars/groups/<user_id>/<timestamp>.<ext>.
--    Make sure the avatars bucket is set to PUBLIC in Supabase Storage settings,
--    and that authenticated users can INSERT/UPDATE objects:
-- ─────────────────────────────────────────────
-- Run in Storage policies (Dashboard → Storage → avatars → Policies):
--
-- INSERT policy (if not already permissive):
--   CREATE POLICY "authenticated upload avatars"
--   ON storage.objects FOR INSERT TO authenticated
--   WITH CHECK (bucket_id = 'avatars');
--
-- UPDATE policy:
--   CREATE POLICY "authenticated update avatars"
--   ON storage.objects FOR UPDATE TO authenticated
--   USING (bucket_id = 'avatars');
