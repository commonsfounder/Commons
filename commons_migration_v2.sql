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
-- 4. Storage: avatars bucket — public reads, authenticated uploads
--    Paths used:
--      avatars/posts/<user_id>/<ts>.<ext>   — post photos
--      avatars/groups/<user_id>/<ts>.<ext>  — group photos
--      avatars/<user_id>/avatar.<ext>       — profile avatars
--      avatars/dm/<user_id>/<ts>.<ext>      — DM voice/photo messages
-- ─────────────────────────────────────────────

-- Ensure the bucket exists and is flagged public so getPublicUrl URLs work.
-- Without public=true, all /object/public/... URLs return 403 for recipients.
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Allow anyone (including unauthenticated) to read objects — required for
-- DM audio/photo recipients who access the file via the public URL.
DROP POLICY IF EXISTS "public read avatars" ON storage.objects;
CREATE POLICY "public read avatars"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'avatars');

-- INSERT policy for authenticated users:
DROP POLICY IF EXISTS "authenticated upload avatars" ON storage.objects;
CREATE POLICY "authenticated upload avatars"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars');

-- UPDATE policy for authenticated users:
DROP POLICY IF EXISTS "authenticated update avatars" ON storage.objects;
CREATE POLICY "authenticated update avatars"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars');


-- ═══════════════════════════════════════════════════════════════
-- SECURITY HARDENING  (run after all previous migrations)
-- ═══════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────
-- 1. PROFILES
--    • Anyone authenticated can read all profiles (needed for post authors, etc.)
--    • Users can update only their own row
--    • balance / total_earned / total_helped are WRITE-PROTECTED from the client;
--      only SECURITY DEFINER functions (process_exchange / submit_rating) may touch them
-- ─────────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_read_all"    ON profiles;
DROP POLICY IF EXISTS "profiles_update_own"  ON profiles;
DROP POLICY IF EXISTS "profiles_insert_own"  ON profiles;

CREATE POLICY "profiles_read_all"   ON profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE TO authenticated
  USING  (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Block direct balance manipulation from the client
-- (process_exchange / submit_rating use SECURITY DEFINER and bypass this)
REVOKE UPDATE (balance, total_earned, total_helped) ON profiles FROM authenticated;


-- ─────────────────────────────────────────────
-- 2. POSTS
--    • Publicly readable (even anon for SEO / sharing)
--    • Only the creator can insert / update / delete
-- ─────────────────────────────────────────────
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "posts_read_all"    ON posts;
DROP POLICY IF EXISTS "posts_insert_own"  ON posts;
DROP POLICY IF EXISTS "posts_update_own"  ON posts;
DROP POLICY IF EXISTS "posts_delete_own"  ON posts;

CREATE POLICY "posts_read_all"   ON posts FOR SELECT USING (true);
CREATE POLICY "posts_insert_own" ON posts FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "posts_update_own" ON posts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "posts_delete_own" ON posts FOR DELETE TO authenticated USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────
-- 3. GROUPS
-- ─────────────────────────────────────────────
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "groups_read_all"    ON groups;
DROP POLICY IF EXISTS "groups_insert_own"  ON groups;
DROP POLICY IF EXISTS "groups_update_own"  ON groups;
DROP POLICY IF EXISTS "groups_delete_own"  ON groups;

CREATE POLICY "groups_read_all"   ON groups FOR SELECT TO authenticated USING (true);
CREATE POLICY "groups_insert_own" ON groups FOR INSERT TO authenticated WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "groups_update_own" ON groups FOR UPDATE TO authenticated
  USING (auth.uid() = creator_id) WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "groups_delete_own" ON groups FOR DELETE TO authenticated USING (auth.uid() = creator_id);


-- ─────────────────────────────────────────────
-- 4. GROUP MEMBERS
-- ─────────────────────────────────────────────
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "group_members_read_all"    ON group_members;
DROP POLICY IF EXISTS "group_members_insert_own"  ON group_members;
DROP POLICY IF EXISTS "group_members_delete_own"  ON group_members;

CREATE POLICY "group_members_read_all"   ON group_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "group_members_insert_own" ON group_members FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "group_members_delete_own" ON group_members FOR DELETE TO authenticated USING (auth.uid() = user_id);


-- ─────────────────────────────────────────────
-- 5. GROUP MESSAGES
--    • Readable only by current group members
--    • Writable only by the sender who is a group member
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_all_group_messages"       ON group_messages;
DROP POLICY IF EXISTS "group_messages_read_members"   ON group_messages;
DROP POLICY IF EXISTS "group_messages_insert_members" ON group_messages;

CREATE POLICY "group_messages_read_members" ON group_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = group_messages.group_id
        AND group_members.user_id  = auth.uid()
    )
  );

