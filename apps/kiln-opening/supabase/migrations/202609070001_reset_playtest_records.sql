-- Owner-requested one-time reset before collecting Form V2 playtests.
-- This intentionally deletes playtest-form submissions only. Multiplayer and game
-- session tables are outside this scope.

drop view if exists private.playtest_firing_player_log;
drop view if exists private.playtest_firing_log;

truncate table private.playtest_submissions cascade;
alter sequence private.playtest_game_number_seq restart with 1;

alter table private.playtest_rounds
  drop column if exists shifu_reposition_used;

create view private.playtest_firing_log as
select
  submission.game_id,
  round.round,
  submission.player_count,
  case submission.player_count when 2 then 5 when 3 then 6 else 7 end as shared_capacity,
  round.shared_loaded,
  round.imperial_loaded,
  round.shared_loaded::numeric /
    nullif(case submission.player_count when 2 then 5 when 3 then 6 else 7 end, 0) as occupancy,
  round.bank,
  round.tend,
  round.stoke,
  round.base_heat,
  round.fire_modifier,
  round.base_heat + round.fire_modifier as global_heat,
  round.white_loaded,
  round.celadon_loaded,
  round.grey_green_loaded,
  round.moon_white_loaded,
  round.fuel_ledger_used,
  round.heat_conflict,
  round.order_stolen,
  round.notes,
  round.protective_saggars_used,
  round.test_pieces_used,
  round.second_firing_used,
  round.kiln_furniture_used
from private.playtest_rounds round
join private.playtest_submissions submission using (submission_id);

create view private.playtest_firing_player_log as
select
  submission.game_id,
  submission.played_on,
  round_player.round,
  round_player.player_index,
  coalesce(nullif(player.player_name, ''), 'Player ' || (player.player_index + 1)) as player,
  player.kiln_id,
  round_player.fire_contribution,
  case round_player.fire_contribution
    when 'bank_2' then -2
    when 'bank' then -1
    when 'tend' then 0
    when 'stoke' then 1
    when 'stoke_2' then 2
  end as contribution_heat,
  round_player.shared_loaded,
  round_player.imperial_loaded,
  round_player.orders_completed,
  round_player.kiln_ability_uses,
  round.base_heat,
  round.fire_modifier,
  round.base_heat + round.fire_modifier as global_heat,
  round.protective_saggars_used,
  round.fuel_ledger_used,
  round.test_pieces_used,
  round.second_firing_used,
  round.kiln_furniture_used
from private.playtest_round_players round_player
join private.playtest_submissions submission using (submission_id)
join private.playtest_players player
  on player.submission_id = round_player.submission_id
  and player.player_index = round_player.player_index
join private.playtest_rounds round
  on round.submission_id = round_player.submission_id
  and round.round = round_player.round;

revoke all on private.playtest_firing_log from public, anon, authenticated;
revoke all on private.playtest_firing_player_log from public, anon, authenticated;
grant select on private.playtest_firing_log to service_role;
grant select on private.playtest_firing_player_log to service_role;
