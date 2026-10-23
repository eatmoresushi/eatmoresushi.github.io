# Playtest form

The web form is built at `/kiln-opening/playtest/` (`playtest/index.html` → `src/app/playtest/main.tsx`). In production that is:

`https://luyuan.me/kiln-opening/playtest/`

It submits **Form V3 for rules V1.6.2** (`src/playtest`; the form structure is unchanged from V1.6.1). Every option list and capacity comes from the V1.6.2 content API. The form records:

- game date, player count, first player and winner;
- for every player: Kiln (all five, Ding included), at most one Tech per discipline (Form & Decorate, Glazing & Loading, Firing; there is no Starting Tech), completed Order IDs in completion order, final Imperial Recognition position (0–4), remaining Coins/Clay/Wood, final score and an optional VP breakdown (Orders, Tradition, Exhibition, Coins);
- for every round: the Kiln Die, each player's revealed Contribution, Shared and Imperial Kiln loading, Orders completed and Kiln ability uses, the Fire card's modifier, and the Firing Techs used (Protective Saggars, Fuel Ledger, Test Pieces, Second Firing, Kiln Master, Tribute Ware);
- optional qualitative table observations and rules ambiguities.

Ceramic-level and general Tech-performance logs are intentionally omitted. The end-game Kiln ability total is derived from the five per-round counters. Completed Order count is derived from the Order IDs recorded for each player; when all five round counts are entered, the form also checks that their sum agrees with that list.

Contribution choices are Bank (−1), Tend (0) and Stoke (+1), plus Fuel Ledger Bank (−2) and Fuel Ledger Stoke (+2), which appear only in the Fuel Ledger owner's menu. Choosing one of those records Fuel Ledger as used that round. Base Heat is the round's Kiln Die plus the revealed Contributions, clamped to 0–5; the Fire modifier is then added to give Global Heat. Both are shown, never typed.

The round form offers only the Firing Techs assigned to a player in the setup section. Removing or reassigning a Firing Tech clears firing-use data that no longer has a matching owner.

Recognition VP is derived rather than entered: reaching Recognition 4 records the 6 VP Imperial Audience, and positions 0–3 record 0. VP from Crowns gained beyond Recognition 4 is immediate VP included in the player's final score. Version-aware analysis keeps the historical V1.2.4 rule of 6 VP at Recognition 5.

There is no Game ID input. `public.server_submit_playtest` assigns the next private sequence value inside the database transaction and returns a reference such as `KO-000001` only after the submission is stored.

The draft is saved in the browser under `kiln-opening:playtest-draft-v3`; older form drafts are not migrated.

## Form V3 compared with Form V2

Form V2, last used for rules V1.4, was submitted by the V1.4 page (`src/ui/PlaytestFormPage.tsx`, `src/playtest-v14`), which is no longer built since the cutover. Form V3 differs where the rules differ:

- no Starting Tech; each player records at most one Tech per discipline;
- all five Kilns, including Ding;
- each round records its Kiln Die, because Base Heat starts from it (V1.4 started Base Heat at 2);
- the Firing Techs are Protective Saggars, Fuel Ledger, Test Pieces, Second Firing, Kiln Master and Tribute Ware.

Migration `202610150002_playtest_v161.sql` (written for V1.6.1, edited in place for V1.6.2) accepts only Form V3 for rules V1.6.2, adds the per-discipline Tech columns and the round's Kiln Die, Kiln Master and Tribute Ware columns, and keeps all earlier submissions readable.

## Storage

Use the existing Supabase project as the source of truth. The migration creates normalized tables in the non-exposed `private` schema:

- `private.playtest_submissions`
- `private.playtest_players`
- `private.playtest_completed_orders`
- `private.playtest_rounds`
- `private.playtest_round_players`

This is preferable to writing directly to Google Sheets or a public Supabase table. It provides transactional writes, database constraints, stable IDs, nullable metrics, private access, and SQL analysis without exposing submissions or credentials to the browser. A spreadsheet can remain an export and presentation format rather than the primary database.

The browser signs in anonymously, then calls `playtest-submit`. The Edge Function validates the payload, applies a per-session rate limit, and calls the service-role-only database function. Browser roles have no read or write grants on the tables, views, sequence, or RPC.

Player names are optional. The database stores the anonymous Supabase user ID only for submission rate limiting; the form does not ask for an email or account.

Migration `202609070001_reset_playtest_records.sql` performs the owner-requested one-time reset before Form V2 collection: it deletes every row belonging to the playtest-form tables, resets Game ID numbering to `KO-000001`, and removes the legacy `shifu_reposition_used` column. It does not touch multiplayer rooms, accounts, or game-session data.

Migration `202609100002_playtest_v126.sql` accepted V1.2.6 Form V2 submissions, limits their Recognition position to 0–4, and makes analysis views calculate Recognition VP according to each row's stored rules version. Historical V1.2.4 and V1.2.5 submissions remain labelled and readable.

## Analysis views

The migration provides private, workbook-shaped views:

- `private.playtest_game_summary`
- `private.playtest_player_summary`
- `private.playtest_order_log`
- `private.playtest_firing_log`
- `private.playtest_firing_player_log`

Use the Supabase SQL editor to query them and download results as CSV. Example comparisons:

```sql
-- Kiln balance: sample size and player results
select
  kiln_id,
  count(*) as player_records,
  round(avg(final_vp), 1) as avg_final_vp,
  round(avg(tradition_vp), 1) as avg_tradition_vp,
  round(avg(recognition), 2) as avg_recognition,
  round(avg(recognition_vp), 2) as avg_recognition_vp,
  round(avg(kiln_ability_uses), 2) as avg_kiln_ability_uses,
  round(avg((winner)::int) * 100, 1) as win_rate_pct
from private.playtest_player_summary
group by kiln_id
order by kiln_id;

-- Shared Kiln pressure and Global Heat by round
select
  round,
  round(avg(occupancy) * 100, 1) as avg_occupancy_pct,
  round(avg(global_heat), 2) as avg_global_heat
from private.playtest_firing_log
group by round
order by round;

-- Per-player firing behaviour by Kiln
select
  kiln_id,
  fire_contribution,
  count(*) as uses,
  round(avg(coalesce(shared_loaded, 0)), 2) as avg_shared_loaded,
  sum(kiln_ability_uses) as kiln_ability_uses
from private.playtest_firing_player_log
group by kiln_id, fire_contribution
order by kiln_id, fire_contribution;

-- Order popularity and completion ownership
select
  order_id,
  count(*) as completions,
  round(avg(completion_number), 2) as avg_completion_number
from private.playtest_order_log
group by order_id
order by completions desc, order_id;
```

Keep these tables long-term so comparisons can accumulate across rules versions. The current form submits Form V3 for rules V1.6.2; historical Form V1 and V2 records (rules V1.2.4 to V1.4) remain readable and version-labelled. When a future rules change alters payload meaning, add a new form version and migration rather than silently changing existing columns.

## Deployment

1. Apply migrations with `supabase db push`.
2. Deploy both functions:

   ```sh
   supabase functions deploy game-action
   supabase functions deploy playtest-submit
   ```

   The `playtest-submit` redeploy is required whenever the shared playtest schema changes; deploying `game-action` alone does not update this form endpoint.

3. Keep `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as Edge Function secrets.
4. Keep anonymous Auth enabled and the existing public URL and anonymous key available to the Vite build.
5. Run `npm run build`; the multi-page Vite build writes `dist/playtest/index.html` alongside the game.

Before collecting a large external test wave, set a backup/export routine and decide a retention policy for optional player names and free-text notes.
