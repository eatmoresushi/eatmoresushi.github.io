import type { AuthoritativeCommand, PendingContribution, PublicEventRecord, PublicGameEvent, PublicGameState } from "../multiplayer";
import type { FireModifier, PlayerId } from "../game";
import { GAME_CONFIG, KILN_DEFINITIONS, ORDER_DEFINITIONS, TECHNIQUE_DEFINITIONS } from "../game";
import { ActionPanel } from "./ActionPanel";
import { GameTable } from "./GameTable";
import { term, useI18n } from "./i18n";
import type { Locale } from "./i18n";

type SendCommand = (command: AuthoritativeCommand) => Promise<boolean>;

export function PlaytestExperience({
  game,
  ownPlayerId,
  ownPendingContribution,
  events,
  busy,
  send,
}: {
  game: PublicGameState;
  ownPlayerId: PlayerId;
  ownPendingContribution: PendingContribution | null;
  events: PublicEventRecord[];
  busy: boolean;
  send: SendCommand;
}) {
  return (
    <div className="playtest-shell" data-testid="playtest-ui">
      <div className="playtest-dashboard">
        <GameTable game={game} ownPlayerId={ownPlayerId} />
      </div>
      <ActionPanel
        game={game}
        ownPlayerId={ownPlayerId}
        ownPendingContribution={ownPendingContribution}
        busy={busy}
        send={send}
      />
      <GameLog game={game} events={events} />
      <DebugPanel game={game} />
    </div>
  );
}

