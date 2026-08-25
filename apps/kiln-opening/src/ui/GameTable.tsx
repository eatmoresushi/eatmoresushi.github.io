import { useEffect, useState } from "react";
import actionLocationsJson from "../../data/action_locations.json" with { type: "json" };
import {
  CONTRIBUTION_CARD_DEFINITIONS,
  GAME_CONFIG,
  IMPERIAL_PROGRESS,
  KILN_DEFINITIONS,
  KILN_SPACE_DEFINITIONS,
  KILN_SPACE_IDS,
  LOCATION_IDS,
  ORDER_DEFINITIONS,
  TECHNIQUE_DEFINITIONS,
  activeKilnSpaceIds,
  contributionWoodCost,
  currentDecisionActor,
  locationCapacity,
  preferredHeat,
} from "../game";
import type {
  ContributionCardId, CeramicState, FiringContext, LocationId, PlayerId } from "../game";
import type { OrderDefinition } from "../game/content";
import type { PublicGameState, PublicPlayerState } from "../multiplayer";
import { term as localizedTerm, useI18n } from "./i18n";
import type { Locale } from "./i18n";

const LOCATION_COPY = Object.fromEntries(
  actionLocationsJson.locations.map((location) => [location.id, location]),
) as Record<LocationId, (typeof actionLocationsJson.locations)[number]>;

export function GameTable({ game, ownPlayerId }: { game: PublicGameState; ownPlayerId: PlayerId }) {
  const { t } = useI18n();
  const decisionActor = currentDecisionActor(game.phase);
  const [lastObservedFiring, setLastObservedFiring] = useState<FiringContext | null>(null);

  useEffect(() => {
    if (game.firingContext?.baseHeat !== null && game.firingContext?.baseHeat !== undefined) {
      setLastObservedFiring(game.firingContext);
    }
  }, [game.firingContext]);

  return (
    <section className="table-region" aria-label={t("Game table")}>
      <GameStatus game={game} decisionActor={decisionActor} />

      <section className="playtest-panel" aria-labelledby="players-title">
        <div className="playtest-panel-heading">
          <div><p className="eyebrow">{t("Complete public state")}</p><h2 id="players-title">{t("Player Workshops")}</h2></div>
          <span>{game.playerCount} {t("players")}</span>
        </div>
        <div className="player-strip">
          {game.playerOrder.map((playerId) => (
            <PlayerPanel
              key={playerId}
              game={game}
              player={game.players[playerId]!}
              own={playerId === ownPlayerId}
              deciding={playerId === decisionActor}
            />
          ))}
        </div>
      </section>

      <WorkerPlacementTable game={game} />
      <KilnTable game={game} />
      <FiringInspector game={game} context={game.firingContext ?? lastObservedFiring} live={game.firingContext !== null} />
      <OrderDisplays game={game} ownPlayerId={ownPlayerId} />
      <TechniqueDisplays game={game} />
      <ImperialProgressTable game={game} />
    </section>
  );
}

function GameStatus({ game, decisionActor }: { game: PublicGameState; decisionActor: PlayerId | null }) {
  const { locale, t } = useI18n();
  const active = decisionActor === null ? t("Simultaneous decisions") : game.players[decisionActor]?.displayName ?? decisionActor;
  return (
    <section className="playtest-status" aria-label={t("Game status")}>
      <StatusCell label={t("Game ID")} value={game.gameId} />
      <StatusCell label={t("Rules")} value={`V${game.rulesVersion}`} />
      <StatusCell label={t("Round")} value={`${game.round} / ${GAME_CONFIG.rounds}`} />
      <StatusCell label={t("Phase")} value={phaseName(game, locale)} testId="phase-name" />
      <StatusCell label={t("First Player")} value={game.players[game.firstPlayerId]?.displayName ?? game.firstPlayerId} />
      <StatusCell label={t("Active / Decision")} value={active} testId="decision-player" />
      <StatusCell label={t("Turn status")} value={phaseStatus(game, locale)} />
      <StatusCell label={t("Revision")} value={`${game.revision} · event ${game.eventSequence}`} testId="revision" />
    </section>
  );
}

