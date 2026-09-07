-- Form V2 records firing decisions per player and derives round/player totals.
-- Keep Form V1 rows readable so the first live playtest remains comparable.

alter table private.playtest_submissions
  drop constraint if exists playtest_submissions_form_version_check;

alter table private.playtest_submissions
  add constraint playtest_submissions_form_version_check
  check (form_version in (1, 2));

alter table private.playtest_players
  add column if not exists recognition_vp smallint
  generated always as (
    case when recognition = 5 then 6::smallint else 0::smallint end
  ) stored,
  add column if not exists coins_remaining smallint check (coins_remaining between 0 and 50),
  add column if not exists clay_remaining smallint check (clay_remaining between 0 and 40),
  add column if not exists wood_remaining smallint check (wood_remaining between 0 and 40);

alter table private.playtest_rounds
  add column if not exists protective_saggars_used boolean,
  add column if not exists test_pieces_used boolean,
  add column if not exists second_firing_used boolean,
  add column if not exists kiln_furniture_used boolean;

create table if not exists private.playtest_round_players (
  submission_id uuid not null,
  round smallint not null check (round between 1 and 5),
  player_index smallint not null check (player_index between 0 and 3),
  fire_contribution text check (
    fire_contribution in ('bank_2', 'bank', 'tend', 'stoke', 'stoke_2')
  ),
  shared_loaded smallint check (shared_loaded between 0 and 7),
  imperial_loaded smallint not null default 0 check (imperial_loaded between 0 and 1),
  orders_completed smallint check (orders_completed between 0 and 20),
  kiln_ability_uses smallint not null default 0 check (kiln_ability_uses between 0 and 1),
  primary key (submission_id, round, player_index),
  foreign key (submission_id, round)
    references private.playtest_rounds(submission_id, round) on delete cascade,
  foreign key (submission_id, player_index)
    references private.playtest_players(submission_id, player_index) on delete cascade
);

alter table private.playtest_round_players enable row level security;
revoke all on private.playtest_round_players from public, anon, authenticated;
grant all on private.playtest_round_players to service_role;

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
    or coalesce(p_payload->>'rulesVersion', '') <> '1.2.4'
    or v_form_version not in (1, 2) then
    raise exception 'PLAYTEST_INVALID_PAYLOAD' using errcode = 'P0001';
  end if;

  v_player_count := (p_payload->>'playerCount')::smallint;
  if v_player_count not between 2 and 4
    or jsonb_typeof(p_payload->'players') <> 'array'
    or jsonb_array_length(p_payload->'players') <> v_player_count
    or jsonb_typeof(p_payload->'rounds') <> 'array'
    or (v_form_version = 1 and jsonb_array_length(p_payload->'rounds') > 5)
    or (v_form_version = 2 and jsonb_array_length(p_payload->'rounds') <> 5) then
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
    v_submission_id, v_game_number, v_game_id, v_form_version, '1.2.4',
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
      case when v_form_version = 2 then 0 else (v_player->>'kilnAbilityUses')::smallint end,
      (v_player->>'finalVp')::smallint, (v_player->>'orderVp')::smallint,
      (v_player->>'traditionVp')::smallint, (v_player->>'exhibitionVp')::smallint,
      (v_player->>'coinVp')::smallint,
      case when v_form_version = 2 then (v_player->>'coinsRemaining')::smallint end,
      case when v_form_version = 2 then (v_player->>'clayRemaining')::smallint end,
      case when v_form_version = 2 then (v_player->>'woodRemaining')::smallint end
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
    if v_form_version = 1 then
      insert into private.playtest_rounds (
        submission_id, round, shared_loaded, imperial_loaded, bank, tend, stoke,
        base_heat, fire_modifier, white_loaded, celadon_loaded, grey_green_loaded,
        moon_white_loaded, heat_conflict, order_stolen, fuel_ledger_used, notes
      ) values (
        v_submission_id, (v_round->>'round')::smallint,
        (v_round->>'sharedLoaded')::smallint, (v_round->>'imperialLoaded')::smallint,
        (v_round->>'bank')::smallint, (v_round->>'tend')::smallint,
        (v_round->>'stoke')::smallint, (v_round->>'baseHeat')::smallint,
        (v_round->>'fireModifier')::smallint, (v_round->>'whiteLoaded')::smallint,
        (v_round->>'celadonLoaded')::smallint, (v_round->>'greyGreenLoaded')::smallint,
        (v_round->>'moonWhiteLoaded')::smallint, (v_round->>'heatConflict')::boolean,
        (v_round->>'orderStolen')::boolean, (v_round->>'fuelLedgerUsed')::boolean,
        coalesce(v_round->>'notes', '')
      );
    else
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
    end if;
  end loop;

  if v_form_version = 2 then
    update private.playtest_players player
    set kiln_ability_uses = coalesce((
      select sum(round_player.kiln_ability_uses)
      from private.playtest_round_players round_player
      where round_player.submission_id = player.submission_id
        and round_player.player_index = player.player_index
    ), 0)
    where player.submission_id = v_submission_id;
  end if;

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
  player.recognition_vp,
  player.coins_remaining,
  player.clay_remaining,
  player.wood_remaining
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
  round.shifu_reposition_used,
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
  round.shifu_reposition_used,
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

revoke all on private.playtest_player_summary from public, anon, authenticated;
revoke all on private.playtest_firing_log from public, anon, authenticated;
revoke all on private.playtest_firing_player_log from public, anon, authenticated;
grant select on private.playtest_player_summary to service_role;
grant select on private.playtest_firing_log to service_role;
grant select on private.playtest_firing_player_log to service_role;
