-- Ranking Calculation Simulation Script
-- This script creates test data for communities with various metrics to test ranking calculations
-- Run this script to populate the database with test communities
-- 
-- Note: Make sure to truncate tables before running this script if you want a clean slate
-- TRUNCATE TABLE community_posts, community_places, community_members, community_ranking_metrics, communities CASCADE;

-- ============================================================================
-- 1. CREATE COMMUNITIES WITH DIFFERENT AGES
-- ============================================================================

-- Very new community (2 days old) - should get max boost (1.15x)
INSERT INTO communities (id, name, description, owner_address, private, unlisted, active, created_at, updated_at)
VALUES 
  ('11111111-1111-1111-1111-111111111111', 'Test Community - Brand New', 
   'A brand new community created just 2 days ago with minimal activity', 
   '0x1111111111111111111111111111111111111111', false, false, true,
   NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days');

-- New community (5 days old) - should get max boost (1.15x)
INSERT INTO communities (id, name, description, owner_address, private, unlisted, active, created_at, updated_at)
VALUES 
  ('22222222-2222-2222-2222-222222222222', 'Test Community - New Active', 
   'A new community with good initial activity', 
   '0x2222222222222222222222222222222222222222', false, false, true,
   NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days');

-- Medium-age community (15 days old) - should get partial boost (~1.10x)
INSERT INTO communities (id, name, description, owner_address, private, unlisted, active, created_at, updated_at)
VALUES 
  ('33333333-3333-3333-3333-333333333333', 'Test Community - Growing', 
   'A community that has been around for a couple weeks and is growing', 
   '0x3333333333333333333333333333333333333333', false, false, true,
   NOW() - INTERVAL '15 days', NOW() - INTERVAL '15 days');

-- Older community (35 days old) - should get no boost (1.0x)
INSERT INTO communities (id, name, description, owner_address, private, unlisted, active, created_at, updated_at)
VALUES 
  ('44444444-4444-4444-4444-444444444444', 'Test Community - Established', 
   'An established community with lots of activity and history', 
   '0x4444444444444444444444444444444444444444', false, false, true,
   NOW() - INTERVAL '35 days', NOW() - INTERVAL '35 days');

-- Very old community (90 days old) - should get no boost (1.0x)
INSERT INTO communities (id, name, description, owner_address, private, unlisted, active, created_at, updated_at)
VALUES 
  ('55555555-5555-5555-5555-555555555555', 'Test Community - Veteran', 
   'A veteran community with extensive history and high engagement', 
   '0x5555555555555555555555555555555555555555', false, false, true,
   NOW() - INTERVAL '90 days', NOW() - INTERVAL '90 days');

-- New community without description (to test hasDescription metric)
INSERT INTO communities (id, name, description, owner_address, private, unlisted, active, created_at, updated_at)
VALUES 
  ('66666666-6666-6666-6666-666666666666', 'Test Community - No Description', 
   '', 
   '0x6666666666666666666666666666666666666666', false, false, true,
   NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days');

-- ============================================================================
-- 2. ADD COMMUNITY MEMBERS (including recent joins for newMembersCount)
-- ============================================================================

-- ============================================================================
-- BOOST CONFIGURATION (Updated)
-- ============================================================================
-- Maximum boost: 1.15x (15% increase) for communities 0-7 days old
-- Minimum boost: 1.05x (5% increase) for communities 7-30 days old
-- No boost: Communities 30+ days old
--
-- This configuration prevents new communities from outranking established ones
-- while still protecting them from being penalized too heavily for lack of metrics.

-- Community 1 (Brand New): 5 members, 3 joined in last 7 days
-- Note: community_members uses composite primary key (community_id, member_address), no id column
INSERT INTO community_members (community_id, member_address, role, joined_at)
VALUES 
  ('11111111-1111-1111-1111-111111111111', '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'owner', NOW() - INTERVAL '2 days'),
  ('11111111-1111-1111-1111-111111111111', '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'member', NOW() - INTERVAL '1 day'),
  ('11111111-1111-1111-1111-111111111111', '0xcccccccccccccccccccccccccccccccccccccccc', 'member', NOW() - INTERVAL '2 days'),
  ('11111111-1111-1111-1111-111111111111', '0xdddddddddddddddddddddddddddddddddddddddd', 'member', NOW() - INTERVAL '3 days'),
  ('11111111-1111-1111-1111-111111111111', '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', 'member', NOW() - INTERVAL '4 days');

-- Community 2 (New Active): 15 members, 8 joined in last 7 days
INSERT INTO community_members (community_id, member_address, role, joined_at)
VALUES 
  ('22222222-2222-2222-2222-222222222222', '0x2111111111111111111111111111111111111111', 'owner', NOW() - INTERVAL '5 days'),
  ('22222222-2222-2222-2222-222222222222', '0x2222222222222222222222222222222222222222', 'member', NOW() - INTERVAL '1 day'),
  ('22222222-2222-2222-2222-222222222222', '0x2333333333333333333333333333333333333333', 'member', NOW() - INTERVAL '2 days'),
  ('22222222-2222-2222-2222-222222222222', '0x2444444444444444444444444444444444444444', 'member', NOW() - INTERVAL '3 days'),
  ('22222222-2222-2222-2222-222222222222', '0x2555555555555555555555555555555555555555', 'member', NOW() - INTERVAL '4 days'),
  ('22222222-2222-2222-2222-222222222222', '0x2666666666666666666666666666666666666666', 'member', NOW() - INTERVAL '5 days'),
  ('22222222-2222-2222-2222-222222222222', '0x2777777777777777777777777777777777777777', 'member', NOW() - INTERVAL '6 days'),
  ('22222222-2222-2222-2222-222222222222', '0x2888888888888888888888888888888888888888', 'member', NOW() - INTERVAL '7 days'),
  ('22222222-2222-2222-2222-222222222222', '0x2999999999999999999999999999999999999999', 'member', NOW() - INTERVAL '10 days'),
  ('22222222-2222-2222-2222-222222222222', '0x2aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'member', NOW() - INTERVAL '10 days'),
  ('22222222-2222-2222-2222-222222222222', '0x2bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'member', NOW() - INTERVAL '10 days'),
  ('22222222-2222-2222-2222-222222222222', '0x2ccccccccccccccccccccccccccccccccccccccc', 'member', NOW() - INTERVAL '10 days'),
  ('22222222-2222-2222-2222-222222222222', '0x2ddddddddddddddddddddddddddddddddddddddd', 'member', NOW() - INTERVAL '10 days'),
  ('22222222-2222-2222-2222-222222222222', '0x2eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', 'member', NOW() - INTERVAL '10 days'),
  ('22222222-2222-2222-2222-222222222222', '0x2fffffffffffffffffffffffffffffffffffffff', 'member', NOW() - INTERVAL '10 days');

-- Community 3 (Growing): 30 members, 12 joined in last 7 days
-- Using a simpler approach with individual INSERTs for recent members
INSERT INTO community_members (community_id, member_address, role, joined_at)
VALUES 
  ('33333333-3333-3333-3333-333333333333', '0x3111111111111111111111111111111111111111', 'owner', NOW() - INTERVAL '15 days'),
  ('33333333-3333-3333-3333-333333333333', '0x3222222222222222222222222222222222222222', 'moderator', NOW() - INTERVAL '15 days'),
  ('33333333-3333-3333-3333-333333333333', '0x3333333333333333333333333333333333333333', 'moderator', NOW() - INTERVAL '15 days'),
  ('33333333-3333-3333-3333-333333333333', '0x3444444444444444444444444444444444444444', 'member', NOW() - INTERVAL '1 day'),
  ('33333333-3333-3333-3333-333333333333', '0x3555555555555555555555555555555555555555', 'member', NOW() - INTERVAL '2 days'),
  ('33333333-3333-3333-3333-333333333333', '0x3666666666666666666666666666666666666666', 'member', NOW() - INTERVAL '3 days'),
  ('33333333-3333-3333-3333-333333333333', '0x3777777777777777777777777777777777777777', 'member', NOW() - INTERVAL '4 days'),
  ('33333333-3333-3333-3333-333333333333', '0x3888888888888888888888888888888888888888', 'member', NOW() - INTERVAL '5 days'),
  ('33333333-3333-3333-3333-333333333333', '0x3999999999999999999999999999999999999999', 'member', NOW() - INTERVAL '6 days'),
  ('33333333-3333-3333-3333-333333333333', '0x3aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'member', NOW() - INTERVAL '7 days'),
  ('33333333-3333-3333-3333-333333333333', '0x3bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'member', NOW() - INTERVAL '1 day'),
  ('33333333-3333-3333-3333-333333333333', '0x3ccccccccccccccccccccccccccccccccccccccc', 'member', NOW() - INTERVAL '2 days'),
  ('33333333-3333-3333-3333-333333333333', '0x3ddddddddddddddddddddddddddddddddddddddd', 'member', NOW() - INTERVAL '3 days'),
  ('33333333-3333-3333-3333-333333333333', '0x3eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', 'member', NOW() - INTERVAL '4 days'),
  ('33333333-3333-3333-3333-333333333333', '0x3fffffffffffffffffffffffffffffffffffffff', 'member', NOW() - INTERVAL '20 days'),
  ('33333333-3333-3333-3333-333333333333', '0x4000000000000000000000000000000000000000', 'member', NOW() - INTERVAL '20 days'),
  ('33333333-3333-3333-3333-333333333333', '0x4111111111111111111111111111111111111111', 'member', NOW() - INTERVAL '20 days'),
  ('33333333-3333-3333-3333-333333333333', '0x4222222222222222222222222222222222222222', 'member', NOW() - INTERVAL '20 days'),
  ('33333333-3333-3333-3333-333333333333', '0x4333333333333333333333333333333333333333', 'member', NOW() - INTERVAL '20 days'),
  ('33333333-3333-3333-3333-333333333333', '0x4444444444444444444444444444444444444444', 'member', NOW() - INTERVAL '20 days'),
  ('33333333-3333-3333-3333-333333333333', '0x4555555555555555555555555555555555555555', 'member', NOW() - INTERVAL '20 days'),
  ('33333333-3333-3333-3333-333333333333', '0x4666666666666666666666666666666666666666', 'member', NOW() - INTERVAL '20 days'),
  ('33333333-3333-3333-3333-333333333333', '0x4777777777777777777777777777777777777777', 'member', NOW() - INTERVAL '20 days'),
  ('33333333-3333-3333-3333-333333333333', '0x4888888888888888888888888888888888888888', 'member', NOW() - INTERVAL '20 days'),
  ('33333333-3333-3333-3333-333333333333', '0x4999999999999999999999999999999999999999', 'member', NOW() - INTERVAL '20 days'),
  ('33333333-3333-3333-3333-333333333333', '0x4aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'member', NOW() - INTERVAL '20 days'),
  ('33333333-3333-3333-3333-333333333333', '0x4bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'member', NOW() - INTERVAL '20 days'),
  ('33333333-3333-3333-3333-333333333333', '0x4ccccccccccccccccccccccccccccccccccccccc', 'member', NOW() - INTERVAL '20 days'),
  ('33333333-3333-3333-3333-333333333333', '0x4ddddddddddddddddddddddddddddddddddddddd', 'member', NOW() - INTERVAL '20 days'),
  ('33333333-3333-3333-3333-333333333333', '0x4eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', 'member', NOW() - INTERVAL '20 days');

-- Community 4 (Established): 50 members, 5 joined in last 7 days
-- Insert owner and moderators first
INSERT INTO community_members (community_id, member_address, role, joined_at)
VALUES 
  ('44444444-4444-4444-4444-444444444444', '0x4111111111111111111111111111111111111111', 'owner', NOW() - INTERVAL '35 days'),
  ('44444444-4444-4444-4444-444444444444', '0x4222222222222222222222222222222222222222', 'moderator', NOW() - INTERVAL '35 days'),
  ('44444444-4444-4444-4444-444444444444', '0x4333333333333333333333333333333333333333', 'moderator', NOW() - INTERVAL '35 days'),
  ('44444444-4444-4444-4444-444444444444', '0x4444444444444444444444444444444444444444', 'moderator', NOW() - INTERVAL '35 days'),
  ('44444444-4444-4444-4444-444444444444', '0x4555555555555555555555555555555555555555', 'moderator', NOW() - INTERVAL '35 days'),
  ('44444444-4444-4444-4444-444444444444', '0x4666666666666666666666666666666666666666', 'moderator', NOW() - INTERVAL '35 days');

-- Insert 5 recent members
INSERT INTO community_members (community_id, member_address, role, joined_at)
VALUES 
  ('44444444-4444-4444-4444-444444444444', '0x4777777777777777777777777777777777777777', 'member', NOW() - INTERVAL '1 day'),
  ('44444444-4444-4444-4444-444444444444', '0x4888888888888888888888888888888888888888', 'member', NOW() - INTERVAL '2 days'),
  ('44444444-4444-4444-4444-444444444444', '0x4999999999999999999999999999999999999999', 'member', NOW() - INTERVAL '3 days'),
  ('44444444-4444-4444-4444-444444444444', '0x4aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'member', NOW() - INTERVAL '4 days'),
  ('44444444-4444-4444-4444-444444444444', '0x4bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'member', NOW() - INTERVAL '5 days');

-- Insert remaining older members (we'll use a loop approach for simplicity)
DO $$
DECLARE
  i INTEGER;
BEGIN
  FOR i IN 1..39 LOOP
    INSERT INTO community_members (community_id, member_address, role, joined_at)
    VALUES (
      '44444444-4444-4444-4444-444444444444',
      '0x' || LPAD(TO_HEX(i + 1000), 40, '4'),
      'member',
      NOW() - INTERVAL '30 days'
    );
  END LOOP;
END $$;

-- Community 5 (Veteran): 100 members, 2 joined in last 7 days
-- Insert owner and moderators
INSERT INTO community_members (community_id, member_address, role, joined_at)
VALUES 
  ('55555555-5555-5555-5555-555555555555', '0x5111111111111111111111111111111111111111', 'owner', NOW() - INTERVAL '90 days'),
  ('55555555-5555-5555-5555-555555555555', '0x5222222222222222222222222222222222222222', 'moderator', NOW() - INTERVAL '90 days'),
  ('55555555-5555-5555-5555-555555555555', '0x5333333333333333333333333333333333333333', 'moderator', NOW() - INTERVAL '90 days'),
  ('55555555-5555-5555-5555-555555555555', '0x5444444444444444444444444444444444444444', 'moderator', NOW() - INTERVAL '90 days'),
  ('55555555-5555-5555-5555-555555555555', '0x5555555555555555555555555555555555555555', 'moderator', NOW() - INTERVAL '90 days'),
  ('55555555-5555-5555-5555-555555555555', '0x5666666666666666666666666666666666666666', 'moderator', NOW() - INTERVAL '90 days'),
  ('55555555-5555-5555-5555-555555555555', '0x5777777777777777777777777777777777777777', 'moderator', NOW() - INTERVAL '90 days'),
  ('55555555-5555-5555-5555-555555555555', '0x5888888888888888888888888888888888888888', 'moderator', NOW() - INTERVAL '90 days'),
  ('55555555-5555-5555-5555-555555555555', '0x5999999999999999999999999999999999999999', 'moderator', NOW() - INTERVAL '90 days'),
  ('55555555-5555-5555-5555-555555555555', '0x5aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'moderator', NOW() - INTERVAL '90 days'),
  ('55555555-5555-5555-5555-555555555555', '0x5bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'moderator', NOW() - INTERVAL '90 days');

-- Insert 2 recent members
INSERT INTO community_members (community_id, member_address, role, joined_at)
VALUES 
  ('55555555-5555-5555-5555-555555555555', '0x5ccccccccccccccccccccccccccccccccccccccc', 'member', NOW() - INTERVAL '1 day'),
  ('55555555-5555-5555-5555-555555555555', '0x5ddddddddddddddddddddddddddddddddddddddd', 'member', NOW() - INTERVAL '2 days');

-- Insert remaining older members
DO $$
DECLARE
  i INTEGER;
BEGIN
  FOR i IN 1..87 LOOP
    INSERT INTO community_members (community_id, member_address, role, joined_at)
    VALUES (
      '55555555-5555-5555-5555-555555555555',
      '0x' || LPAD(TO_HEX(i + 2000), 40, '5'),
      'member',
      NOW() - INTERVAL '60 days'
    );
  END LOOP;
END $$;

-- Community 6 (No Description): 2 members, both joined recently
INSERT INTO community_members (community_id, member_address, role, joined_at)
VALUES 
  ('66666666-6666-6666-6666-666666666666', '0xffffffffffffffffffffffffffffffffffffffff', 'owner', NOW() - INTERVAL '3 days'),
  ('66666666-6666-6666-6666-666666666666', '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', 'member', NOW() - INTERVAL '2 days');

-- ============================================================================
-- 3. ADD COMMUNITY PLACES
-- ============================================================================

-- Community 1: 2 places
-- Note: community_places only has id, community_id, added_by, added_at (place_type, position, world_name were removed)
INSERT INTO community_places (id, community_id, added_by, added_at)
VALUES 
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', '0x1111111111111111111111111111111111111111', NOW() - INTERVAL '1 day'),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', '0x1111111111111111111111111111111111111111', NOW() - INTERVAL '1 day');

-- Community 2: 5 places
INSERT INTO community_places (id, community_id, added_by, added_at)
VALUES 
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', '0x2222222222222222222222222222222222222222', NOW() - INTERVAL '1 day'),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', '0x2222222222222222222222222222222222222222', NOW() - INTERVAL '2 days'),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', '0x2222222222222222222222222222222222222222', NOW() - INTERVAL '3 days'),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', '0x2222222222222222222222222222222222222222', NOW() - INTERVAL '4 days'),
  (gen_random_uuid(), '22222222-2222-2222-2222-222222222222', '0x2222222222222222222222222222222222222222', NOW() - INTERVAL '5 days');

-- Community 3: 8 places
INSERT INTO community_places (id, community_id, added_by, added_at)
VALUES 
  (gen_random_uuid(), '33333333-3333-3333-3333-333333333333', '0x3333333333333333333333333333333333333333', NOW() - INTERVAL '1 day'),
  (gen_random_uuid(), '33333333-3333-3333-3333-333333333333', '0x3333333333333333333333333333333333333333', NOW() - INTERVAL '2 days'),
  (gen_random_uuid(), '33333333-3333-3333-3333-333333333333', '0x3333333333333333333333333333333333333333', NOW() - INTERVAL '3 days'),
  (gen_random_uuid(), '33333333-3333-3333-3333-333333333333', '0x3333333333333333333333333333333333333333', NOW() - INTERVAL '4 days'),
  (gen_random_uuid(), '33333333-3333-3333-3333-333333333333', '0x3333333333333333333333333333333333333333', NOW() - INTERVAL '5 days'),
  (gen_random_uuid(), '33333333-3333-3333-3333-333333333333', '0x3333333333333333333333333333333333333333', NOW() - INTERVAL '6 days'),
  (gen_random_uuid(), '33333333-3333-3333-3333-333333333333', '0x3333333333333333333333333333333333333333', NOW() - INTERVAL '7 days'),
  (gen_random_uuid(), '33333333-3333-3333-3333-333333333333', '0x3333333333333333333333333333333333333333', NOW() - INTERVAL '8 days');

-- Community 4: 10 places (max normalization)
INSERT INTO community_places (id, community_id, added_by, added_at)
VALUES 
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444444', '0x4444444444444444444444444444444444444444', NOW() - INTERVAL '1 day'),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444444', '0x4444444444444444444444444444444444444444', NOW() - INTERVAL '2 days'),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444444', '0x4444444444444444444444444444444444444444', NOW() - INTERVAL '3 days'),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444444', '0x4444444444444444444444444444444444444444', NOW() - INTERVAL '4 days'),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444444', '0x4444444444444444444444444444444444444444', NOW() - INTERVAL '5 days'),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444444', '0x4444444444444444444444444444444444444444', NOW() - INTERVAL '6 days'),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444444', '0x4444444444444444444444444444444444444444', NOW() - INTERVAL '7 days'),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444444', '0x4444444444444444444444444444444444444444', NOW() - INTERVAL '8 days'),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444444', '0x4444444444444444444444444444444444444444', NOW() - INTERVAL '9 days'),
  (gen_random_uuid(), '44444444-4444-4444-4444-444444444444', '0x4444444444444444444444444444444444444444', NOW() - INTERVAL '10 days');

-- Community 5: 12 places (above max, will be normalized to 1.0)
INSERT INTO community_places (id, community_id, added_by, added_at)
VALUES 
  (gen_random_uuid(), '55555555-5555-5555-5555-555555555555', '0x5555555555555555555555555555555555555555', NOW() - INTERVAL '1 day'),
  (gen_random_uuid(), '55555555-5555-5555-5555-555555555555', '0x5555555555555555555555555555555555555555', NOW() - INTERVAL '2 days'),
  (gen_random_uuid(), '55555555-5555-5555-5555-555555555555', '0x5555555555555555555555555555555555555555', NOW() - INTERVAL '3 days'),
  (gen_random_uuid(), '55555555-5555-5555-5555-555555555555', '0x5555555555555555555555555555555555555555', NOW() - INTERVAL '4 days'),
  (gen_random_uuid(), '55555555-5555-5555-5555-555555555555', '0x5555555555555555555555555555555555555555', NOW() - INTERVAL '5 days'),
  (gen_random_uuid(), '55555555-5555-5555-5555-555555555555', '0x5555555555555555555555555555555555555555', NOW() - INTERVAL '6 days'),
  (gen_random_uuid(), '55555555-5555-5555-5555-555555555555', '0x5555555555555555555555555555555555555555', NOW() - INTERVAL '7 days'),
  (gen_random_uuid(), '55555555-5555-5555-5555-555555555555', '0x5555555555555555555555555555555555555555', NOW() - INTERVAL '8 days'),
  (gen_random_uuid(), '55555555-5555-5555-5555-555555555555', '0x5555555555555555555555555555555555555555', NOW() - INTERVAL '9 days'),
  (gen_random_uuid(), '55555555-5555-5555-5555-555555555555', '0x5555555555555555555555555555555555555555', NOW() - INTERVAL '10 days'),
  (gen_random_uuid(), '55555555-5555-5555-5555-555555555555', '0x5555555555555555555555555555555555555555', NOW() - INTERVAL '11 days'),
  (gen_random_uuid(), '55555555-5555-5555-5555-555555555555', '0x5555555555555555555555555555555555555555', NOW() - INTERVAL '12 days');

-- Community 6: 0 places
-- (No places inserted)

-- ============================================================================
-- 4. ADD COMMUNITY POSTS
-- ============================================================================

-- Community 1: 5 posts
INSERT INTO community_posts (id, community_id, author_address, content, created_at)
VALUES 
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'Post content 1', NOW() - INTERVAL '1 hour'),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', 'Post content 2', NOW() - INTERVAL '2 hours'),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', '0xcccccccccccccccccccccccccccccccccccccccc', 'Post content 3', NOW() - INTERVAL '3 hours'),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', '0xdddddddddddddddddddddddddddddddddddddddd', 'Post content 4', NOW() - INTERVAL '4 hours'),
  (gen_random_uuid(), '11111111-1111-1111-1111-111111111111', '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', 'Post content 5', NOW() - INTERVAL '5 hours');

-- Community 2: 15 posts (using DO block for simplicity)
DO $$
DECLARE
  i INTEGER;
BEGIN
  FOR i IN 1..15 LOOP
    INSERT INTO community_posts (id, community_id, author_address, content, created_at)
    VALUES (
      gen_random_uuid(),
      '22222222-2222-2222-2222-222222222222',
      '0x' || LPAD(TO_HEX(i + 2000), 40, 'b'),
      'Post content ' || i,
      NOW() - INTERVAL '1 hour' * i
    );
  END LOOP;
END $$;

-- Community 3: 25 posts
DO $$
DECLARE
  i INTEGER;
BEGIN
  FOR i IN 1..25 LOOP
    INSERT INTO community_posts (id, community_id, author_address, content, created_at)
    VALUES (
      gen_random_uuid(),
      '33333333-3333-3333-3333-333333333333',
      '0x' || LPAD(TO_HEX(i + 3000), 40, 'c'),
      'Post content ' || i,
      NOW() - INTERVAL '1 hour' * i
    );
  END LOOP;
END $$;

-- Community 4: 50 posts
DO $$
DECLARE
  i INTEGER;
BEGIN
  FOR i IN 1..50 LOOP
    INSERT INTO community_posts (id, community_id, author_address, content, created_at)
    VALUES (
      gen_random_uuid(),
      '44444444-4444-4444-4444-444444444444',
      '0x' || LPAD(TO_HEX(i + 4000), 40, 'd'),
      'Post content ' || i,
      NOW() - INTERVAL '1 hour' * i
    );
  END LOOP;
END $$;

-- Community 5: 100 posts (max normalization)
DO $$
DECLARE
  i INTEGER;
BEGIN
  FOR i IN 1..100 LOOP
    INSERT INTO community_posts (id, community_id, author_address, content, created_at)
    VALUES (
      gen_random_uuid(),
      '55555555-5555-5555-5555-555555555555',
      '0x' || LPAD(TO_HEX(i + 5000), 40, 'e'),
      'Post content ' || i,
      NOW() - INTERVAL '1 hour' * i
    );
  END LOOP;
END $$;

-- Community 6: 0 posts
-- (No posts inserted)

-- ============================================================================
-- 5. ADD RANKING METRICS (events, photos, streams, attendees, participants, thumbnail)
-- ============================================================================

-- Community 1: Minimal metrics (new community)
INSERT INTO community_ranking_metrics (community_id, events_count, photos_count, streams_count, events_total_attendees, streams_total_participants, has_thumbnail, updated_at)
VALUES 
  ('11111111-1111-1111-1111-111111111111', 1, 2, 0, 10, 0, true, NOW());

-- Community 2: Moderate metrics (new active community)
INSERT INTO community_ranking_metrics (community_id, events_count, photos_count, streams_count, events_total_attendees, streams_total_participants, has_thumbnail, updated_at)
VALUES 
  ('22222222-2222-2222-2222-222222222222', 5, 15, 2, 150, 50, true, NOW());

-- Community 3: Good metrics (growing community)
INSERT INTO community_ranking_metrics (community_id, events_count, photos_count, streams_count, events_total_attendees, streams_total_participants, has_thumbnail, updated_at)
VALUES 
  ('33333333-3333-3333-3333-333333333333', 12, 40, 5, 400, 200, true, NOW());

-- Community 4: High metrics (established community)
INSERT INTO community_ranking_metrics (community_id, events_count, photos_count, streams_count, events_total_attendees, streams_total_participants, has_thumbnail, updated_at)
VALUES 
  ('44444444-4444-4444-4444-444444444444', 30, 80, 10, 800, 400, true, NOW());

-- Community 5: Very high metrics (veteran community, will hit max normalization)
INSERT INTO community_ranking_metrics (community_id, events_count, photos_count, streams_count, events_total_attendees, streams_total_participants, has_thumbnail, updated_at)
VALUES 
  ('55555555-5555-5555-5555-555555555555', 60, 150, 20, 2000, 1000, true, NOW());

-- Community 6: No metrics, no thumbnail (to test edge case)
INSERT INTO community_ranking_metrics (community_id, events_count, photos_count, streams_count, events_total_attendees, streams_total_participants, has_thumbnail, updated_at)
VALUES 
  ('66666666-6666-6666-6666-666666666666', 0, 0, 0, 0, 0, false, NOW());

-- ============================================================================
-- 6. SUMMARY QUERY TO VIEW TEST DATA
-- ============================================================================

-- View all test communities with their metrics and calculated age
SELECT 
  c.id,
  c.name,
  c.description,
  (NOW()::date - c.created_at::date) AS age_in_days,
  CASE 
    WHEN (NOW()::date - c.created_at::date) <= 7 THEN 'Max Boost (1.15x)'
    WHEN (NOW()::date - c.created_at::date) <= 30 THEN 'Partial Boost (1.05x-1.15x)'
    ELSE 'No Boost (1.0x)'
  END AS boost_status,
  COALESCE(COUNT(DISTINCT cm.member_address), 0) AS total_members,
  COUNT(DISTINCT CASE WHEN cm.joined_at >= NOW() - INTERVAL '7 days' THEN cm.member_address END) AS new_members_7d,
  COUNT(DISTINCT cp.id) AS places_count,
  COUNT(DISTINCT post.id) AS posts_count,
  COALESCE(crm.events_count, 0) AS events_count,
  COALESCE(crm.photos_count, 0) AS photos_count,
  COALESCE(crm.streams_count, 0) AS streams_count,
  COALESCE(crm.events_total_attendees, 0) AS events_attendees,
  COALESCE(crm.streams_total_participants, 0) AS streams_participants,
  COALESCE(crm.has_thumbnail, false) AS has_thumbnail,
  CASE WHEN c.description IS NOT NULL AND TRIM(c.description) != '' THEN true ELSE false END AS has_description,
  COALESCE(c.ranking_score, 0) AS current_ranking_score,
  c.last_score_calculated_at
FROM communities c
LEFT JOIN community_members cm ON c.id = cm.community_id
LEFT JOIN community_places cp ON c.id = cp.community_id
LEFT JOIN community_posts post ON c.id = post.community_id
LEFT JOIN community_ranking_metrics crm ON c.id = crm.community_id
WHERE c.name LIKE 'Test Community%'
GROUP BY c.id, c.name, c.description, c.created_at, c.ranking_score, c.last_score_calculated_at, 
         crm.events_count, crm.photos_count, crm.streams_count, crm.events_total_attendees, 
         crm.streams_total_participants, crm.has_thumbnail
ORDER BY age_in_days ASC;

-- ============================================================================
-- 7. ACTUAL RANKING RESULTS AND ANALYSIS
-- ============================================================================
-- 
-- Actual ranking order after calculation (sortBy: 'ranking'):
-- 
-- 1. Community 5 (Veteran) - Score: 0.85588306
--    - Age: 90 days (no boost = 1.0x)
--    - Metrics: 60 events, 150 photos, 20 streams, 2000 attendees, 1000 participants
--    - 100 members (2 new), 100 posts, 12 places
--    - Has thumbnail + description
--    - Analysis: Excellent base metrics, ranks highest as expected
--
-- 2. Community 4 (Established) - Score: 0.8373388
--    - Age: 35 days (no boost = 1.0x)
--    - Metrics: 30 events, 80 photos, 10 streams, 800 attendees, 400 participants
--    - 50 members (5 new), 50 posts, 10 places
--    - Has thumbnail + description
--    - Analysis: High base metrics, ranks second as expected
--
-- 3. Community 3 (Growing) - Score: 0.7745484
--    - Age: 15 days (partial age-based boost ~1.10x, but reduced by score)
--    - Metrics: 12 events, 40 photos, 5 streams, 400 attendees, 200 participants
--    - 30 members (12 new), 25 posts, 8 places
--    - Has thumbnail + description
--    - Analysis: High normalized score (~0.77) reduces boost significantly
--    - Boost formula: ageBasedBoost - (normalizedScore * 0.3) = 1.10 - (0.77 * 0.3) ≈ 0.87x
--    - Final score: ~0.77 * 0.87 ≈ 0.77 (no effective boost due to high score)
--
-- 4. Community 2 (New Active) - Score: 0.653395
--    - Age: 5 days (max age-based boost 1.15x, reduced by score)
--    - Metrics: 5 events, 15 photos, 2 streams, 150 attendees, 50 participants
--    - 15 members (8 new), 15 posts, 5 places
--    - Has thumbnail + description
--    - Analysis: Moderate normalized score (~0.57) gets partial boost reduction
--    - Boost formula: 1.15 - (0.57 * 0.3) ≈ 0.98x
--    - Final score: ~0.57 * 0.98 ≈ 0.65
--
-- 5. Community 1 (Brand New) - Score: 0.46508053
--    - Age: 2 days (max age-based boost 1.15x, reduced by score)
--    - Metrics: 1 event, 2 photos, 0 streams, 10 attendees, 0 participants
--    - 5 members (3 new), 5 posts, 2 places
--    - Has thumbnail + description
--    - Analysis: Low normalized score (~0.40) gets minimal boost reduction
--    - Boost formula: 1.15 - (0.40 * 0.3) ≈ 1.03x
--    - Final score: ~0.40 * 1.03 ≈ 0.46
--
-- 6. Community 6 (No Description) - Score: 0.063328646
--    - Age: 3 days (max age-based boost 1.15x, reduced by score)
--    - Metrics: 0 events, 0 photos, 0 streams, 0 attendees, 0 participants
--    - 2 members, 0 posts, 0 places
--    - No thumbnail, no description
--    - Analysis: Very low normalized score (~0.055) gets minimal boost reduction
--    - Boost formula: 1.15 - (0.055 * 0.3) ≈ 1.13x
--    - Final score: ~0.055 * 1.13 ≈ 0.063
--
-- Key Insights:
-- ✅ Established communities (5 & 4) rank highest as desired
-- ✅ Score-based boost reduction: communities with high scores get less boost
-- ✅ Community 3 has high score (~0.77), so boost is effectively eliminated
-- ✅ New communities with low scores still get protection
-- ✅ Simple linear formula: boost = ageBasedBoost - (normalizedScore * 0.3)
--
-- Note: If editors_choice is set to true for any community, it will appear first
-- regardless of ranking_score, then others sorted by ranking_score DESC.

-- Query to see actual ranking after calculation:
SELECT 
  c.id,
  c.name,
  c.editors_choice,
  c.ranking_score,
  (NOW()::date - c.created_at::date) AS age_in_days,
  CASE 
    WHEN (NOW()::date - c.created_at::date) <= 7 THEN 'Max Boost (1.15x)'
    WHEN (NOW()::date - c.created_at::date) <= 30 THEN 'Partial Boost (1.05x-1.15x)'
    ELSE 'No Boost (1.0x)'
  END AS boost_status
FROM communities c
WHERE c.name LIKE 'Test Community%'
ORDER BY c.editors_choice DESC, c.ranking_score DESC, c.name ASC;

-- ============================================================================
-- NOTES:
-- ============================================================================
-- After running this script, you can:
-- 1. Run the ranking calculation job/function to recalculate scores
-- 2. Query the communities table to see the updated ranking_score values
-- 3. Compare scores to see how boost affects new communities vs old ones
--
-- Expected behavior (after boost adjustment with score-based reduction):
-- - Communities 1, 2, 6 (0-7 days old): Age-based boost 1.15x, reduced by (score * 0.3)
-- - Community 3 (15 days old): Age-based boost ~1.10x, significantly reduced due to high score
-- - Communities 4, 5 (35+ days old): No boost (1.0x)
-- 
-- Boost formula: ageBasedBoost - (normalizedScore * 0.3)
-- This ensures communities with high scores get less boost, preventing them from
-- outranking established communities while still protecting new communities with low scores.
--
-- All scores should be normalized to 0-1 range