function StatusCell({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return <div><span>{label}</span><strong data-testid={testId}>{value}</strong></div>;
}

function PlayerPanel({
  game,
  player,
  own,
  deciding,
}: {
  game: PublicGameState;
  player: PublicPlayerState;
  own: boolean;
  deciding: boolean;
}) {
  const { locale, t, term } = useI18n();
  const kiln = player.kilnId === null ? null : KILN_DEFINITIONS[player.kilnId];
  const ceramics = Object.values(game.ceramics).filter(
    (ceramic) => ceramic.ownerId === player.id && ceramic.stage !== "sold",
  );
  const immediateVp = player.score.orderVp + player.score.kilnTraditionVp;
  const workers = Object.values(player.workers);
  const availableWorkers = workers.filter((worker) => worker.status === "available");
  const lockedWorkers = workers.filter((worker) => worker.status === "locked");
  return (
    <article className={`player-board ${own ? "is-own" : ""} ${deciding ? "is-active" : ""}`} data-player-id={player.id}>
      <header className="plain-player-header">
        <div>
          <h3>{player.displayName} {own && <span className="you-tag">{t("You")}</span>}</h3>
          <small>{player.id} · {t("Seat")} {player.seatIndex + 1}{player.passedWorkPhase ? ` · ${t("Passed")}` : ""}</small>
        </div>
        {deciding && <strong className="decision-badge">{t("Deciding")}</strong>}
      </header>

      <dl className="resource-row">
        <div><dt>{t("VP")}</dt><dd>{immediateVp}</dd></div>
        <div><dt>{t("Coins")}</dt><dd>{player.resources.coins}</dd></div>
        <div><dt>{t("Clay")}</dt><dd>{player.resources.clay}</dd></div>
        <div><dt>{t("Wood")}</dt><dd>{player.resources.wood}</dd></div>
        <div><dt>{t("Progress")}</dt><dd>{player.imperialProgress} / 5</dd></div>
      </dl>

      <section className="plain-subsection">
        <h4>{t("Kiln tradition")}</h4>
        {kiln === null ? <p>{t("Not selected yet.")}</p> : (
          <p><strong>{kiln.id} · {locale === "zh-CN" ? kiln.nameZh : kiln.name}</strong> — {locale === "zh-CN" ? kiln.abilityNameZh : kiln.abilityName}: {locale === "zh-CN" ? kiln.abilityZh : kiln.ability} <em>{player.kilnAbilityUsedThisRound ? t("Used this round") : t("Ready")}</em></p>
        )}
      </section>

      <section className="plain-subsection">
        <h4>{t("Workers")}</h4>
        <table className="compact-table">
          <thead><tr><th>{t("ID")}</th><th>{t("Kind")}</th><th>{t("Status")}</th><th>{t("Location")}</th></tr></thead>
          <tbody>{workers.map((worker) => (
            <tr key={worker.id}>
              <td>{worker.id}</td><td>{term(worker.kind)}</td><td>{term(worker.status)}</td><td>{worker.locationId === null ? "—" : term(worker.locationId)}</td>
            </tr>
          ))}</tbody>
        </table>
        <p className="plain-note">
          {locale === "zh-CN"
            ? `${availableWorkers.length}名可用工人 · ${lockedWorkers.length}名锁定。可用：${availableWorkers.filter((worker) => worker.kind === "shifu").length}名师傅、${availableWorkers.filter((worker) => worker.kind === "apprentice").length}名学徒`
            : `${availableWorkers.length} available workers · ${lockedWorkers.length} locked. Breakdown: ${availableWorkers.filter((worker) => worker.kind === "shifu").length} Shifu and ${availableWorkers.filter((worker) => worker.kind === "apprentice").length} Apprentices available`}
          {player.pendingApprenticeUnlocks > 0 ? locale === "zh-CN" ? ` · ${player.pendingApprenticeUnlocks}名将在清理阶段解锁` : ` · ${player.pendingApprenticeUnlocks} unlocks during Cleanup` : ""}
        </p>
      </section>

      <section className="plain-subsection">
        <h4>{t("Owned Techniques")} ({player.techniques.length}/2)</h4>
        {player.techniques.length === 0 ? <p>{t("None.")}</p> : (
          <ul className="plain-technique-list">{player.techniques.map((owned) => {
            const technique = TECHNIQUE_DEFINITIONS[owned.id];
            return <li key={owned.id}><strong>{owned.id} · {locale === "zh-CN" ? technique?.nameZh : technique?.name}</strong><span className={owned.exhausted ? "state-exhausted" : "state-ready"}>{owned.exhausted ? t("Exhausted") : t("Ready")}</span><p>{locale === "zh-CN" ? technique?.abilityZh : technique?.ability}</p></li>;
          })}</ul>
        )}
      </section>

      <section className="plain-subsection workshop-ceramics">
        <h4>{t("Workshop ceramics")}</h4>
        {(["shaped", "glazed", "loaded", "finished", "delivered", "presented"] as const).map((stage) => {
          const matches = ceramics.filter((ceramic) => ceramic.stage === stage);
          return (
            <div className="ceramic-stage" key={stage}>
              <strong>{term(stage)} ({matches.length})</strong>
              {matches.length === 0 ? <span>—</span> : <ul>{matches.map((ceramic) => <li key={ceramic.id}>{ceramicDescription(ceramic, locale)}</li>)}</ul>}
            </div>
          );
        })}
      </section>
    </article>
  );
}

function WorkerPlacementTable({ game }: { game: PublicGameState }) {
  const { locale, t, term } = useI18n();
  return (
    <section className="playtest-panel" aria-labelledby="worker-placement-title">
      <div className="playtest-panel-heading">
        <div><p className="eyebrow">{t("Round administration")}</p><h2 id="worker-placement-title">{t("Worker Placement")}</h2></div>
        <span>{t("Current occupancy and action text")}</span>
      </div>
      <div className="table-scroll">
        <table className="state-table worker-placement-table">
          <thead><tr><th>{t("Location")}</th><th>{t("Workers")}</th><th>{t("Capacity")}</th><th>{t("Placed workers")}</th><th>{t("Apprentice")}</th><th>{t("Shifu")}</th></tr></thead>
          <tbody>{LOCATION_IDS.map((locationId) => {
            const definition = LOCATION_COPY[locationId];
            const placements = game.actionBoard.placements[locationId];
            return (
              <tr key={locationId} data-location-id={locationId}>
                <th>{locale === "zh-CN" ? definition.nameZh : definition.name}</th>
                <td>{placements.length}</td>
                <td>{locationCapacity(locationId, game.playerCount)}</td>
                <td>{placements.length === 0 ? "—" : placements.map((workerId) => placedWorkerLabel(game, workerId, locale)).join("; ")}</td>
                <td>{locale === "zh-CN" ? definition.apprenticeZh : definition.apprentice}</td>
                <td>{locale === "zh-CN" ? definition.shifuZh : definition.shifu}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
    </section>
  );
}

function KilnTable({ game }: { game: PublicGameState }) {
  const { locale, t, term } = useI18n();
  const active = new Set(activeKilnSpaceIds(game.playerCount));
  const contributionPhase = game.phase.type === "firing_contributions" ? game.phase : null;
  return (
    <section className="playtest-panel kiln-board" aria-labelledby="kiln-title">
      <div className="playtest-panel-heading">
        <div><p className="eyebrow">{t("Shared kiln")}</p><h2 id="kiln-title">{t("Kiln Spaces")}</h2></div>
        <span>{active.size} / {KILN_SPACE_IDS.length} {t("active")}</span>
      </div>
      <div className="table-scroll">
        <table className="state-table kiln-table">
          <thead><tr><th>{t("Slot")}</th><th>{t("Zone")}</th><th>{t("Modifier")}</th><th>{t("Active?")}</th><th>{t("Ceramic")}</th><th>{t("Owner")}</th></tr></thead>
          <tbody>{KILN_SPACE_IDS.map((spaceId) => {
            const definition = KILN_SPACE_DEFINITIONS[spaceId];
            const ceramic = Object.values(game.ceramics).find(
              (candidate) => candidate.stage === "loaded" && candidate.kilnSpaceId === spaceId,
            );
            const enabled = active.has(spaceId);
            return (
              <tr className={enabled ? "" : "inactive-row"} key={spaceId} data-space={spaceId}>
                <th>{spaceId}</th><td>{term(definition.zone)}</td><td>{signed(definition.modifier)}</td><td>{enabled ? t("Yes") : t("No — covered")}</td><td>{ceramic === undefined ? t("Empty") : ceramicDescription(ceramic, locale)}</td><td>{ceramic === undefined ? "—" : game.players[ceramic.ownerId]?.displayName ?? ceramic.ownerId}</td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      {contributionPhase !== null && (
        <div className="submission-track" aria-label={t("Wood contribution status")}>
          {contributionPhase.eligiblePlayerIds.map((playerId) => (
            <span key={playerId} className={contributionPhase.submittedPlayerIds.includes(playerId) ? "submitted" : ""}>
              {game.players[playerId]?.displayName}: {contributionPhase.submittedPlayerIds.includes(playerId) ? t("submitted (value hidden)") : t("choosing")}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function FiringInspector({ game, context, live }: { game: PublicGameState; context: FiringContext | null; live: boolean }) {
  const { locale, t, term } = useI18n();
  const summary = game.lastFiringResult;
  const latest = context ?? summary;
  const contributions = context?.contributions ?? summary?.contributions ?? {};
  const contributorCount = (context?.contributors ?? summary?.contributors ?? Object.keys(contributions)).length;
  return (
    <section className="playtest-panel firing-inspector" aria-labelledby="firing-inspector-title" data-testid="firing-inspector">
      <div className="playtest-panel-heading">
        <div><p className="eyebrow">{t("Calculation audit")}</p><h2 id="firing-inspector-title">{t("Firing Inspector")}</h2></div>
        <span>{latest === null ? t("No firing observed") : live ? t("Current firing") : t("Latest firing · Round {round}", { round: latest.round })}</span>
      </div>
      {latest === null ? (
        <p className="muted">{t("Firing calculations will appear here after Contribution cards are revealed.")}</p>
      ) : (
        <>
          <dl className="firing-totals">
            <div><dt>{t("Contributors")}</dt><dd>{contributorCount}</dd></div>
            <div><dt>{t("Contribution cards")}</dt><dd>{firingContributionText(game, contributions, locale)}</dd></div>
            <div><dt>{t("Total Wood")}</dt><dd>{Object.values(contributions).reduce((sum, card) => sum + contributionWoodCost(card), 0)}</dd></div>
            <div><dt>{t("Base Heat")}</dt><dd>{latest.baseHeat ?? "—"}</dd></div>
            <div><dt>{t("Fire modifier")}</dt><dd>{latest.fireModifier === null ? "—" : signed(latest.fireModifier)}</dd></div>
            <div><dt>{t("Global Heat")}</dt><dd>{latest.globalHeat ?? "—"}</dd></div>
          </dl>
          {context !== null && Object.keys(context.ceramicResults).length > 0 && <div className="table-scroll">
            <table className="state-table firing-table">
              <thead><tr><th>{t("Ceramic")}</th><th>{t("Owner")}</th><th>{t("Preferred")}</th><th>{t("Base Heat")}</th><th>{t("Fire used")}</th><th>{t("Zone")}</th><th>{t("Ability changes")}</th><th>{t("Actual")}</th><th>{t("Difference")}</th><th>{t("Quality")}</th></tr></thead>
              <tbody>{Object.values(context.ceramicResults).map((result) => {
                const ceramic = game.ceramics[result.ceramicId];
                const glaze = ceramic !== undefined && ceramic.stage !== "shaped" && ceramic.stage !== "sold" ? ceramic.glaze : null;
                const fireUsed = result.ignoredFireModifier ? 0 : context.fireModifier;
                const changes = [
                  result.ignoredFireModifier ? (locale === "zh-CN" ? "匣钵择定：窑火修正视为0" : "Sagger Selection: Fire treated as 0") : null,
                  result.finalActualHeat !== result.naturalActualHeat ? (locale === "zh-CN" ? `实际火候${result.naturalActualHeat} → ${result.finalActualHeat}` : `Actual Heat ${result.naturalActualHeat} → ${result.finalActualHeat}`) : null,
                  result.forcedQuality !== null ? (locale === "zh-CN" ? `强制改为${term(result.forcedQuality)}` : `Forced ${term(result.forcedQuality)}`) : null,
                ].filter((value): value is string => value !== null);
                return (
                  <tr key={result.ceramicId}>
                    <th>{ceramic === undefined ? t("Ceramic") : ceramicAttributes(ceramic, locale)}</th>
                    <td>{ceramic === undefined ? "—" : game.players[ceramic.ownerId]?.displayName ?? ceramic.ownerId}</td>
                    <td>{glaze === null ? "—" : `${preferredHeat(glaze)} (${term(glaze)})`}</td>
                    <td>{context.baseHeat ?? "—"}</td><td>{fireUsed === null ? "—" : signed(fireUsed)}</td><td>{signed(result.zoneModifier)}</td><td>{changes.join("; ") || t("None.")}</td><td>{result.finalActualHeat}</td><td>{result.finalHeatDifference}</td><td>{result.assignedQuality === null ? t("Pending") : term(result.assignedQuality)}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>}
        </>
      )}
      {summary !== null && <GlobalHeatSummary round={summary.round} base={summary.baseHeat} fire={summary.fireModifier} global={summary.globalHeat} />}
    </section>
  );
}

export function firingContributionText(
  game: Pick<PublicGameState, "players">,
  contributions: Record<PlayerId, ContributionCardId>,
  locale: Locale = "en",
): string {
  const entries = Object.entries(contributions);
  if (entries.length === 0) return locale === "zh-CN" ? "未记录" : "Not recorded";
  return entries
    .map(([playerId, card]) => {
      const definition = CONTRIBUTION_CARD_DEFINITIONS[card];
      return locale === "zh-CN"
        ? `${game.players[playerId]?.displayName ?? "玩家"}揭示了${definition.nameZh}`
        : `${game.players[playerId]?.displayName ?? "Player"} revealed ${definition.name}`;
    })
    .join(" · ");
}

function GlobalHeatSummary({ round, base, fire, global }: { round: number; base: number; fire: number; global: number }) {
  const { t } = useI18n();
  return <p className="global-heat-summary" data-testid="last-firing-result"><strong>{t("Round {round} Fire card: {fire}", { round, fire: signed(fire) })}</strong><span>{t("Final Global Heat: {base} {fire} = {global} · Base + Fire", { base, fire: signed(fire), global })}</span></p>;
}

function OrderDisplays({ game, ownPlayerId }: { game: PublicGameState; ownPlayerId: PlayerId }) {
  const { locale, t } = useI18n();
  return (
    <section className="playtest-panel orders-board" aria-labelledby="orders-title">
      <div className="playtest-panel-heading">
        <div><p className="eyebrow">{t("Public commissions")}</p><h2 id="orders-title">{t("Orders")}</h2></div>
        <span>{t("Market")} {game.decks.marketRemaining} · {t("Imperial")} {game.decks.imperialRemaining} {t("remaining")}</span>
      </div>
      <div className="order-display-columns">
        <div><h3>{t("Market display")} ({game.displays.market.length})</h3><div className="card-row">{game.displays.market.map((orderId) => <OrderCard orderId={orderId} key={orderId} />)}</div></div>
        <div><h3>{t("Imperial display")} ({game.displays.imperial.length})</h3><div className="card-row">{game.displays.imperial.map((orderId) => <OrderCard orderId={orderId} key={orderId} imperial />)}</div></div>
      </div>
      <section className="workshop-orders" aria-label={t("Workshop Orders")}>
        <h3>{t("Uncompleted Order hands — public information")}</h3>
        <div className="workshop-order-grid">{game.playerOrder.map((playerId) => {
          const player = game.players[playerId]!;
          return (
            <article className="workshop-order-hand" key={playerId}>
              <h4>{player.displayName}{playerId === ownPlayerId ? ` (${t("You")})` : ""} · {player.orderHand.length} {t("open")} / {player.completedOrders.length} {t("completed")}</h4>
              {player.orderHand.length === 0 ? <p className="muted">{t("No open Orders.")}</p> : <div className="card-row">{player.orderHand.map((orderId) => <OrderCard orderId={orderId} imperial={orderId.startsWith("I")} key={orderId} />)}</div>}
            </article>
          );
        })}</div>
      </section>
    </section>
  );
}

function TechniqueDisplays({ game }: { game: PublicGameState }) {
  const { locale, t, term } = useI18n();
  return (
    <section className="playtest-panel techniques-board" aria-labelledby="techniques-title">
      <div className="playtest-panel-heading"><div><p className="eyebrow">{t("Guild & Academy")}</p><h2 id="techniques-title">{t("Face-up Techniques")}</h2></div><span>2 {t("per discipline")}</span></div>
      <div className="technique-columns">{(["forming", "glazing", "firing"] as const).map((discipline) => (
        <div key={discipline}>
          <h3>{term(discipline)} · {t("deck")} {game.decks.techniqueRemaining[discipline]}</h3>
          {game.displays.techniques[discipline].map((techniqueId) => {
            const technique = TECHNIQUE_DEFINITIONS[techniqueId];
            return <article className="technique-tile" data-technique-id={techniqueId} key={techniqueId}><strong>{techniqueId} · {locale === "zh-CN" ? technique?.nameZh : technique?.name}</strong><span>{technique?.cost} {t("Coins")} · {technique?.oncePerRound ? t("Once per round") : t("Continuous")}</span><p>{locale === "zh-CN" ? technique?.abilityZh : technique?.ability}</p></article>;
          })}
        </div>
      ))}</div>
    </section>
  );
}

function ImperialProgressTable({ game }: { game: PublicGameState }) {
  const { locale, t } = useI18n();
  const sealOwner = game.imperialSealOwnerId === null ? t("Unclaimed") : game.players[game.imperialSealOwnerId]?.displayName ?? game.imperialSealOwnerId;
  return (
    <section className="playtest-panel imperial-progress" aria-labelledby="imperial-progress-title" data-testid="imperial-progress-track">
      <div className="playtest-panel-heading"><div><p className="eyebrow">{t("Track state")}</p><h2 id="imperial-progress-title">{t("Imperial Progress")}</h2></div><span data-testid="imperial-seal-owner">{t("Imperial Seal")} · {sealOwner} · 2 {t("VP")}</span></div>
      <div className="table-scroll imperial-progress-scroll">
        <table className="state-table imperial-progress-spaces">
          <thead><tr><th>{t("Space")}</th><th>{t("Name")}</th><th>{t("End-game VP")}</th><th>{t("Milestone")}</th><th>{t("Players")}</th></tr></thead>
          <tbody>{IMPERIAL_PROGRESS.track.map((space) => {
            const occupants = game.playerOrder.filter((playerId) => game.players[playerId]?.imperialProgress === space.space);
            return <tr data-progress-space={space.space} key={space.space}><th>{space.space}</th><td>{locale === "zh-CN" ? space.titleZh : space.title}</td><td>{space.endGameVp}</td><td>{progressReward(space.space, locale)}</td><td className="progress-markers">{occupants.length === 0 ? "—" : occupants.map((playerId) => <span className="progress-marker" key={playerId}>{game.players[playerId]?.displayName}</span>)}</td></tr>;
          })}</tbody>
        </table>
      </div>
      <p className="progress-legend">{t("Imperial Orders advance by their printed +1, +2, or +3. Apprentices crossed at spaces 1 and 3 unlock during Cleanup.")}</p>
    </section>
  );
}

export function OrderCard({ orderId, imperial = false }: { orderId: string; imperial?: boolean }) {
  const { locale, t, term } = useI18n();
  const order = ORDER_DEFINITIONS[orderId];
  if (order === undefined) return null;
  return (
    <article className={`order-card ${imperial || orderId.startsWith("I") ? "order-imperial" : ""}`} data-order-id={orderId}>
      <header><strong>{orderId}</strong><span>{order.vp} {t("VP")}{order.coins > 0 ? ` · ${order.coins} ${t("Coins")}` : ""}</span></header>
      {order.imperialProgressReward !== undefined && <strong className="order-progress-reward">+{order.imperialProgressReward} {t("Imperial Progress")}</strong>}
      <ol className="order-slots">{order.ceramics.map((requirement, index) => (
        <li key={index}>{requirement.shapes?.map((shape) => term(shape)).join(` ${t("or")} `) ?? (requirement.shape === undefined ? t("Any Shape") : term(requirement.shape))} · {requirement.glaze === undefined ? t("Any Glaze") : term(requirement.glaze)} · {requirement.decoration === undefined ? t("Any Decoration") : term(requirement.decoration)}</li>
      ))}</ol>
      <footer>{qualityLabel(order, locale)}{relationLabel(order, locale)}</footer>
    </article>
  );
}

export function qualityLabel(order: OrderDefinition, locale: Locale = "en"): string {
  return order.minQuality === "masterpiece" ? localizedTerm(locale, "masterpiece") : `${localizedTerm(locale, order.minQuality)}+`;
}

export function relationLabel(order: OrderDefinition, locale: Locale = "en"): string {
  if (order.relations === undefined || order.relations.length === 0) return "";
  return ` · ${order.relations.map((relation) => {
    switch (relation.type) {
      case "same_glaze": return locale === "zh-CN" ? "釉色相同" : "same Glaze";
      case "different_glaze": return locale === "zh-CN" ? "釉色不同" : "different Glazes";
      case "all_different_glaze": return locale === "zh-CN" ? "釉色各不相同" : "all different Glazes";
      case "different_shape": return locale === "zh-CN" ? "器型不同" : "different Shapes";
      case "all_different_shape": return locale === "zh-CN" ? "器型各不相同" : "all different Shapes";
      case "same_shape": return locale === "zh-CN" ? "器型相同" : "same Shape";
      case "same_decoration": return locale === "zh-CN" ? "装饰相同" : "same Decoration";
      case "different_decoration": return locale === "zh-CN" ? "装饰不同" : "different Decorations";
      case "at_least_n_quality": return locale === "zh-CN" ? `至少${relation.count}件${localizedTerm(locale, relation.quality)}` : `at least ${relation.count} ${localizedTerm(locale, relation.quality)}`;
      case "at_least_n_distinct_glazes": return locale === "zh-CN" ? `至少${relation.count}种不同釉色` : `at least ${relation.count} distinct Glazes`;
      case "glaze_categories": {
        // Name the Glazes. The generic phrasing left I13 unplayable from its own card: the
        // data requires White, Celadon and Moon White, and the card said only that some
        // unnamed categories had to sit in separate ceramics.
        const names = relation.categories
          .map((category) => category.map((glaze) => localizedTerm(locale, glaze)).join(locale === "zh-CN" ? "或" : "/"))
          .join(locale === "zh-CN" ? "、" : ", ");
        return locale === "zh-CN" ? `分别为${names}各1件` : `one each of ${names}`;
      }
      default: {
        // Every relation must print. `same_shape` and `different_decoration` were absent
        // here and rendered as nothing, so M24 and M26 showed no requirement at all on the
        // card while the engine still enforced it. This makes the next omission a build
        // error instead of a silently wrong card.
        const unhandled: never = relation;
        throw new Error(`Unhandled Order relation: ${JSON.stringify(unhandled)}`);
      }
    }
  }).join("; ")}`;
}

export function ceramicDescription(ceramic: CeramicState, locale: Locale = "en"): string {
  const parts = [localizedTerm(locale, ceramic.shape), localizedTerm(locale, ceramic.stage)];
  if (ceramic.stage !== "shaped" && ceramic.stage !== "sold") {
    parts.push(localizedTerm(locale, ceramic.glaze), localizedTerm(locale, ceramic.decoration));
  }
  if (ceramic.stage === "finished" || ceramic.stage === "delivered" || ceramic.stage === "presented") {
    parts.push(locale === "zh-CN" ? `品第：${localizedTerm(locale, ceramic.quality)}` : `Quality: ${localizedTerm(locale, ceramic.quality)}`);
  }
  if (ceramic.stage === "loaded") parts.push(locale === "zh-CN" ? `窑位：${ceramic.kilnSpaceId}` : `Slot: ${ceramic.kilnSpaceId}`);
  return parts.join(" · ");
}

function ceramicAttributes(ceramic: CeramicState, locale: Locale = "en"): string {
  const parts: string[] = [localizedTerm(locale, ceramic.shape)];
  if (ceramic.stage !== "shaped" && ceramic.stage !== "sold") {
    parts.push(localizedTerm(locale, ceramic.glaze), localizedTerm(locale, ceramic.decoration));
  }
  return parts.join(" · ");
}

function placedWorkerLabel(game: PublicGameState, workerId: string, locale: Locale = "en"): string {
  for (const playerId of game.playerOrder) {
    const worker = game.players[playerId]?.workers[workerId];
    if (worker !== undefined) return `${game.players[playerId]?.displayName} · ${localizedTerm(locale, worker.kind)} · ${worker.id}`;
  }
  return workerId;
}

function progressReward(space: number, locale: Locale = "en"): string {
  if (space === 0 || space === 2 || space === 4) return locale === "zh-CN" ? "终局展陈上限5件" : "End-game Exhibition capacity 5";
  if (space === 1 || space === 3) return locale === "zh-CN" ? "清理阶段解锁1名学徒；终局展陈上限5件" : "Unlock 1 Apprentice during Cleanup; Exhibition capacity 5";
  if (space === 5) return locale === "zh-CN" ? "首位到达者获得2分御印；终局展陈上限5件" : "First arrival claims the 2-VP Imperial Seal; Exhibition capacity 5";
  return "—";
}

function phaseName(game: PublicGameState, locale: Locale = "en"): string {
  const tx = (english: string): string => locale === "zh-CN" ? ({
    "Kiln selection": "选择窑口", "Starting Orders": "起始订单", "Work Phase": "劳作阶段",
    "Office — Orders": "贡务 — 订单", "Office — Optional Flawed sale": "贡务 — 可选次品出售",
    "Office — Connoisseur Network": "贡务 — 鉴藏人脉", "Guild & Academy": "行会与学堂",
    "Pre-firing Techniques": "烧制前技术", "Secret Contributions": "秘密出柴牌", "Fuel Ledger": "柴薪簿",
    "Sagger Selection": "匣钵择选", "Kiln ability": "窑口能力", "Second Firing": "二次烧成",
    "Protective Saggars": "护胎匣钵", "Kiln Records": "窑务簿录", "Test Pieces": "试片",
    "Order Phase": "交付阶段", "End-game Exhibition": "终局陈设", "Final results": "最终计分",
  } as Record<string, string>)[english] ?? english : english;
  switch (game.phase.type) {
    case "setup_kiln_selection": return tx("Kiln selection");
    case "setup_starting_orders": return tx("Starting Orders");
    case "work": return tx("Work Phase");
    case "work_office_orders": return tx("Office — Orders");
    case "work_office_sale": return tx("Office — Optional Flawed sale");
    case "work_office_connoisseur": return tx("Office — Connoisseur Network");
    case "work_guild": return tx("Guild & Academy");
    case "firing_before_contribution": return tx("Pre-firing Techniques");
    case "firing_contributions": return tx("Secret Contributions");
    case "firing_after_reveal": return tx("Fuel Ledger");
    case "firing_reposition": return tx("Shifu kiln reposition");
    case "firing_after_fire_reveal": return tx("Sagger Selection");
    case "firing_before_quality": return tx("Kiln ability");
    case "firing_after_quality": return tx(game.phase.techniqueIds[game.phase.queue.currentIndex] === "T15" ? "Second Firing" : "Protective Saggars");
    case "firing_after_firing": return tx(game.phase.techniqueIds[game.phase.queue.currentIndex] === "T13" ? "Kiln Records" : "Test Pieces");
    case "orders": return tx("Order Phase");
    case "cleanup_orders": return tx("Cleanup Orders");
    case "presentation": return tx("End-game Exhibition");
    case "finished": return tx("Final results");
  }
}

function phaseStatus(game: PublicGameState, locale: Locale = "en"): string {
  switch (game.phase.type) {
    case "work": return locale === "zh-CN" ? `${game.players[game.phase.activePlayerId]?.displayName ?? game.phase.activePlayerId}必须放置工人或跳过` : `${game.players[game.phase.activePlayerId]?.displayName ?? game.phase.activePlayerId} must place a worker or pass`;
    case "firing_contributions": return locale === "zh-CN" ? `${game.phase.submittedPlayerIds.length}/${game.phase.eligiblePlayerIds.length}份贡献已提交` : `${game.phase.submittedPlayerIds.length}/${game.phase.eligiblePlayerIds.length} contributions submitted`;
    case "presentation": return locale === "zh-CN" ? `${game.phase.submittedPlayerIds.length}/${game.phase.eligiblePlayerIds.length}份展陈选择已提交` : `${game.phase.submittedPlayerIds.length}/${game.phase.eligiblePlayerIds.length} Exhibition selections submitted`;
    case "orders": return locale === "zh-CN" ? `${game.players[game.phase.activePlayerId]?.displayName ?? game.phase.activePlayerId}可以完成订单` : `${game.players[game.phase.activePlayerId]?.displayName ?? game.phase.activePlayerId} may complete Orders`;
    case "finished": return locale === "zh-CN" ? "最终计分已完成" : "Final scoring complete";
    default: {
      const actor = currentDecisionActor(game.phase);
      return actor === null
        ? locale === "zh-CN" ? "等待同时决策" : "Waiting for simultaneous decisions"
        : locale === "zh-CN" ? `${game.players[actor]?.displayName ?? actor}必须结算此步骤` : `${game.players[actor]?.displayName ?? actor} must resolve this step`;
    }
  }
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function title(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
