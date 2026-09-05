-- Private, normalized storage for the concise V1.2.4 public playtest form.
-- Browser clients can submit only through the authenticated Edge Function. They cannot
-- choose a Game ID or read submission rows through the Data API.

create sequence if not exists private.playtest_game_number_seq;

create table if not exists private.playtest_submissions (
  submission_id uuid primary key default gen_random_uuid(),
  game_number bigint not null unique,
  game_id text not null unique check (game_id ~ '^KO-[0-9]{6,}$'),
  source text not null default 'web_form' check (source in ('web_form', 'admin_import')),
  form_version smallint not null check (form_version = 1),
  rules_version text not null check (rules_version = '1.2.4'),
  played_on date not null,
  player_count smallint not null check (player_count between 2 and 4),
  first_player_index smallint not null check (first_player_index between 0 and 3),
  winner_index smallint not null check (winner_index between 0 and 3),
  strongest text not null default '',
  weakest text not null default '',
  blocked_or_idle_workers text not null default '',
  soft_lock text not null default '',
  impossible_order text not null default '',
  shared_kiln_negotiation text not null default '',
  heat_hedging text not null default '',
  tend_meaningful text not null default '',
  recognition_worthwhile text not null default '',
  tradition_concern text not null default '',
  tech_concern text not null default '',
  rules_ambiguity text not null default '',
  minor_tuning text not null default '',
  submitted_by_auth_user_id uuid not null,
  submitted_at timestamptz not null default now()
);

create index if not exists playtest_submissions_played_on_idx
  on private.playtest_submissions (played_on desc);
create index if not exists playtest_submissions_submitter_rate_idx
  on private.playtest_submissions (submitted_by_auth_user_id, submitted_at desc);

create table if not exists private.playtest_players (
  submission_id uuid not null references private.playtest_submissions(submission_id) on delete cascade,
  player_index smallint not null check (player_index between 0 and 3),
  player_name text not null default '' check (char_length(player_name) <= 40),
  kiln_id text not null check (kiln_id in ('RU', 'GU', 'GE', 'DI', 'JU')),
  starting_technique_id text not null check (starting_technique_id in ('ST01', 'ST02', 'ST03', 'ST04')),
  advanced_technique_1_id text check (advanced_technique_1_id ~ '^T(0[1-9]|1[0-5])$'),
  advanced_technique_2_id text check (advanced_technique_2_id ~ '^T(0[1-9]|1[0-5])$'),
  recognition smallint not null check (recognition between 0 and 5),
  kiln_ability_uses smallint not null check (kiln_ability_uses between 0 and 5),
  final_vp smallint not null check (final_vp between -100 and 500),
  order_vp smallint check (order_vp between -100 and 500),
  tradition_vp smallint check (tradition_vp between -100 and 500),
  exhibition_vp smallint check (exhibition_vp between -100 and 500),
  coin_vp smallint check (coin_vp between 0 and 5),
  primary key (submission_id, player_index),
  check (advanced_technique_1_id is null or advanced_technique_1_id <> advanced_technique_2_id)
);

create table if not exists private.playtest_completed_orders (
  submission_id uuid not null,
  player_index smallint not null,
  order_index smallint not null check (order_index between 0 and 19),
  order_id text not null check (
    order_id ~ '^(S(0[1-9]|1[0-6])|O(0[1-9]|[1-3][0-9]|4[0-8]))$'
  ),
  primary key (submission_id, player_index, order_index),
  unique (submission_id, order_id),
  foreign key (submission_id, player_index)
    references private.playtest_players(submission_id, player_index) on delete cascade
);

create table if not exists private.playtest_rounds (
  submission_id uuid not null references private.playtest_submissions(submission_id) on delete cascade,
  round smallint not null check (round between 1 and 5),
  shared_loaded smallint check (shared_loaded between 0 and 7),
  imperial_loaded smallint check (imperial_loaded between 0 and 4),
  bank smallint check (bank between 0 and 4),
  tend smallint check (tend between 0 and 4),
  stoke smallint check (stoke between 0 and 4),
  base_heat smallint check (base_heat between 0 and 5),
  fire_modifier smallint check (fire_modifier between -2 and 2),
  white_loaded smallint check (white_loaded between 0 and 11),
  celadon_loaded smallint check (celadon_loaded between 0 and 11),
  grey_green_loaded smallint check (grey_green_loaded between 0 and 11),
  moon_white_loaded smallint check (moon_white_loaded between 0 and 11),
  heat_conflict boolean,
  order_stolen boolean,
  shifu_reposition_used boolean,
  fuel_ledger_used boolean,
  notes text not null default '',
  primary key (submission_id, round)
);

alter table private.playtest_submissions enable row level security;
alter table private.playtest_players enable row level security;
alter table private.playtest_completed_orders enable row level security;
alter table private.playtest_rounds enable row level security;

