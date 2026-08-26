-- Promote unstarted V1.1.6 lobbies to the owner-approved Jun cost amendment.
--
-- Jun now costs 2 Wood instead of 3. A lobby has no serialized GameState yet, so updating
-- its fingerprint is safe. Started, finished and abandoned rooms are intentionally untouched
-- so the Edge Function rejects them instead of changing a rule during an active game.

update public.rooms
set content_digest = 'r10-cd75e98b11934a15',
    updated_at = now()
where status = 'lobby'
  and rules_version = '1.1.6'
  and content_version = '1.1.6'
  and content_digest is distinct from 'r10-cd75e98b11934a15';
