import type { AuthoritativeCommand, PendingContribution, PrivateDecisionState, PublicEventRecord, PublicGameEvent, PublicGameState } from "../multiplayer";
import type { FireModifier, PlayerId } from "../game";
import { CONTRIBUTION_CARD_DEFINITIONS, GAME_CONFIG, KILN_DEFINITIONS, ORDER_DEFINITIONS, TECHNIQUE_DEFINITIONS } from "../game";
import { TabletopGameExperience } from "./TabletopGameExperience";
import { term, useI18n } from "./i18n";
import type { Locale } from "./i18n";

type SendCommand = (command: AuthoritativeCommand) => Promise<boolean>;

export function PlaytestExperience({
  game,
  ownPlayerId,
  ownPendingContribution,
  ownPrivateDecision,
  events,
  busy,
  send,
}: {
  game: PublicGameState;
  ownPlayerId: PlayerId;
  ownPendingContribution: PendingContribution | null;
  ownPrivateDecision?: PrivateDecisionState | undefined;
  events: PublicEventRecord[];
  busy: boolean;
  send: SendCommand;
}) {
  const { locale } = useI18n();
  return (
    <div className="playtest-shell has-tabletop-live" data-testid="playtest-ui">
      <TabletopGameExperience
        game={game}
        ownPlayerId={ownPlayerId}
        ownPendingContribution={ownPendingContribution}
        ownPrivateDecision={ownPrivateDecision}
        events={events}
        describeEvent={(record, liveGame, locale) => eventDescription(record.event, liveGame, locale)}
        busy={busy}
        send={send}
      />
      <details className="kiln-live-diagnostics">
        <summary>{locale === "zh-CN" ? "试玩调试" : "Playtest diagnostics"}</summary>
        <GameLog game={game} events={events} />
        <DebugPanel game={game} />
      </details>
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
  const { locale } = useI18n();
  const fireComposition = ([-2, -1, 0, 1, 2] as FireModifier[]).map((modifier) => {
    const initial = GAME_CONFIG.fireDeck[String(modifier) as keyof typeof GAME_CONFIG.fireDeck];
    const discarded = game.discards.fire.filter((card) => card === modifier).length;
    return `${signed(modifier)}: ${initial - discarded}`;
  }).join(" · ");
  return (
    <section className="playtest-panel debug-panel" aria-labelledby="debug-panel-title">
      <div className="playtest-panel-heading">
        <div>
          <p className="eyebrow">{locale === "zh-CN" ? "只读" : "Read-only"}</p>
          <h2 id="debug-panel-title">{locale === "zh-CN" ? "试玩调试" : "Playtest Debug"}</h2>
        </div>
        <span>{locale === "zh-CN" ? "仅公开状态" : "Public state only"}</span>
      </div>
      <dl className="debug-counts">
        <div><dt>{locale === "zh-CN" ? "状态版本" : "Revision"}</dt><dd>{game.revision}</dd></div>
        <div><dt>{locale === "zh-CN" ? "事件序号" : "Event sequence"}</dt><dd>{game.eventSequence}</dd></div>
        <div><dt>{locale === "zh-CN" ? "主委托牌库／弃牌" : "Main Order deck / discard"}</dt><dd>{game.decks.marketRemaining} / {game.discards.market.length}</dd></div>
        <div><dt>{locale === "zh-CN" ? "窑火牌库／弃牌" : "Fire deck / discard"}</dt><dd>{game.decks.fireRemaining} / {game.discards.fire.length}</dd></div>
        <div><dt>{locale === "zh-CN" ? "各数值剩余窑火牌" : "Fire remaining by value"}</dt><dd>{fireComposition}</dd></div>
        <div><dt>{locale === "zh-CN" ? "技艺牌库" : "Technique decks"}</dt><dd>{term(locale, "forming")} {game.decks.techniqueRemaining.forming} · {term(locale, "glazing")} {game.decks.techniqueRemaining.glazing} · {term(locale, "firing")} {game.decks.techniqueRemaining.firing}</dd></div>
        <div><dt>{locale === "zh-CN" ? "公共资源库" : "Common supply"}</dt><dd>{game.commonSupply.clay} {term(locale, "clay")} · {game.commonSupply.wood} {term(locale, "wood")} · {game.commonSupply.coins} {term(locale, "coins")}</dd></div>
        <div><dt>{locale === "zh-CN" ? "器物供应" : "Vessel supply"}</dt><dd>{Object.entries(game.vesselSupplyCounts).map(([shape, count]) => `${term(locale, shape)} ${count}`).join(" · ")}</dd></div>
      </dl>
      <details className="raw-state">
        <summary>{locale === "zh-CN" ? "显示原始公开游戏状态" : "Show raw public game state"}</summary>
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
    case "STARTING_TECH_SELECTED":
      return `${player(event.playerId)} selected Starting Tech ${event.techniqueId}.`;
    case "STARTING_ORDERS_SUBMITTED":
      return `${player(event.playerId)} locked an opening Order choice.`;
    case "STARTING_ORDERS_REVEALED":
      return `Opening Orders revealed: ${Object.entries(event.ordersByPlayer).map(([id, orders]) => `${player(id)} kept ${orders.join(", ")}`).join("; ")}.`;
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
    case "KILN_YARD_SHIFU_MARKED":
      return `${player(event.playerId)} placed their Kiln Yard Shifu on the ${ceramic(event.ceramicId)} ceramic selected for this firing.`;
    case "KILN_YARD_SHIFU_REPOSITIONED":
      return `${player(event.playerId)} moved the Shifu-marked ${ceramic(event.ceramicId)} ceramic from ${label(event.fromSpaceId)} to ${label(event.toSpaceId)}.`;
    case "KILN_YARD_SHIFU_REPOSITION_DECLINED":
      return `${player(event.playerId)} kept the Shifu-marked ${ceramic(event.ceramicId)} ceramic in place.`;
    case "ORDER_TAKEN":
      return `${player(event.playerId)} ${event.acquisition === "colour_samples" ? "selected" : "took"} ${event.orderId} from the Main Orders${event.acquisition === "colour_samples" ? " through Colour Samples" : ""}.`;
    case "COLOUR_SAMPLES_USED":
      return `${player(event.playerId)} used Colour Samples, reserved ${event.selectedOrderId ?? "an Order"}, and discarded ${event.discardedCount} looked-at Order${event.discardedCount === 1 ? "" : "s"}.`;
    case "GUILD_DISCIPLINE_INSPECTED":
      return `${player(event.playerId)} inspected the top ${event.count} ${event.discipline} Tech${event.count === 1 ? "" : "s"}.`;
    case "TECHNIQUE_ACQUIRED":
      return `${player(event.playerId)} bought ${event.techniqueId} · ${TECHNIQUE_DEFINITIONS[event.techniqueId]?.name ?? "Unknown Technique"} for ${event.cost} Coins.`;
    case "TECHNIQUE_USED":
      return `${player(event.playerId)} used ${event.techniqueId} · ${TECHNIQUE_DEFINITIONS[event.techniqueId]?.name ?? "Unknown Technique"}.`;
    case "KILN_ABILITY_USED":
      return `${player(event.playerId)} used ${KILN_DEFINITIONS[event.kilnId].name}: ${KILN_DEFINITIONS[event.kilnId].abilityName}.`;
    case "IMPERIAL_PRIORITY_USED":
      return `${player(event.playerId)} spent Imperial Priority to load one additional ceramic into their Imperial Kiln.`;
    case "JUN_ACTIVATION_PAID":
      return `${player(event.playerId)} paid ${event.wood} Wood for Jun's Kiln Transformation.`;
    case "WORK_PHASE_ENDED":
      return "All players finished the Work Phase. Firing began.";
    case "WOOD_SUBMITTED":
      return `${player(event.playerId)} submitted a secret Contribution card.`;
    case "WOOD_REVEALED":
      return `Contribution cards revealed: ${Object.entries(event.contributions).map(([id, cardId]) => {
        const card = CONTRIBUTION_CARD_DEFINITIONS[cardId];
        const heat = event.effectiveHeatAdjustments[id] ?? card.heatAdjustment;
        const usedFuelLedger = heat !== card.heatAdjustment;
        return `${player(id)} chose ${card.name}${usedFuelLedger ? " + Fuel Ledger" : ""} (${card.woodCost + (usedFuelLedger ? 1 : 0)} Wood, ${signed(heat)} Heat)`;
      }).join("; ")}.`;
    case "FIRE_REVEALED":
      return `Fire card ${signed(event.modifier)} revealed. Base Heat ${event.baseHeat}; Global Heat ${event.globalHeat}.`;
    case "QUALITY_ASSIGNED":
      return `The ${ceramic(event.ceramicId)} ceramic was assigned ${label(event.quality)} Quality.`;
    case "SECOND_FIRING_RESOLVED":
      return `${player(event.playerId)} resolved Second Firing on the ${ceramic(event.ceramicId)} ceramic with Fire ${signed(event.fireModifier)}; its replacement Quality is ${label(event.quality)}.`;
    case "WORKSHOP_SECONDS_SOLD":
      return `${player(event.playerId)} discarded a still-Flawed ${ceramic(event.ceramicId)} to gain ${event.coins} Coins.`;
    case "FIRING_RESOLVED":
      return `${ceramic(event.ceramicId)} ceramic firing recorded: Fire ${signed(event.fireModifier)}, natural Heat ${event.naturalActualHeat} (difference ${event.naturalHeatDifference}, ${label(event.naturalQuality)}), final Heat ${event.finalActualHeat} (difference ${event.finalHeatDifference}, ${label(event.finalQuality)}).`;
    case "ORDER_COMPLETED": {
      const definition = ORDER_DEFINITIONS[event.orderId];
      const reward = definition === undefined ? "" : ` +${definition.vp} VP${definition.coins > 0 ? ` and +${definition.coins} Coins` : ""}`;
      return `${player(event.playerId)} completed ${event.orderId} with ${event.ceramicIds.length} ceramic${event.ceramicIds.length === 1 ? "" : "s"}.${reward}`;
    }
    case "IMPERIAL_RECOGNITION_ADVANCED":
      return `${player(event.playerId)} gained ${event.crowns} Crown${event.crowns === 1 ? "" : "s"}: Imperial Recognition ${event.from} → ${event.to}${event.overflowVp > 0 ? `; +${event.overflowVp} VP beyond Recognition 4` : ""}.`;
    case "IMPERIAL_GRANT_RECEIVED":
      return `${player(event.playerId)} resolved Imperial Grant: ${event.choice === "coins" ? `${event.coins} Coins` : `${event.clay} Clay, ${event.wood} Wood and ${event.coins} Coin`}.`;
    case "IMPERIAL_KILN_UNLOCKED":
      return `${player(event.playerId)} reached Imperial Gift and unlocked their Imperial Kiln.`;
    case "IMPERIAL_PRIORITY_GAINED":
      return `${player(event.playerId)} gained an Imperial Priority token.`;
    case "IMPERIAL_AUDIENCE_GAINED":
      return `${player(event.playerId)} reached Imperial Audience and gained ${event.vp} VP.`;
    case "ORDERS_DISCARDED_FOR_CLEANUP":
      return `${player(event.playerId)} discarded ${event.orderIds.join(", ")} during Cleanup.`;
    case "ORDER_DISPLAYS_ROTATED":
      return `Round ${event.round} Order rotation discarded Main Orders ${event.marketOrderIds.join(", ")}.`;
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
    case "STARTING_TECH_SELECTED": return `${player(event.playerId)}选择了起始技艺${event.techniqueId}。`;
    case "STARTING_ORDERS_SUBMITTED": return `${player(event.playerId)}已锁定起始委托选择。`;
    case "STARTING_ORDERS_REVEALED": return `起始委托同时公开：${Object.entries(event.ordersByPlayer).map(([id, orders]) => `${player(id)}保留${orders.join("、")}`).join("；")}。`;
    case "WORKER_PLACED": return `${player(event.playerId)}将${workerName(event.workerId, "zh-CN")}放到${locationName(event.locationId, "zh-CN")}。`;
    case "PLAYER_PASSED": return `${player(event.playerId)}跳过本轮剩余作业阶段。`;
    case "RESOURCES_CHANGED": return `${player(event.playerId)}的资源变化：${resourceChanges(event, "zh-CN")}。`;
    case "CERAMIC_SHAPED": return `${player(event.playerId)}成型了1件${term("zh-CN", event.shape)}。`;
    case "CERAMIC_GLAZED": return `${player(event.playerId)}为${ceramic(event.ceramicId)}施釉：${term("zh-CN", event.glaze)}、${term("zh-CN", event.decoration)}。`;
    case "CERAMIC_LOADED": return `${player(event.playerId)}将${ceramic(event.ceramicId)}放入${term("zh-CN", event.kilnSpaceId)}。`;
    case "KILN_YARD_SHIFU_MARKED": return `${player(event.playerId)}将窑坊师傅放在本次烧成所选的${ceramic(event.ceramicId)}陶瓷上。`;
    case "KILN_YARD_SHIFU_REPOSITIONED": return `${player(event.playerId)}将师傅所在的${ceramic(event.ceramicId)}陶瓷从${term("zh-CN", event.fromSpaceId)}移至${term("zh-CN", event.toSpaceId)}。`;
    case "KILN_YARD_SHIFU_REPOSITION_DECLINED": return `${player(event.playerId)}选择不移动师傅所在的${ceramic(event.ceramicId)}陶瓷。`;
    case "ORDER_TAKEN": return `${player(event.playerId)}${event.acquisition === "colour_samples" ? "通过色样簿承接" : "承接"}了主委托${event.orderId}。`;
    case "COLOUR_SAMPLES_USED": return `${player(event.playerId)}使用色样簿，承接${event.selectedOrderId ?? "1张委托"}，并弃掉${event.discardedCount}张未承接的已查看委托。`;
    case "GUILD_DISCIPLINE_INSPECTED": return `${player(event.playerId)}查看了${DISCIPLINE_ZH[event.discipline]}牌堆顶${event.count}个技艺。`;
    case "TECHNIQUE_ACQUIRED": return `${player(event.playerId)}以${event.cost}铜钱取得${event.techniqueId} · ${TECHNIQUE_DEFINITIONS[event.techniqueId]?.nameZh ?? "未知技艺"}。`;
    case "TECHNIQUE_USED": return `${player(event.playerId)}使用${event.techniqueId} · ${TECHNIQUE_DEFINITIONS[event.techniqueId]?.nameZh ?? "未知技艺"}。`;
    case "KILN_ABILITY_USED": return `${player(event.playerId)}使用${KILN_DEFINITIONS[event.kilnId].nameZh}：${KILN_DEFINITIONS[event.kilnId].abilityNameZh}。`;
    case "IMPERIAL_PRIORITY_USED": return `${player(event.playerId)}花费御烧优先标记，将1件已施釉陶瓷装入自己的御窑。`;
    case "JUN_ACTIVATION_PAID": return `${player(event.playerId)}为钧窑的窑变天成支付${event.wood}柴。`;
    case "WORK_PHASE_ENDED": return "所有玩家完成作业阶段，开始烧成。";
    case "WOOD_SUBMITTED": return `${player(event.playerId)}提交了秘密控火牌。`;
    case "WOOD_REVEALED": return `控火牌公开：${Object.entries(event.contributions).map(([id, cardId]) => {
      const card = CONTRIBUTION_CARD_DEFINITIONS[cardId];
      const heat = event.effectiveHeatAdjustments[id] ?? card.heatAdjustment;
      const usedFuelLedger = heat !== card.heatAdjustment;
      return `${player(id)}选择${card.nameZh}${usedFuelLedger ? "并使用柴簿" : ""}（${card.woodCost + (usedFuelLedger ? 1 : 0)}柴，火候${signed(heat)}）`;
    }).join("；")}。`;
    case "FIRE_REVEALED": return `翻开窑火牌${signed(event.modifier)}。基础火候${event.baseHeat}；全窑火候${event.globalHeat}。`;
    case "QUALITY_ASSIGNED": return `${ceramic(event.ceramicId)}的品质判定为${term("zh-CN", event.quality)}。`;
    case "SECOND_FIRING_RESOLVED": return `${player(event.playerId)}对${ceramic(event.ceramicId)}结算复烧，额外窑火为${signed(event.fireModifier)}；替代后的品质为${term("zh-CN", event.quality)}。`;
    case "WORKSHOP_SECONDS_SOLD": return `${player(event.playerId)}弃掉1件仍为瑕品的${ceramic(event.ceramicId)}，获得${event.coins}铜钱。`;
    case "FIRING_RESOLVED": return `${ceramic(event.ceramicId)}烧成记录：窑火${signed(event.fireModifier)}，自然实际火候${event.naturalActualHeat}（火候差${event.naturalHeatDifference}，${term("zh-CN", event.naturalQuality)}），最终实际火候${event.finalActualHeat}（火候差${event.finalHeatDifference}，${term("zh-CN", event.finalQuality)}）。`;
    case "ORDER_COMPLETED": {
      const definition = ORDER_DEFINITIONS[event.orderId];
      const reward = definition === undefined ? "" : ` +${definition.vp}分${definition.coins > 0 ? `、+${definition.coins}铜钱` : ""}`;
      return `${player(event.playerId)}以${event.ceramicIds.length}件陶瓷完成${event.orderId}。${reward}`;
    }
    case "IMPERIAL_RECOGNITION_ADVANCED": return `${player(event.playerId)}获得${event.crowns}个👑：御府声望${event.from} → ${event.to}${event.overflowVp > 0 ? `；超出声望4的${event.overflowVp}个👑立即获得${event.overflowVp}分` : ""}。`;
    case "IMPERIAL_GRANT_RECEIVED": return `${player(event.playerId)}结算御赐：${event.choice === "coins" ? `${event.coins}铜钱` : `${event.clay}泥、${event.wood}柴和${event.coins}铜钱`}。`;
    case "IMPERIAL_KILN_UNLOCKED": return `${player(event.playerId)}到达赐御窑，获得御窑。`;
    case "IMPERIAL_PRIORITY_GAINED": return `${player(event.playerId)}获得御烧优先标记。`;
    case "IMPERIAL_AUDIENCE_GAINED": return `${player(event.playerId)}到达御前召见，获得${event.vp}分。`;
    case "ORDERS_DISCARDED_FOR_CLEANUP": return `${player(event.playerId)}在整备阶段弃掉${event.orderIds.join("、")}。`;
    case "ORDER_DISPLAYS_ROTATED": return `第${event.round}轮委托轮换弃掉主委托${event.marketOrderIds.join("、")}。`;
    case "ROUND_STARTED": return `第${event.round}轮开始。${player(event.firstPlayerId)}为起始玩家。`;
    case "PRESENTATION_SUBMITTED": return `${player(event.playerId)}为终局陈列提交${event.ceramicIds.length}件陶瓷，其中${event.featuredCeramicIds.length}件为主题藏品。`;
    case "FINAL_SCORE_CALCULATED": return `最终计分完成。胜者：${event.result.winnerIds.map(player).join("、")}。`;
  }
}

function workerName(workerId: string, locale: Locale = "en"): string {
  return workerId.toLowerCase().includes("shifu") ? term(locale, "shifu") : locale === "zh-CN" ? `工人${workerId}` : `worker ${workerId}`;
}

/** Both locales read the V1.2.6 location names from the shared term table. */
function locationName(locationId: string, locale: Locale = "en"): string {
  return term(locale, locationId);
}

const DISCIPLINE_ZH: Record<string, string> = { forming: "成型", glazing: "施釉", firing: "烧成" };

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
