# Playtest form

The web form is built at `/kiln-opening/playtest/`. In production that is:

`https://luyuan.me/kiln-opening/playtest/`

The form uses a concise subset of `Kiln_Opening_Playtest_Recording_v1.2.4.xlsx` and records:

- game date, player count, rules version, first player, and player setup;
- round-by-round Shared and Imperial Kiln loading, Contribution-card mix, Base Heat, Fire, glaze mix, heat conflict, Order pressure, Shifu repositioning, and Fuel Ledger use;
- the winner and, for every player, completed Order IDs, final Imperial Recognition position, Kiln ability uses, and score;
- optional qualitative table observations and rules ambiguities.

Ceramic-level and Tech-performance logs are intentionally omitted. Completed Order count is derived from the Order IDs recorded for each player, so the count cannot disagree with the list.

There is no Game ID input. `public.server_submit_playtest` assigns the next private sequence value inside the database transaction and returns a reference such as `KO-000001` only after the submission is stored.

## Storage

Use the existing Supabase project as the source of truth. The migration creates normalized tables in the non-exposed `private` schema:

- `private.playtest_submissions`
- `private.playtest_players`
- `private.playtest_completed_orders`
- `private.playtest_rounds`

This is preferable to writing directly to Google Sheets or a public Supabase table. It provides transactional writes, database constraints, stable IDs, nullable metrics, private access, and SQL analysis without exposing submissions or credentials to the browser. A spreadsheet can remain an export and presentation format rather than the primary database.

The browser signs in anonymously, then calls `playtest-submit`. The Edge Function validates the payload, applies a per-session rate limit, and calls the service-role-only database function. Browser roles have no read or write grants on the tables, views, sequence, or RPC.

Player names are optional. The database stores the anonymous Supabase user ID only for submission rate limiting; the form does not ask for an email or account.

## Analysis views

The migration provides private, workbook-shaped views:

- `private.playtest_game_summary`
- `private.playtest_player_summary`
- `private.playtest_order_log`
- `private.playtest_firing_log`

Use the Supabase SQL editor to query them and download results as CSV. Example comparisons:

```sql
-- Kiln balance: sample size and player results
select
  kiln_id,
  count(*) as player_records,
  round(avg(final_vp), 1) as avg_final_vp,
  round(avg(tradition_vp), 1) as avg_tradition_vp,
  round(avg(recognition), 2) as avg_recognition,
  round(avg(kiln_ability_uses), 2) as avg_kiln_ability_uses,
  round(avg((winner)::int) * 100, 1) as win_rate_pct
from private.playtest_player_summary
group by kiln_id
order by kiln_id;

-- Shared Kiln pressure and heat conflict by round
select
  round,
  round(avg(occupancy) * 100, 1) as avg_occupancy_pct,
  round(avg((heat_conflict)::int) * 100, 1) as heat_conflict_rate_pct
from private.playtest_firing_log
group by round
order by round;

-- Order popularity and completion ownership
select
  order_id,
  count(*) as completions,
  round(avg(completion_number), 2) as avg_completion_number
from private.playtest_order_log
group by order_id
order by completions desc, order_id;
```

Keep these tables long-term so comparisons can accumulate across rules versions. The current form and database constraint accept V1.2.4 only. When rules change, add a new form version and migration rather than changing the meaning of existing columns.

## Deployment

1. Apply migrations with `supabase db push`.
2. Deploy both functions:

   ```sh
   supabase functions deploy game-action
   supabase functions deploy playtest-submit
   ```

3. Keep `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` as Edge Function secrets.
4. Keep anonymous Auth enabled and the existing public URL and anonymous key available to the Vite build.
5. Run `npm run build`; the multi-page Vite build writes `dist/playtest/index.html` alongside the game.

Before collecting a large external test wave, set a backup/export routine and decide a retention policy for optional player names and free-text notes.
