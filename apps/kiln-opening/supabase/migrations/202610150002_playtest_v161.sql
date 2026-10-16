-- Accept V1.6.1 Form V3 playtests without rewriting any historical submission.
--
-- Form V3 differs from Form V2 (V1.4) where the rules differ:
--   - no Starting Tech: `starting_technique_id` becomes nullable (old rows keep theirs);
--   - up to three Techs, at most one per discipline (L211), stored per discipline in new
--     columns; the V1.4 advanced-Tech columns stay for old rows;
--   - all five Kilns (unchanged kiln_id check);
--   - the round's Kiln Die, because V1.6.1 Base Heat = Kiln Die + Contributions (L263);
--   - the V1.6.1 Firing Techs Kiln Master (T24) and Tribute Ware (T25).
-- The RPC is the only browser-facing write path and accepts only the current rules/form
-- pair; the wider table checks keep every older submission queryable.

alter table private.playtest_submissions
  drop constraint if exists playtest_submissions_rules_version_check;
alter table private.playtest_submissions
  add constraint playtest_submissions_rules_version_check
  check (rules_version in ('1.2.4', '1.2.5', '1.2.6', '1.2.7', '1.4', '1.6.1'));

alter table private.playtest_submissions
  drop constraint if exists playtest_submissions_form_version_check;
alter table private.playtest_submissions
  add constraint playtest_submissions_form_version_check
  check (form_version in (1, 2, 3));

alter table private.playtest_submissions
  drop constraint if exists playtest_submissions_v161_form_check;
alter table private.playtest_submissions
  add constraint playtest_submissions_v161_form_check
  check (rules_version <> '1.6.1' or form_version = 3);

-- The analysis views depend on the player and round columns; they are recreated below.
drop view if exists private.playtest_player_summary;
drop view if exists private.playtest_firing_log;
drop view if exists private.playtest_firing_player_log;

alter table private.playtest_players
  alter column starting_technique_id drop not null;

alter table private.playtest_players
  add column if not exists workshop_tech_id text,
  add column if not exists glazing_loading_tech_id text,
  add column if not exists firing_tech_id text;

-- One Tech per discipline (V1.6.1 Appendix B): Workshop T01 T05 T16 T17 T18 T19;
-- Glazing & Loading T10 T15 T20 T21 T22 T23; Firing T11 T12 T13 T14 T24 T25.
alter table private.playtest_players
  drop constraint if exists playtest_players_workshop_tech_check,
  drop constraint if exists playtest_players_glazing_loading_tech_check,
  drop constraint if exists playtest_players_firing_tech_check;
alter table private.playtest_players
  add constraint playtest_players_workshop_tech_check
    check (workshop_tech_id is null or workshop_tech_id in ('T01', 'T05', 'T16', 'T17', 'T18', 'T19')),
  add constraint playtest_players_glazing_loading_tech_check
    check (glazing_loading_tech_id is null or glazing_loading_tech_id in ('T10', 'T15', 'T20', 'T21', 'T22', 'T23')),
  add constraint playtest_players_firing_tech_check
    check (firing_tech_id is null or firing_tech_id in ('T11', 'T12', 'T13', 'T14', 'T24', 'T25'));

alter table private.playtest_rounds
  add column if not exists kiln_die smallint,
  add column if not exists kiln_master_used boolean,
  add column if not exists tribute_ware_used boolean;

alter table private.playtest_rounds
  drop constraint if exists playtest_rounds_kiln_die_check;
alter table private.playtest_rounds
  add constraint playtest_rounds_kiln_die_check check (kiln_die is null or kiln_die between 1 and 3);

comment on column private.playtest_rounds.kiln_die is
  'V1.6.1: the round''s public Kiln Die (1-3). Base Heat = clamp(Kiln Die + revealed Contributions, 0, 5). Null for older forms.';
comment on column private.playtest_players.starting_technique_id is
  'Forms V1-V2 only. V1.6.1 has no Starting Techs; V1.6.1 rows leave it null.';

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
  v_shared_capacity smallint;
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
  v_kiln_die smallint;
  v_base_heat smallint;
  v_firing_techs jsonb;
