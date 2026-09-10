-- Accept new V1.2.5 Form V2 playtests without rewriting historical V1.2.4 rows.
-- The RPC below is the only browser-facing write path and intentionally accepts only the
-- current rules/form pair. The wider table checks keep old submissions queryable.

alter table private.playtest_submissions
  drop constraint if exists playtest_submissions_rules_version_check;

alter table private.playtest_submissions
  add constraint playtest_submissions_rules_version_check
  check (rules_version in ('1.2.4', '1.2.5'));

alter table private.playtest_submissions
  drop constraint if exists playtest_submissions_v125_form_check;

alter table private.playtest_submissions
  add constraint playtest_submissions_v125_form_check
  check (rules_version <> '1.2.5' or form_version = 2);

comment on column private.playtest_players.recognition_vp is
  'Legacy V1.2.4 generated value (Recognition 5 = 6 VP). Use private.playtest_player_summary for version-aware Recognition VP.';

create or replace function public.server_submit_playtest(
  p_payload jsonb,
  p_submitter_auth_user_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, private, extensions, pg_temp
as $$
declare
  v_submission_id uuid := gen_random_uuid();
  v_game_number bigint;
  v_game_id text;
  v_form_version smallint;
  v_player_count smallint;
  v_player jsonb;
  v_player_index bigint;
  v_order_id text;
  v_order_index bigint;
  v_round jsonb;
  v_round_player jsonb;
  v_round_player_index bigint;
  v_shared_loaded smallint;
  v_imperial_loaded smallint;
  v_bank smallint;
  v_tend smallint;
  v_stoke smallint;
  v_contribution_heat integer;
  v_base_heat smallint;
begin
  if p_submitter_auth_user_id is null then
    raise exception 'PLAYTEST_AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  v_form_version := coalesce((p_payload->>'formVersion')::smallint, -1);
  if jsonb_typeof(p_payload) <> 'object'
    or coalesce(p_payload->>'rulesVersion', '') <> '1.2.5'
    or v_form_version <> 2 then
    raise exception 'PLAYTEST_INVALID_PAYLOAD' using errcode = 'P0001';
  end if;

  v_player_count := (p_payload->>'playerCount')::smallint;
  if v_player_count not between 2 and 4
    or jsonb_typeof(p_payload->'players') <> 'array'
    or jsonb_array_length(p_payload->'players') <> v_player_count
    or jsonb_typeof(p_payload->'rounds') <> 'array'
    or jsonb_array_length(p_payload->'rounds') <> 5 then
    raise exception 'PLAYTEST_INVALID_PAYLOAD' using errcode = 'P0001';
  end if;

  if (
    select count(*)
    from private.playtest_submissions submission
    where submission.submitted_by_auth_user_id = p_submitter_auth_user_id
      and submission.submitted_at > now() - interval '1 hour'
  ) >= 10 then
    raise exception 'PLAYTEST_RATE_LIMIT' using errcode = 'P0001';
  end if;

  v_game_number := nextval('private.playtest_game_number_seq');
  v_game_id := 'KO-' || case
    when v_game_number < 1000000 then lpad(v_game_number::text, 6, '0')
    else v_game_number::text
  end;

  insert into private.playtest_submissions (
    submission_id, game_number, game_id, form_version, rules_version, played_on,
    player_count, first_player_index, winner_index, strongest, weakest,
    blocked_or_idle_workers, soft_lock, impossible_order, shared_kiln_negotiation,
    heat_hedging, tend_meaningful, recognition_worthwhile, tradition_concern,
    tech_concern, rules_ambiguity, minor_tuning, submitted_by_auth_user_id
  ) values (
    v_submission_id, v_game_number, v_game_id, v_form_version, '1.2.5',
    (p_payload->>'playedOn')::date, v_player_count,
    (p_payload->>'firstPlayerIndex')::smallint, (p_payload->>'winnerIndex')::smallint,
    coalesce(p_payload#>>'{feedback,strongest}', ''),
    coalesce(p_payload#>>'{feedback,weakest}', ''),
    coalesce(p_payload#>>'{feedback,blockedOrIdleWorkers}', ''),
    coalesce(p_payload#>>'{feedback,softLock}', ''),
    coalesce(p_payload#>>'{feedback,impossibleOrder}', ''),
    coalesce(p_payload#>>'{feedback,sharedKilnNegotiation}', ''),
    coalesce(p_payload#>>'{feedback,heatHedging}', ''),
    coalesce(p_payload#>>'{feedback,tendMeaningful}', ''),
    coalesce(p_payload#>>'{feedback,recognitionWorthwhile}', ''),
    coalesce(p_payload#>>'{feedback,traditionConcern}', ''),
    coalesce(p_payload#>>'{feedback,techConcern}', ''),
    coalesce(p_payload#>>'{feedback,rulesAmbiguity}', ''),
    coalesce(p_payload#>>'{feedback,minorTuning}', ''),
    p_submitter_auth_user_id
  );

  for v_player, v_player_index in
    select item.value, item.ordinality - 1
    from jsonb_array_elements(p_payload->'players') with ordinality as item(value, ordinality)
  loop
    if coalesce((v_player->>'recognition')::smallint, -1) not between 0 and 4 then
      raise exception 'PLAYTEST_INVALID_PAYLOAD' using errcode = 'P0001';
    end if;

    insert into private.playtest_players (
      submission_id, player_index, player_name, kiln_id, starting_technique_id,
      advanced_technique_1_id, advanced_technique_2_id, recognition,
      kiln_ability_uses, final_vp, order_vp, tradition_vp, exhibition_vp, coin_vp,
      coins_remaining, clay_remaining, wood_remaining
    ) values (
      v_submission_id, v_player_index, coalesce(v_player->>'name', ''),
      v_player->>'kilnId', v_player->>'startingTechniqueId',
      v_player->>'advancedTechnique1Id', v_player->>'advancedTechnique2Id',
      (v_player->>'recognition')::smallint,
      0,
      (v_player->>'finalVp')::smallint, (v_player->>'orderVp')::smallint,
      (v_player->>'traditionVp')::smallint, (v_player->>'exhibitionVp')::smallint,
      (v_player->>'coinVp')::smallint,
      (v_player->>'coinsRemaining')::smallint,
      (v_player->>'clayRemaining')::smallint,
      (v_player->>'woodRemaining')::smallint
    );

    for v_order_id, v_order_index in
      select item.value, item.ordinality - 1
      from jsonb_array_elements_text(v_player->'completedOrderIds')
        with ordinality as item(value, ordinality)
    loop
      insert into private.playtest_completed_orders (
        submission_id, player_index, order_index, order_id
      ) values (
        v_submission_id, v_player_index, v_order_index, v_order_id
      );
    end loop;
  end loop;

  for v_round in
    select item.value from jsonb_array_elements(p_payload->'rounds') as item(value)
  loop
    select
        coalesce(sum(coalesce((item.value->>'sharedLoaded')::smallint, 0)), 0)::smallint,
        coalesce(sum(coalesce((item.value->>'imperialLoaded')::smallint, 0)), 0)::smallint,
        count(*) filter (where item.value->>'contribution' in ('bank_2', 'bank')),
        count(*) filter (where item.value->>'contribution' = 'tend'),
        count(*) filter (where item.value->>'contribution' in ('stoke', 'stoke_2')),
        coalesce(sum(case item.value->>'contribution'
          when 'bank_2' then -2
          when 'bank' then -1
          when 'tend' then 0
          when 'stoke' then 1
          when 'stoke_2' then 2
          else 0
        end), 0)
      into v_shared_loaded, v_imperial_loaded, v_bank, v_tend, v_stoke,
        v_contribution_heat
    from jsonb_array_elements(v_round->'players') as item(value);

    v_base_heat := greatest(0, least(5, 2 + v_contribution_heat))::smallint;

    insert into private.playtest_rounds (
        submission_id, round, shared_loaded, imperial_loaded, bank, tend, stoke,
        base_heat, fire_modifier, fuel_ledger_used,
        protective_saggars_used, test_pieces_used, second_firing_used,
        kiln_furniture_used, notes
    ) values (
        v_submission_id, (v_round->>'round')::smallint, v_shared_loaded,
        v_imperial_loaded, v_bank, v_tend, v_stoke, v_base_heat,
        (v_round->>'fireModifier')::smallint,
        coalesce(v_round->'firingTechniqueIds', '[]'::jsonb) ? 'T12',
        coalesce(v_round->'firingTechniqueIds', '[]'::jsonb) ? 'T11',
        coalesce(v_round->'firingTechniqueIds', '[]'::jsonb) ? 'T13',
        coalesce(v_round->'firingTechniqueIds', '[]'::jsonb) ? 'T14',
        coalesce(v_round->'firingTechniqueIds', '[]'::jsonb) ? 'T15',
        ''
    );

    for v_round_player, v_round_player_index in
      select item.value, item.ordinality - 1
      from jsonb_array_elements(v_round->'players')
        with ordinality as item(value, ordinality)
    loop
      insert into private.playtest_round_players (
          submission_id, round, player_index, fire_contribution, shared_loaded,
          imperial_loaded, orders_completed, kiln_ability_uses
      ) values (
          v_submission_id, (v_round->>'round')::smallint,
          v_round_player_index::smallint, v_round_player->>'contribution',
          (v_round_player->>'sharedLoaded')::smallint,
          (v_round_player->>'imperialLoaded')::smallint,
          (v_round_player->>'ordersCompleted')::smallint,
          (v_round_player->>'kilnAbilityUses')::smallint
      );
    end loop;
  end loop;

  update private.playtest_players player
  set kiln_ability_uses = coalesce((
    select sum(round_player.kiln_ability_uses)
    from private.playtest_round_players round_player
    where round_player.submission_id = player.submission_id
      and round_player.player_index = player.player_index
  ), 0)
  where player.submission_id = v_submission_id;

  return jsonb_build_object('gameId', v_game_id, 'submissionId', v_submission_id);
end;
$$;

revoke all on function public.server_submit_playtest(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.server_submit_playtest(jsonb, uuid) to service_role;

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
  case
    when submission.rules_version = '1.2.5' and player.recognition = 4 then 6::smallint
    when submission.rules_version = '1.2.4' and player.recognition = 5 then 6::smallint
    else 0::smallint
  end as recognition_vp,
  player.coins_remaining,
  player.clay_remaining,
  player.wood_remaining,
  case
    when submission.rules_version = '1.2.5' then
      num_nonnulls(player.advanced_technique_1_id, player.advanced_technique_2_id)::smallint
    else 0::smallint
  end as advanced_tech_vp,
  submission.rules_version
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

create or replace view private.playtest_firing_log as
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
  round.kiln_furniture_used,
  submission.rules_version
from private.playtest_rounds round
join private.playtest_submissions submission using (submission_id);

create or replace view private.playtest_firing_player_log as
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
  round.kiln_furniture_used,
  submission.rules_version
from private.playtest_round_players round_player
join private.playtest_submissions submission using (submission_id)
join private.playtest_players player
  on player.submission_id = round_player.submission_id
  and player.player_index = round_player.player_index
join private.playtest_rounds round
  on round.submission_id = round_player.submission_id
  and round.round = round_player.round;

revoke all on private.playtest_player_summary from public, anon, authenticated;
revoke all on private.playtest_firing_log from public, anon, authenticated;
revoke all on private.playtest_firing_player_log from public, anon, authenticated;
grant select on private.playtest_player_summary to service_role;
grant select on private.playtest_firing_log to service_role;
grant select on private.playtest_firing_player_log to service_role;

-- Include the rules version in every analysis/export view so V1.2.4 and V1.2.5
-- observations can be compared without inferring the version from submission dates.
create or replace view private.playtest_game_summary as
select
  submission.game_id,
  submission.played_on,
  submission.player_count,
  submission.strongest,
  submission.weakest,
  submission.blocked_or_idle_workers,
  submission.soft_lock,
  submission.impossible_order,
  submission.shared_kiln_negotiation,
  submission.heat_hedging,
  submission.tend_meaningful,
  submission.recognition_worthwhile,
  submission.tradition_concern,
  submission.tech_concern,
  submission.rules_ambiguity,
  submission.minor_tuning,
  submission.submitted_at,
  submission.rules_version
from private.playtest_submissions submission;

create or replace view private.playtest_order_log as
select
  submission.game_id,
  completed.player_index,
  coalesce(nullif(player.player_name, ''), 'Player ' || (player.player_index + 1)) as player,
  completed.order_index + 1 as completion_number,
  completed.order_id,
  submission.rules_version
from private.playtest_completed_orders completed
join private.playtest_submissions submission using (submission_id)
join private.playtest_players player
  on player.submission_id = completed.submission_id
  and player.player_index = completed.player_index;

revoke all on private.playtest_game_summary from public, anon, authenticated;
revoke all on private.playtest_order_log from public, anon, authenticated;
grant select on private.playtest_game_summary to service_role;
grant select on private.playtest_order_log to service_role;