revoke all on private.playtest_submissions from public, anon, authenticated;
revoke all on private.playtest_players from public, anon, authenticated;
revoke all on private.playtest_completed_orders from public, anon, authenticated;
revoke all on private.playtest_rounds from public, anon, authenticated;
revoke all on sequence private.playtest_game_number_seq from public, anon, authenticated;
grant all on private.playtest_submissions to service_role;
grant all on private.playtest_players to service_role;
grant all on private.playtest_completed_orders to service_role;
grant all on private.playtest_rounds to service_role;
grant usage, select on sequence private.playtest_game_number_seq to service_role;

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
  v_player_count smallint;
  v_player jsonb;
  v_player_index bigint;
  v_order_id text;
  v_order_index bigint;
  v_round jsonb;
begin
  if p_submitter_auth_user_id is null then
    raise exception 'PLAYTEST_AUTH_REQUIRED' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_payload) <> 'object'
    or coalesce(p_payload->>'rulesVersion', '') <> '1.2.4'
    or coalesce((p_payload->>'formVersion')::integer, -1) <> 1 then
    raise exception 'PLAYTEST_INVALID_PAYLOAD' using errcode = 'P0001';
  end if;

  v_player_count := (p_payload->>'playerCount')::smallint;
  if v_player_count not between 2 and 4
    or jsonb_typeof(p_payload->'players') <> 'array'
    or jsonb_array_length(p_payload->'players') <> v_player_count
    or jsonb_typeof(p_payload->'rounds') <> 'array'
    or jsonb_array_length(p_payload->'rounds') > 5 then
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
    v_submission_id, v_game_number, v_game_id, 1, '1.2.4', (p_payload->>'playedOn')::date,
    v_player_count, (p_payload->>'firstPlayerIndex')::smallint,
    (p_payload->>'winnerIndex')::smallint,
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
      kiln_ability_uses, final_vp, order_vp, tradition_vp, exhibition_vp, coin_vp
    ) values (
      v_submission_id, v_player_index, coalesce(v_player->>'name', ''),
      v_player->>'kilnId', v_player->>'startingTechniqueId',
      v_player->>'advancedTechnique1Id', v_player->>'advancedTechnique2Id',
      (v_player->>'recognition')::smallint, (v_player->>'kilnAbilityUses')::smallint,
      (v_player->>'finalVp')::smallint, (v_player->>'orderVp')::smallint,
      (v_player->>'traditionVp')::smallint, (v_player->>'exhibitionVp')::smallint,
      (v_player->>'coinVp')::smallint
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
    insert into private.playtest_rounds (
      submission_id, round, shared_loaded, imperial_loaded, bank, tend, stoke,
      base_heat, fire_modifier, white_loaded, celadon_loaded, grey_green_loaded,
      moon_white_loaded, heat_conflict, order_stolen, shifu_reposition_used,
      fuel_ledger_used, notes
    ) values (
      v_submission_id, (v_round->>'round')::smallint,
      (v_round->>'sharedLoaded')::smallint, (v_round->>'imperialLoaded')::smallint,
      (v_round->>'bank')::smallint, (v_round->>'tend')::smallint,
      (v_round->>'stoke')::smallint, (v_round->>'baseHeat')::smallint,
      (v_round->>'fireModifier')::smallint, (v_round->>'whiteLoaded')::smallint,
      (v_round->>'celadonLoaded')::smallint, (v_round->>'greyGreenLoaded')::smallint,
      (v_round->>'moonWhiteLoaded')::smallint, (v_round->>'heatConflict')::boolean,
      (v_round->>'orderStolen')::boolean, (v_round->>'shifuRepositionUsed')::boolean,
      (v_round->>'fuelLedgerUsed')::boolean, coalesce(v_round->>'notes', '')
    );
  end loop;

  return jsonb_build_object('gameId', v_game_id, 'submissionId', v_submission_id);
end;
$$;

revoke all on function public.server_submit_playtest(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.server_submit_playtest(jsonb, uuid) to service_role;

-- Private workbook-shaped views for SQL analysis and CSV export.
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
  submission.submitted_at
from private.playtest_submissions submission;

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
  player.coin_vp
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

create or replace view private.playtest_order_log as
select
  submission.game_id,
  completed.player_index,
  coalesce(nullif(player.player_name, ''), 'Player ' || (player.player_index + 1)) as player,
  completed.order_index + 1 as completion_number,
  completed.order_id
from private.playtest_completed_orders completed
join private.playtest_submissions submission using (submission_id)
join private.playtest_players player
  on player.submission_id = completed.submission_id
  and player.player_index = completed.player_index;

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
  round.notes
from private.playtest_rounds round
join private.playtest_submissions submission using (submission_id);

revoke all on private.playtest_game_summary from public, anon, authenticated;
revoke all on private.playtest_player_summary from public, anon, authenticated;
revoke all on private.playtest_order_log from public, anon, authenticated;
revoke all on private.playtest_firing_log from public, anon, authenticated;
grant select on private.playtest_game_summary to service_role;
grant select on private.playtest_player_summary to service_role;
grant select on private.playtest_order_log to service_role;
grant select on private.playtest_firing_log to service_role;
