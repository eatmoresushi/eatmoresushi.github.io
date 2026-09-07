# Playtest form

The web form is built at `/kiln-opening/playtest/`. In production that is:

`https://luyuan.me/kiln-opening/playtest/`

The form uses a concise subset of `Kiln_Opening_Playtest_Recording_v1.2.4.xlsx` and records:

- game date, player count, rules version, first player, and player setup;
- for every player in each round: final Contribution value, Shared and Imperial Kiln loading, Orders completed, and Kiln ability use;
- each round's Fire modifier, automatically calculated Base/Global Heat, and the five Firing Advanced Techs;
- the winner and, for every player, completed Order IDs in completion order, final Imperial Recognition position, remaining Coins/Clay/Wood, and score;
- optional qualitative table observations and rules ambiguities.

Ceramic-level and general Tech-performance logs are intentionally omitted. The end-game Kiln ability total is derived from the five per-round counters. Completed Order count is derived from the Order IDs recorded for each player; when all five round counts are entered, the form also checks that their sum agrees with that list.

Contribution choices include ordinary Bank (−1), Tend (0), and Stoke (+1), plus Fuel Ledger's adjusted Bank (−2) and Stoke (+2). Choosing an adjusted Contribution records Fuel Ledger automatically. Base Heat starts at 2, adds those final Contribution values, and clamps to 0–5 before the Fire modifier is added to produce Global Heat.

The round form shows only Firing Advanced Techs assigned to a player in the setup section. Fuel Ledger's adjusted Bank/Stoke choices appear only in that owner's Contribution menu. Removing or reassigning a Firing Tech clears firing-use data that no longer has a matching owner.

Recognition VP is also derived rather than manually entered: V1.2.4 awards 6 VP for reaching Recognition 5 and 0 VP for positions 0-4. The stored `recognition_vp` analysis column follows the recorded Recognition position, including for submissions made before that column was added.

There is no Game ID input. `public.server_submit_playtest` assigns the next private sequence value inside the database transaction and returns a reference such as `KO-000001` only after the submission is stored.

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

Keep these tables long-term so comparisons can accumulate across rules versions. The current UI submits Form V2 for rules V1.2.4; existing Form V1 records remain readable. When rules change, add a new form version and migration rather than changing the meaning of existing columns.

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