function GameLog({ game, events }: { game: PublicGameState; events: PublicEventRecord[] }) {
  const { locale, t } = useI18n();
  return (
    <section className="playtest-panel playtest-log" aria-labelledby="game-log-title">
      <div className="playtest-panel-heading">
        <div>
          <p className="eyebrow">{locale === "zh-CN" ? "公开事件历史" : "Public event history"}</p>
          <h2 id="game-log-title">{locale === "zh-CN" ? "游戏记录" : "Game Log"}</h2>
        </div>
        <span>{events.length} {locale === "zh-CN" ? "个事件" : "events"}</span>
      </div>
      {events.length === 0 ? (
        <p className="muted">{locale === "zh-CN" ? "尚未记录游戏事件。" : "No game events have been recorded yet."}</p>
      ) : (
        <ol className="event-log" aria-live="polite">
          {events.map((record) => (
            <li key={record.sequence}>
              <span>#{record.sequence}</span>
              <p>{eventDescription(record.event, game, locale)}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function DebugPanel({ game }: { game: PublicGameState }) {
  const fireComposition = ([-2, -1, 0, 1, 2] as FireModifier[]).map((modifier) => {
    const initial = GAME_CONFIG.fireDeck[String(modifier) as keyof typeof GAME_CONFIG.fireDeck];
    const discarded = game.discards.fire.filter((card) => card === modifier).length;
    return `${signed(modifier)}: ${initial - discarded}`;
  }).join(" · ");
  return (
    <section className="playtest-panel debug-panel" aria-labelledby="debug-panel-title">
      <div className="playtest-panel-heading">
        <div>
          <p className="eyebrow">Read-only</p>
          <h2 id="debug-panel-title">Playtest Debug</h2>
        </div>
        <span>Public state only</span>
      </div>
      <dl className="debug-counts">
        <div><dt>Revision</dt><dd>{game.revision}</dd></div>
        <div><dt>Event sequence</dt><dd>{game.eventSequence}</dd></div>
        <div><dt>Market deck / discard</dt><dd>{game.decks.marketRemaining} / {game.discards.market.length}</dd></div>
        <div><dt>Imperial deck / discard</dt><dd>{game.decks.imperialRemaining} / {game.discards.imperial.length}</dd></div>
        <div><dt>Fire deck / discard</dt><dd>{game.decks.fireRemaining} / {game.discards.fire.length}</dd></div>
        <div><dt>Fire remaining by value</dt><dd>{fireComposition}</dd></div>
        <div><dt>Technique decks</dt><dd>F {game.decks.techniqueRemaining.forming} · G {game.decks.techniqueRemaining.glazing} · K {game.decks.techniqueRemaining.firing}</dd></div>
        <div><dt>Common supply</dt><dd>{game.commonSupply.clay} Clay · {game.commonSupply.wood} Wood · {game.commonSupply.coins} Coins</dd></div>
        <div><dt>Vessel supply</dt><dd>{Object.entries(game.vesselSupplyCounts).map(([shape, count]) => `${shape} ${count}`).join(" · ")}</dd></div>
      </dl>
      <details className="raw-state">
        <summary>Show raw public game state</summary>
        <pre>{JSON.stringify(game, null, 2)}</pre>
      </details>
    </section>
  );
}

export function eventDescription(event: PublicGameEvent, game: PublicGameState, locale: Locale = "en"): string {
  if (locale === "zh-CN") return eventDescriptionZh(event, game);
  const player = (playerId: PlayerId): string => game.players[playerId]?.displayName ?? playerId;
  const ceramic = (ceramicId: string): string => {
    const current = game.ceramics[ceramicId];
    return current === undefined ? "ceramic" : label(current.shape);
  };
  switch (event.type) {
    case "KILN_SELECTED":
      return `${player(event.playerId)} selected ${KILN_DEFINITIONS[event.kilnId].name}.`;
    case "STARTING_ORDER_KEPT":
      return `${player(event.playerId)} kept starting Order ${event.orderId}.`;
    case "STARTING_ORDER_REDRAWN":
      return `${player(event.playerId)} redrew ${event.discardedOrderId} and received ${event.drawnOrderId}.`;
    case "WORKER_PLACED":
      return `${player(event.playerId)} placed ${workerName(event.workerId)} at ${locationName(event.locationId)}.`;
    case "PLAYER_PASSED":
      return `${player(event.playerId)} passed for the rest of the Work Phase.`;
    case "RESOURCES_CHANGED":
      return `${player(event.playerId)} resources changed: ${resourceChanges(event)}.`;
    case "CERAMIC_SHAPED":
      return `${player(event.playerId)} shaped a ${label(event.shape)}.`;
    case "CERAMIC_GLAZED":
      return `${player(event.playerId)} glazed a ${ceramic(event.ceramicId)} ceramic: ${label(event.glaze)}, ${label(event.decoration)}.`;
    case "CERAMIC_LOADED":
      return `${player(event.playerId)} loaded a ${ceramic(event.ceramicId)} ceramic into ${label(event.kilnSpaceId)}.`;
    case "CERAMIC_SOLD":
      return `${player(event.playerId)} sold a ${ceramic(event.ceramicId)} ceramic.`;
    case "CERAMIC_RETURNED_TO_GLAZED":
      return `${player(event.playerId)} used Second Firing; the ${ceramic(event.ceramicId)} ceramic returned to Glazed and lost its Standard Quality.`;
    case "ORDER_TAKEN":
      return `${player(event.playerId)} ${event.acquisition === "blind_top" ? "blind-drew" : "took"} ${event.orderId} from the ${event.deck} Orders.`;
    case "COLOUR_SAMPLES_USED":
      return `${player(event.playerId)} used Colour Samples: ${event.bottomedOrderId} went to the bottom and ${event.revealedOrderId ?? "no replacement"} was revealed.`;
    case "TECHNIQUE_REFRESHED":
      return `${player(event.playerId)} refreshed ${event.techniqueId} · ${TECHNIQUE_DEFINITIONS[event.techniqueId]?.name ?? "Unknown Technique"}.`;
    case "TECHNIQUE_ACQUIRED":
      return `${player(event.playerId)} bought ${event.techniqueId} · ${TECHNIQUE_DEFINITIONS[event.techniqueId]?.name ?? "Unknown Technique"} for ${event.cost} Coins.`;
    case "TECHNIQUE_USED":
      return `${player(event.playerId)} used ${event.techniqueId} · ${TECHNIQUE_DEFINITIONS[event.techniqueId]?.name ?? "Unknown Technique"}.`;
    case "KILN_ABILITY_USED":
      return `${player(event.playerId)} used ${KILN_DEFINITIONS[event.kilnId].name}: ${KILN_DEFINITIONS[event.kilnId].abilityName}.`;
    case "JUN_ACTIVATION_PAID":
      return `${player(event.playerId)} paid ${event.coins} Coins for Jun's Kiln Transformation.`;
    case "WORK_PHASE_ENDED":
      return "All players finished the Work Phase. Firing began.";
    case "WOOD_SUBMITTED":
      return `${player(event.playerId)} submitted a secret Wood Contribution.`;
    case "WOOD_REVEALED":
      return `Wood Contributions revealed: ${Object.entries(event.contributions).map(([id, value]) => `${player(id)} contributed ${value} Wood`).join("; ")}.`;
    case "FIRE_REVEALED":
      return `Fire card ${signed(event.modifier)} revealed. Base Heat ${event.baseHeat}; Global Heat ${event.globalHeat}.`;
    case "QUALITY_ASSIGNED":
      return `The ${ceramic(event.ceramicId)} ceramic was assigned ${label(event.quality)} Quality.`;
    case "FIRING_RESOLVED":
      return `${ceramic(event.ceramicId)} ceramic firing recorded: Fire ${signed(event.fireModifier)}, natural Heat ${event.naturalActualHeat} (difference ${event.naturalHeatDifference}, ${label(event.naturalQuality)}), final Heat ${event.finalActualHeat} (difference ${event.finalHeatDifference}, ${label(event.finalQuality)}).`;
    case "ORDER_COMPLETED": {
      const definition = ORDER_DEFINITIONS[event.orderId];
      const reward = definition === undefined ? "" : ` +${definition.vp} VP${definition.coins > 0 ? ` and +${definition.coins} Coins` : ""}`;
      return `${player(event.playerId)} completed ${event.orderId} with ${event.ceramicIds.length} ceramic${event.ceramicIds.length === 1 ? "" : "s"}.${reward}`;
    }
    case "IMPERIAL_PROGRESS_ADVANCED":
      return `${player(event.playerId)} advanced Imperial Progress ${event.from} → ${event.to} (reward +${event.reward}).`;
    case "COURT_PATRONAGE_USED":
      return `${player(event.playerId)} used Court Patronage, paid ${event.cost} Coins, and advanced ${event.from} → ${event.to}.`;
    case "IMPERIAL_SEAL_CLAIMED":
      return `${player(event.playerId)} claimed the Imperial Seal.`;
    case "APPRENTICE_UNLOCKED":
      return `${player(event.playerId)} unlocked Apprentice ${event.workerId}.`;
    case "IMPERIAL_STIPEND_RECEIVED":
      return `${player(event.playerId)} received the Progress ${event.space} court stipend: +${event.coins} Coins.`;
    case "ORDER_DISPLAYS_ROTATED":
      return `Round ${event.round} Order rotation discarded Market ${event.marketOrderIds.join(", ")} and Imperial ${event.imperialOrderIds.join(", ")}.`;
    case "ROUND_STARTED":
      return `Round ${event.round} started. ${player(event.firstPlayerId)} is First Player.`;
    case "PRESENTATION_SUBMITTED":
      return `${player(event.playerId)} submitted ${event.ceramicIds.length} ceramic${event.ceramicIds.length === 1 ? "" : "s"} for the End-game Exhibition.`;
    case "FINAL_SCORE_CALCULATED":
      return `Final scoring completed. Winner${event.result.winnerIds.length === 1 ? "" : "s"}: ${event.result.winnerIds.map(player).join(", ")}.`;
  }
}

function eventDescriptionZh(event: PublicGameEvent, game: PublicGameState): string {
  const player = (playerId: PlayerId): string => game.players[playerId]?.displayName ?? playerId;
  const ceramic = (ceramicId: string): string => {
    const current = game.ceramics[ceramicId];
    return current === undefined ? "陶瓷" : term("zh-CN", current.shape);
  };
  switch (event.type) {
    case "KILN_SELECTED": return `${player(event.playerId)}选择了${KILN_DEFINITIONS[event.kilnId].nameZh}。`;
    case "STARTING_ORDER_KEPT": return `${player(event.playerId)}保留起始订单${event.orderId}。`;
    case "STARTING_ORDER_REDRAWN": return `${player(event.playerId)}弃掉${event.discardedOrderId}并重抽到${event.drawnOrderId}。`;
    case "WORKER_PLACED": return `${player(event.playerId)}将${workerName(event.workerId, "zh-CN")}放到${locationName(event.locationId, "zh-CN")}。`;
    case "PLAYER_PASSED": return `${player(event.playerId)}跳过本轮剩余工作阶段。`;
    case "RESOURCES_CHANGED": return `${player(event.playerId)}的资源变化：${resourceChanges(event, "zh-CN")}。`;
    case "CERAMIC_SHAPED": return `${player(event.playerId)}成型了1件${term("zh-CN", event.shape)}。`;
    case "CERAMIC_GLAZED": return `${player(event.playerId)}为${ceramic(event.ceramicId)}施釉：${term("zh-CN", event.glaze)}、${term("zh-CN", event.decoration)}。`;
    case "CERAMIC_LOADED": return `${player(event.playerId)}将${ceramic(event.ceramicId)}放入${term("zh-CN", event.kilnSpaceId)}。`;
    case "CERAMIC_SOLD": return `${player(event.playerId)}出售了1件${ceramic(event.ceramicId)}。`;
    case "CERAMIC_RETURNED_TO_GLAZED": return `${player(event.playerId)}使用二次烧成；${ceramic(event.ceramicId)}退回已施釉区，并失去标准品品质。`;
    case "ORDER_TAKEN": return `${player(event.playerId)}${event.acquisition === "blind_top" ? "盲抽" : "拿取"}了${event.deck === "market" ? "市场" : "御用"}订单${event.orderId}。`;
    case "COLOUR_SAMPLES_USED": return `${player(event.playerId)}使用釉色样本：${event.bottomedOrderId}移到牌堆底，翻开${event.revealedOrderId ?? "无替补"}。`;
    case "TECHNIQUE_REFRESHED": return `${player(event.playerId)}刷新了${event.techniqueId} · ${TECHNIQUE_DEFINITIONS[event.techniqueId]?.nameZh ?? "未知技术"}。`;
    case "TECHNIQUE_ACQUIRED": return `${player(event.playerId)}以${event.cost}铜钱购买${event.techniqueId} · ${TECHNIQUE_DEFINITIONS[event.techniqueId]?.nameZh ?? "未知技术"}。`;
    case "TECHNIQUE_USED": return `${player(event.playerId)}使用${event.techniqueId} · ${TECHNIQUE_DEFINITIONS[event.techniqueId]?.nameZh ?? "未知技术"}。`;
    case "KILN_ABILITY_USED": return `${player(event.playerId)}使用${KILN_DEFINITIONS[event.kilnId].nameZh}：${KILN_DEFINITIONS[event.kilnId].abilityNameZh}。`;
    case "JUN_ACTIVATION_PAID": return `${player(event.playerId)}为钧窑的窑变妙化支付${event.coins}铜钱。`;
    case "WORK_PHASE_ENDED": return "所有玩家完成工作阶段，开始烧成。";
    case "WOOD_SUBMITTED": return `${player(event.playerId)}提交了秘密柴薪贡献。`;
    case "WOOD_REVEALED": return `柴薪贡献公开：${Object.entries(event.contributions).map(([id, value]) => `${player(id)}贡献${value}柴薪`).join("；")}。`;
    case "FIRE_REVEALED": return `翻开窑火牌${signed(event.modifier)}。基础热度${event.baseHeat}；全局热度${event.globalHeat}。`;
    case "QUALITY_ASSIGNED": return `${ceramic(event.ceramicId)}的品质判定为${term("zh-CN", event.quality)}。`;
    case "FIRING_RESOLVED": return `${ceramic(event.ceramicId)}烧成记录：窑火${signed(event.fireModifier)}，天然热度${event.naturalActualHeat}（热度差${event.naturalHeatDifference}，${term("zh-CN", event.naturalQuality)}），最终热度${event.finalActualHeat}（热度差${event.finalHeatDifference}，${term("zh-CN", event.finalQuality)}）。`;
    case "ORDER_COMPLETED": {
      const definition = ORDER_DEFINITIONS[event.orderId];
      const reward = definition === undefined ? "" : ` +${definition.vp}分${definition.coins > 0 ? `、+${definition.coins}铜钱` : ""}`;
      return `${player(event.playerId)}以${event.ceramicIds.length}件陶瓷完成${event.orderId}。${reward}`;
    }
    case "IMPERIAL_PROGRESS_ADVANCED": return `${player(event.playerId)}的御用进度${event.from} → ${event.to}（奖励进度+${event.reward}）。`;
    case "COURT_PATRONAGE_USED": return `${player(event.playerId)}使用朝廷赞助，支付${event.cost}铜钱，御用进度${event.from} → ${event.to}。`;
    case "IMPERIAL_SEAL_CLAIMED": return `${player(event.playerId)}获得御印。`;
    case "APPRENTICE_UNLOCKED": return `${player(event.playerId)}解锁学徒${event.workerId}。`;
    case "IMPERIAL_STIPEND_RECEIVED": return `${player(event.playerId)}获得进度${event.space}的朝廷赏赐：+${event.coins}铜钱。`;
    case "ORDER_DISPLAYS_ROTATED": return `第${event.round}轮订单轮换弃掉市场订单${event.marketOrderIds.join("、")}和御用订单${event.imperialOrderIds.join("、")}。`;
    case "ROUND_STARTED": return `第${event.round}轮开始。${player(event.firstPlayerId)}为起始玩家。`;
    case "PRESENTATION_SUBMITTED": return `${player(event.playerId)}为终局展陈提交${event.ceramicIds.length}件陶瓷。`;
    case "FINAL_SCORE_CALCULATED": return `最终计分完成。胜者：${event.result.winnerIds.map(player).join("、")}。`;
  }
}

function workerName(workerId: string, locale: Locale = "en"): string {
  return workerId.toLowerCase().includes("shifu") ? term(locale, "shifu") : locale === "zh-CN" ? `工人${workerId}` : `worker ${workerId}`;
}

function locationName(locationId: string, locale: Locale = "en"): string {
  if (locale === "zh-CN") return term(locale, locationId);
  const names: Record<string, string> = {
    materials_yard: "Materials Yard",
    forming_studio: "Forming Studio",
    glaze_workshop: "Glaze Workshop",
    kiln_yard: "Kiln Yard",
    market_imperial_office: "Market & Imperial Office",
    guild_academy: "Guild & Academy",
  };
  return names[locationId] ?? label(locationId);
}

function resourceChanges(event: Extract<PublicGameEvent, { type: "RESOURCES_CHANGED" }>, locale: Locale = "en"): string {
  return [
    [event.clay, term(locale, "clay")],
    [event.wood, term(locale, "wood")],
    [event.coins, term(locale, "coins")],
  ].filter(([value]) => value !== 0)
    .map(([value, resource]) => `${signed(Number(value))} ${resource}`)
    .join(locale === "zh-CN" ? "、" : ", ") || (locale === "zh-CN" ? "无净变化" : "no net change");
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function label(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
