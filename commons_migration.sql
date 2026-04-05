-- Commons Migration SQL
-- Run this in the Supabase SQL editor before using the updated app.

-- Add dark_mode to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS dark_mode BOOLEAN DEFAULT FALSE;

-- Communities (create BEFORE adding FK columns to posts/groups)
CREATE TABLE IF NOT EXISTS communities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  creator_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  is_private BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Community members
CREATE TABLE IF NOT EXISTS community_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id UUID REFERENCES communities(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member',
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(community_id, user_id)
);

-- Add community_id to posts and groups (nullable = global)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS community_id UUID REFERENCES communities(id);
ALTER TABLE groups ADD COLUMN IF NOT EXISTS community_id UUID REFERENCES communities(id);

-- Pending exchanges
CREATE TABLE IF NOT EXISTS pending_exchanges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES posts(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  receiver_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending',
  provider_confirmed BOOLEAN DEFAULT FALSE,
  receiver_confirmed BOOLEAN DEFAULT FALSE,
  provider_rated BOOLEAN DEFAULT FALSE,
  receiver_rated BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Exchange ratings (questionnaire results)
CREATE TABLE IF NOT EXISTS exchange_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_id UUID REFERENCES pending_exchanges(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  time_score INT NOT NULL,
  effort_score INT NOT NULL,
  cost_score INT NOT NULL,
  total_score INT NOT NULL,
  tokens_awarded INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(exchange_id, user_id)
);

-- Compliments
CREATE TABLE IF NOT EXISTS compliments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_id UUID REFERENCES pending_exchanges(id) ON DELETE CASCADE,
  from_user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  to_user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: enable and allow authenticated users full access for now
ALTER TABLE communities ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_exchanges ENABLE ROW LEVEL SECURITY;
ALTER TABLE exchange_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all_communities" ON communities;
CREATE POLICY "auth_all_communities" ON communities FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_all_community_members" ON community_members;
CREATE POLICY "auth_all_community_members" ON community_members FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_all_pending_exchanges" ON pending_exchanges;
CREATE POLICY "auth_all_pending_exchanges" ON pending_exchanges FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_all_exchange_ratings" ON exchange_ratings;
CREATE POLICY "auth_all_exchange_ratings" ON exchange_ratings FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "auth_all_compliments" ON compliments;
CREATE POLICY "auth_all_compliments" ON compliments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Group messaging
CREATE TABLE IF NOT EXISTS group_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  sender_name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE group_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth_all_group_messages" ON group_messages;
CREATE POLICY "auth_all_group_messages" ON group_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Photo URLs on posts and groups
ALTER TABLE posts ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS photo_url TEXT;
