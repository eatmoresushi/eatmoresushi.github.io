-- Recognition VP is deterministic in V1.2.4: Imperial Audience awards 6 VP
-- at Recognition 5, while spaces 0-4 award no VP. Store the derived value so
-- existing and future submissions expose the same analysis column.

alter table private.playtest_players
  add column if not exists recognition_vp smallint
  generated always as (
    case when recognition = 5 then 6::smallint else 0::smallint end
  ) stored;

create or replace view private.playtest_player_summary as
select
  submission.game_id,
  submission.played_on,
  player.player_index,
  coalesce(nullif(player.player_name, ''), 'Player ' || (player.player_index + 1)) as player,
  player.player_index = submission.first_player_index as first_player,
  player.player_index = submission.winner_index as winner,
  player.kiln_id,
  player.starting_technique_id,
  player.advanced_technique_1_id,
  player.advanced_technique_2_id,
  coalesce(order_stats.completed_order_count, 0) as completed_order_count,
  coalesce(order_stats.completed_order_ids, '{}'::text[]) as completed_order_ids,
  player.recognition,
  player.kiln_ability_uses,
  player.final_vp,
  player.order_vp,
  player.tradition_vp,
  player.exhibition_vp,
  player.coin_vp,
  player.recognition_vp
from private.playtest_players player
join private.playtest_submissions submission using (submission_id)
left join lateral (
  select
    count(*)::integer as completed_order_count,
    array_agg(completed.order_id order by completed.order_index) as completed_order_ids
  from private.playtest_completed_orders completed
  where completed.submission_id = player.submission_id
    and completed.player_index = player.player_index
) order_stats on true;

revoke all on private.playtest_player_summary from public, anon, authenticated;
grant select on private.playtest_player_summary to service_role;