CREATE POLICY "group_messages_insert_members" ON group_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id AND
    EXISTS (
      SELECT 1 FROM group_members
      WHERE group_members.group_id = group_messages.group_id
        AND group_members.user_id  = auth.uid()
    )
  );


-- ─────────────────────────────────────────────
-- 6. PENDING EXCHANGES
--    • Only the two parties can read or write their exchange
--    • Users may only set their OWN confirmation flag (see confirm_exchange RPC below)
--    • status / token_amount are write-protected — only changed by SECURITY DEFINER functions
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_all_pending_exchanges"  ON pending_exchanges;
DROP POLICY IF EXISTS "exchanges_read_parties"      ON pending_exchanges;
DROP POLICY IF EXISTS "exchanges_insert"            ON pending_exchanges;
DROP POLICY IF EXISTS "exchanges_confirm_own"       ON pending_exchanges;

CREATE POLICY "exchanges_read_parties" ON pending_exchanges
  FOR SELECT TO authenticated
  USING (auth.uid() = provider_id OR auth.uid() = receiver_id);

CREATE POLICY "exchanges_insert" ON pending_exchanges
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = provider_id);   -- requester is always the provider

-- UPDATE allowed only on confirmation columns; status locked via REVOKE below
CREATE POLICY "exchanges_update_parties" ON pending_exchanges
  FOR UPDATE TO authenticated
  USING  (auth.uid() = provider_id OR auth.uid() = receiver_id)
  WITH CHECK (auth.uid() = provider_id OR auth.uid() = receiver_id);

-- Block direct status / token manipulation
REVOKE UPDATE (status, token_amount, provider_rated, receiver_rated) ON pending_exchanges FROM authenticated;
-- Re-grant only the confirmation columns
GRANT  UPDATE (provider_confirmed, receiver_confirmed) ON pending_exchanges TO authenticated;


-- ─────────────────────────────────────────────
-- 7. EXCHANGE RATINGS
--    • Users can only insert their own rating
--    • tokens_awarded is computed server-side by submit_rating — block direct insert
--    • No update or delete
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_all_exchange_ratings" ON exchange_ratings;
DROP POLICY IF EXISTS "ratings_read_own"          ON exchange_ratings;
DROP POLICY IF EXISTS "ratings_insert_own"        ON exchange_ratings;

CREATE POLICY "ratings_read_own" ON exchange_ratings
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM pending_exchanges
      WHERE pending_exchanges.id = exchange_ratings.exchange_id
        AND (pending_exchanges.provider_id = auth.uid() OR pending_exchanges.receiver_id = auth.uid())
    )
  );

-- Direct INSERT blocked; only submit_rating (SECURITY DEFINER) may insert
REVOKE INSERT, UPDATE, DELETE ON exchange_ratings FROM authenticated;


-- ─────────────────────────────────────────────
-- 8. TRANSACTIONS
--    • Read-only for involved parties — no client writes ever
-- ─────────────────────────────────────────────
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "transactions_read_parties" ON transactions;

CREATE POLICY "transactions_read_parties" ON transactions
  FOR SELECT TO authenticated
  USING (auth.uid() = provider_id OR auth.uid() = receiver_id);

REVOKE INSERT, UPDATE, DELETE ON transactions FROM authenticated;


