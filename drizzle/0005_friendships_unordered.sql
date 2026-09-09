-- Unordered friendship pair uniqueness: backstop for concurrent
-- opposite-direction requests (A→B + B→A racing past the app pre-check).
-- App code keeps the findBetween pre-check + 409 mapping; a lost race hits
-- SQLSTATE 23505 here and also maps to 409, never a duplicate row.
create unique index if not exists friendships_unordered_uniq on friendships (least(requester_clerk_id, addressee_clerk_id), greatest(requester_clerk_id, addressee_clerk_id));
