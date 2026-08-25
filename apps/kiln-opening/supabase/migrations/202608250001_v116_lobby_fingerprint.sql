-- Repair the V1.1.6 rules fingerprint on unstarted lobbies.
--
-- 202608240002 upgrades lobby version tags to V1.1.6. Rooms created after rules
-- fingerprinting can still carry the previous V1.1.5 digest, so the V1.1.6 Edge Function
-- would reject those otherwise-upgradable lobbies with RULES_FINGERPRINT_MISMATCH.
--
-- A lobby has no serialized GameState yet, so updating its fingerprint is safe. Started,
-- finished and abandoned rooms are intentionally untouched and remain protected by the
-- version/fingerprint gates.

update public.rooms
set content_digest = 'r9-cd75e98b11934a15',
    updated_at = now()
where status = 'lobby'
  and rules_version = '1.1.6'
  and content_version = '1.1.6'
  and content_digest is distinct from 'r9-cd75e98b11934a15';