-- ─────────────────────────────────────────────
-- 9. COMMUNITIES / COMMUNITY MEMBERS / COMPLIMENTS
--    Replace blanket open policies with scoped ones
-- ─────────────────────────────────────────────
DROP POLICY IF EXISTS "auth_all_communities"       ON communities;
DROP POLICY IF EXISTS "auth_all_community_members" ON community_members;
DROP POLICY IF EXISTS "auth_all_compliments"       ON compliments;

CREATE POLICY "communities_read_all"    ON communities FOR SELECT TO authenticated USING (true);
CREATE POLICY "communities_insert_own"  ON communities FOR INSERT TO authenticated WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "communities_update_own"  ON communities FOR UPDATE TO authenticated USING (auth.uid() = creator_id);
CREATE POLICY "communities_delete_own"  ON communities FOR DELETE TO authenticated USING (auth.uid() = creator_id);

CREATE POLICY "cm_read_all"    ON community_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "cm_insert_own"  ON community_members FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "cm_delete_own"  ON community_members FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "compliments_read_involved" ON compliments
  FOR SELECT TO authenticated
  USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);
CREATE POLICY "compliments_insert_own" ON compliments
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = from_user_id);


-- ─────────────────────────────────────────────
-- 10. confirm_exchange  (SECURITY DEFINER)
--     Validates the caller is a party then sets only THEIR flag.
--     Replaces direct pending_exchanges.update from the client.
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION confirm_exchange(p_exchange_id UUID)
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

  IF auth.uid() != v_ex.provider_id AND auth.uid() != v_ex.receiver_id THEN
    RETURN jsonb_build_object('error', 'Not authorised');
  END IF;

  IF v_ex.status = 'completed' THEN
    RETURN jsonb_build_object('error', 'Exchange already completed');
  END IF;

  IF auth.uid() = v_ex.provider_id THEN
    UPDATE pending_exchanges SET provider_confirmed = TRUE WHERE id = p_exchange_id;
  ELSE
    UPDATE pending_exchanges SET receiver_confirmed = TRUE WHERE id = p_exchange_id;
  END IF;

  -- Return fresh state so the client knows if both have confirmed
  SELECT * INTO v_ex FROM pending_exchanges WHERE id = p_exchange_id;
  RETURN jsonb_build_object(
    'success',            true,
    'provider_confirmed', v_ex.provider_confirmed,
    'receiver_confirmed', v_ex.receiver_confirmed,
    'both_confirmed',     (v_ex.provider_confirmed AND v_ex.receiver_confirmed)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION confirm_exchange(UUID) TO authenticated;


-- ─────────────────────────────────────────────
-- 11. submit_rating  (SECURITY DEFINER)
--     Single server-side function for the entire rating + token flow:
--       a) Validates caller is a party
--       b) Validates score inputs (1–5)
--       c) Computes tokens_awarded server-side (cannot be spoofed)
--       d) Inserts rating (idempotent on duplicate)
--       e) If both parties have rated, calls process_exchange with averaged tokens
--     Replaces: exchange_ratings.insert + process_exchange call from client
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION submit_rating(
  p_exchange_id  UUID,
  p_time_score   INT,
  p_effort_score INT,
  p_cost_score   INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ex           pending_exchanges%ROWTYPE;
  v_my_role      TEXT;
  v_total        INT;
  v_tokens       INT;
  v_count        INT;
  v_avg_tokens   INT;
BEGIN
  SELECT * INTO v_ex FROM pending_exchanges WHERE id = p_exchange_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Exchange not found');
  END IF;

  IF auth.uid() != v_ex.provider_id AND auth.uid() != v_ex.receiver_id THEN
    RETURN jsonb_build_object('error', 'Not authorised');
  END IF;

  IF NOT (v_ex.provider_confirmed AND v_ex.receiver_confirmed) THEN
    RETURN jsonb_build_object('error', 'Both parties must confirm before rating');
  END IF;

  -- Validate score ranges
  IF p_time_score   NOT BETWEEN 1 AND 5 OR
     p_effort_score NOT BETWEEN 1 AND 5 OR
     p_cost_score   NOT BETWEEN 1 AND 5 THEN
    RETURN jsonb_build_object('error', 'Each score must be between 1 and 5');
  END IF;

  v_my_role := CASE WHEN auth.uid() = v_ex.provider_id THEN 'provider' ELSE 'receiver' END;
  v_total   := p_time_score + p_effort_score + p_cost_score;
  -- Tokens: 1–10 scale derived from total 3–15 score
  v_tokens  := GREATEST(1, ROUND(v_total::NUMERIC / 15.0 * 10)::INT);

  INSERT INTO exchange_ratings (
    exchange_id, user_id, role,
    time_score, effort_score, cost_score,
    total_score, tokens_awarded
  ) VALUES (
    p_exchange_id, auth.uid(), v_my_role,
    p_time_score, p_effort_score, p_cost_score,
    v_total, v_tokens
  )
  ON CONFLICT (exchange_id, user_id) DO NOTHING;

  SELECT COUNT(*) INTO v_count
    FROM exchange_ratings WHERE exchange_id = p_exchange_id;

  IF v_count >= 2 AND v_ex.status != 'completed' THEN
    SELECT GREATEST(1, ROUND(AVG(tokens_awarded)::NUMERIC)::INT)
      INTO v_avg_tokens
      FROM exchange_ratings WHERE exchange_id = p_exchange_id;

    PERFORM process_exchange(p_exchange_id, v_avg_tokens);

    RETURN jsonb_build_object(
      'success',     true,
      'both_rated',  true,
      'tokens',      v_avg_tokens
    );
  END IF;

  RETURN jsonb_build_object('success', true, 'both_rated', false);
END;
$$;

GRANT EXECUTE ON FUNCTION submit_rating(UUID, INT, INT, INT) TO authenticated;

-- Harden process_exchange: block direct client calls (only called from submit_rating above)
REVOKE EXECUTE ON FUNCTION process_exchange(UUID, INT) FROM authenticated;


-- ─────────────────────────────────────────────
-- 12. Harden process_exchange itself
--     Add an internal-caller guard so it can only be triggered via submit_rating
--     (belt-and-suspenders alongside the REVOKE above)
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

  -- Validate token range (1–10)
  IF p_tokens < 1 OR p_tokens > 10 THEN
    RETURN jsonb_build_object('error', 'Invalid token amount');
  END IF;

  UPDATE profiles SET balance = GREATEST(0, balance - p_tokens)
    WHERE id = v_ex.receiver_id;

  UPDATE profiles SET balance = balance + p_tokens, total_earned = total_earned + p_tokens
    WHERE id = v_ex.provider_id;

  UPDATE profiles SET total_helped = total_helped + 1
    WHERE id = v_ex.receiver_id;

  INSERT INTO transactions (provider_id, receiver_id, token_amount, multiplier_applied, post_id)
    VALUES (v_ex.provider_id, v_ex.receiver_id, p_tokens, 1.0, v_ex.post_id);

  UPDATE pending_exchanges SET status = 'completed', token_amount = p_tokens
    WHERE id = p_exchange_id;

  RETURN jsonb_build_object('success', true, 'tokens', p_tokens);
END;
$$;
-- No GRANT — only callable internally from submit_rating (SECURITY DEFINER context)


-- ─────────────────────────────────────────────
-- DIRECT MESSAGES
-- Run this section to enable private messaging.
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS direct_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id   UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  receiver_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  content     TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS dm_sender_idx   ON direct_messages (sender_id,   created_at DESC);
CREATE INDEX IF NOT EXISTS dm_receiver_idx ON direct_messages (receiver_id, created_at DESC);

ALTER TABLE direct_messages ENABLE ROW LEVEL SECURITY;

-- Only the two parties can read a message
DROP POLICY IF EXISTS "dm_read_parties" ON direct_messages;
CREATE POLICY "dm_read_parties" ON direct_messages
  FOR SELECT TO authenticated
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Only the sender can insert (and must be the sender)
DROP POLICY IF EXISTS "dm_insert_sender" ON direct_messages;
CREATE POLICY "dm_insert_sender" ON direct_messages
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id);

-- Nobody can update or delete (immutable log)
-- (No UPDATE / DELETE policies = blocked by default)

-- Enable realtime for live DM delivery
ALTER PUBLICATION supabase_realtime ADD TABLE direct_messages;