begin
  if p_submitter_auth_user_id is null then
    raise exception 'PLAYTEST_AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  v_form_version := coalesce((p_payload->>'formVersion')::smallint, -1);
  if jsonb_typeof(p_payload) <> 'object'
    or coalesce(p_payload->>'rulesVersion', '') <> '1.6.1'
    or v_form_version <> 3 then
    raise exception 'PLAYTEST_INVALID_PAYLOAD' using errcode = 'P0001';
  end if;

  v_player_count := (p_payload->>'playerCount')::smallint;
  if coalesce(v_player_count, -1) not between 2 and 4
    or coalesce(jsonb_typeof(p_payload->'players'), '') <> 'array'
    or jsonb_array_length(p_payload->'players') <> v_player_count
    or coalesce(jsonb_typeof(p_payload->'rounds'), '') <> 'array'
    or jsonb_array_length(p_payload->'rounds') <> 5 then
    raise exception 'PLAYTEST_INVALID_PAYLOAD' using errcode = 'P0001';
  end if;

  -- Active Shared Kiln spaces by player count: 2-1-1, 2-2-2, 3-3-2 (L100).
  v_shared_capacity := case v_player_count when 2 then 4 when 3 then 6 else 8 end;

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
    v_submission_id, v_game_number, v_game_id, v_form_version, '1.6.1',
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
      workshop_tech_id, glazing_loading_tech_id, firing_tech_id, recognition,
      kiln_ability_uses, final_vp, order_vp, tradition_vp, exhibition_vp, coin_vp,
      coins_remaining, clay_remaining, wood_remaining
    ) values (
      v_submission_id, v_player_index, coalesce(v_player->>'name', ''),
      v_player->>'kilnId', null,
      v_player->>'workshopTechId', v_player->>'glazingLoadingTechId', v_player->>'firingTechId',
      (v_player->>'recognition')::smallint,
      0,
      (v_player->>'finalVp')::smallint, (v_player->>'orderVp')::smallint,
      (v_player->>'traditionVp')::smallint, (v_player->>'exhibitionVp')::smallint,
      (v_player->>'coinVp')::smallint,
      (v_player->>'coinsRemaining')::bigint,
      (v_player->>'clayRemaining')::bigint,
      (v_player->>'woodRemaining')::bigint
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
    if coalesce(jsonb_typeof(v_round->'players'), '') <> 'array'
       or jsonb_array_length(v_round->'players') <> v_player_count then
      raise exception 'PLAYTEST_INVALID_PAYLOAD' using errcode = 'P0001';
    end if;
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

    if v_shared_loaded > v_shared_capacity or v_imperial_loaded > v_player_count then
      raise exception 'PLAYTEST_INVALID_PAYLOAD' using errcode = 'P0001';
    end if;
    v_kiln_die := (v_round->>'kilnDie')::smallint;
    -- V1.6.1 Base Heat: Kiln Die + revealed Contributions, clamped 0-5 (L263).
    v_base_heat := case when v_kiln_die is null then null
      else greatest(0, least(5, v_kiln_die + v_contribution_heat))::smallint end;
    v_firing_techs := coalesce(v_round->'firingTechIds', '[]'::jsonb);

    insert into private.playtest_rounds (
        submission_id, round, shared_loaded, imperial_loaded, bank, tend, stoke,
        kiln_die, base_heat, fire_modifier, fuel_ledger_used,
        protective_saggars_used, test_pieces_used, second_firing_used,
        kiln_furniture_used, kiln_master_used, tribute_ware_used, notes
    ) values (
        v_submission_id, (v_round->>'round')::smallint, v_shared_loaded,
        v_imperial_loaded, v_bank, v_tend, v_stoke, v_kiln_die, v_base_heat,
        (v_round->>'fireModifier')::smallint,
        v_firing_techs ? 'T12',
        v_firing_techs ? 'T11',
        v_firing_techs ? 'T13',
        v_firing_techs ? 'T14',
        -- Kiln Furniture (T15) is a Glazing & Loading Tech in V1.6.1, not a Firing Tech.
        null,
        v_firing_techs ? 'T24',
        v_firing_techs ? 'T25',
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

create view private.playtest_player_summary as
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
    when submission.rules_version in ('1.2.5', '1.2.6', '1.2.7', '1.4', '1.6.1') and player.recognition = 4 then 6::smallint
    when submission.rules_version = '1.2.4' and player.recognition = 5 then 6::smallint
    else 0::smallint
  end as recognition_vp,
  player.coins_remaining,
  player.clay_remaining,
  player.wood_remaining,
  case
    when submission.rules_version = '1.6.1' then
      num_nonnulls(player.workshop_tech_id, player.glazing_loading_tech_id, player.firing_tech_id)::smallint
    when submission.rules_version in ('1.2.5', '1.2.6', '1.2.7', '1.4') then
      num_nonnulls(player.advanced_technique_1_id, player.advanced_technique_2_id)::smallint
    else 0::smallint
  end as advanced_tech_vp,
  submission.rules_version,
  player.workshop_tech_id,
  player.glazing_loading_tech_id,
  player.firing_tech_id
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

create view private.playtest_firing_log as
select
  submission.game_id,
  round.round,
  submission.player_count,
  capacity.shared_capacity,
  round.shared_loaded,
  round.imperial_loaded,
  round.shared_loaded::numeric /
    nullif(capacity.shared_capacity, 0) as occupancy,
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
  submission.rules_version,
  round.kiln_die,
  round.kiln_master_used,
  round.tribute_ware_used
from private.playtest_rounds round
join private.playtest_submissions submission using (submission_id)
cross join lateral (
  select case when submission.rules_version in ('1.4', '1.6.1')
    then case submission.player_count when 2 then 4 when 3 then 6 else 8 end
    else case submission.player_count when 2 then 5 when 3 then 6 else 7 end
  end as shared_capacity
) capacity;

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
  round.kiln_furniture_used,
  submission.rules_version,
  round.kiln_die,
  round.kiln_master_used,
  round.tribute_ware_used
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
