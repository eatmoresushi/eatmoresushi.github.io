import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  IMPERIAL_PROGRESS,
  KILN_DEFINITIONS,
  LOCATION_DEFINITIONS,
  ORDER_DEFINITIONS,
  preferredHeat,
  STARTING_TECHNIQUE_DEFINITIONS,
  TECHNIQUE_DEFINITIONS,
} from "../../game";
import type {
  Decoration,
  Glaze,
  LocationId,
  Quality,
  Shape,
  StartingTechniqueId,
  TechniqueDiscipline,
  WorkerKind,
} from "../../game";
import { useI18n } from "../i18n";
import {
  ACTION_OCCUPANCY,
  BOARD_LOCATIONS,
  FACE_UP_TECHNIQUES,
  FIRE_DECK_REMAINING,
  KILN_CERAMICS,
  MAIN_ORDER_DECK_REMAINING,
  MARKET_ORDER_IDS,
  MOCK_PLAYER_COUNT,
  PLAYERS,
  TECH_DECK_REMAINING,
  WORKSHOP_CERAMICS,
} from "./tabletopMockFixture";
import type { MockCeramic, MockPlayer } from "./tabletopMockFixture";
import "./tabletop-mock.css";

type Inspection =
  | { type: "player"; id: string }
  | { type: "order"; id: string }
  | { type: "technique"; id: string }
  | { type: "log" }
  | null;

type MockNotice = "worker-first" | "illegal" | "confirmed" | "passed" | null;

function text(locale: "en" | "zh-CN", english: string, chinese: string): string {
  return locale === "zh-CN" ? chinese : english;
}

function mockLocationReason(id: LocationId, worker: WorkerKind, locale: "en" | "zh-CN"): string | null {
  if (id === "guild_academy") {
    return text(locale, "Advanced Tech limit reached (2 / 2)", "已达进阶技艺上限（2 / 2）");
  }
  const capacity = LOCATION_DEFINITIONS[id].capacity[String(MOCK_PLAYER_COUNT) as "2" | "3" | "4"];
  const occupied = ACTION_OCCUPANCY[id]?.length ?? 0;
  if (worker === "apprentice" && capacity !== null && occupied >= capacity) {
    return text(locale, "Full — select your Shifu to overfill", "已满——可选择师傅超容量放置");
  }
  return null;
}

export function TabletopMockPage() {
  const { locale, setLocale, term } = useI18n();
  const [selectedWorker, setSelectedWorker] = useState<WorkerKind | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<LocationId | null>(null);
  const [inspection, setInspection] = useState<Inspection>(null);
  const [notice, setNotice] = useState<MockNotice>(null);

  const selectedDefinition = selectedLocation === null ? null : LOCATION_DEFINITIONS[selectedLocation];
  const selectedLocationLegal = selectedWorker !== null && selectedLocation !== null
    ? mockLocationReason(selectedLocation, selectedWorker, locale) === null
    : false;
  const instruction = selectedWorker === null
    ? text(locale, "Choose one of your available workers", "选择一名可用工人")
    : selectedDefinition === null
      ? text(locale, `Choose an action space for your ${term(selectedWorker)}`, `为你的${term(selectedWorker)}选择行动地点`)
      : selectedLocationLegal
        ? text(locale, `Preview: ${selectedDefinition.name}`, `预览：${selectedDefinition.nameZh}`)
        : text(locale, `Unavailable: ${selectedDefinition.name}`, `不可放置：${selectedDefinition.nameZh}`);

  function chooseWorker(kind: WorkerKind): void {
    setSelectedWorker(kind);
    setSelectedLocation(null);
    setNotice(null);
  }

  function chooseLocation(id: LocationId): void {
    setSelectedLocation(id);
    setNotice(selectedWorker === null ? "worker-first" : mockLocationReason(id, selectedWorker, locale) === null ? null : "illegal");
  }

  function confirmPreview(): void {
    if (selectedWorker === null || selectedDefinition === null || !selectedLocationLegal) return;
    setNotice("confirmed");
  }

  function resetSelection(): void {
    setSelectedWorker(null);
    setSelectedLocation(null);
    setNotice(null);
  }

  return (
    <div className="kiln-mock-root">
      <a className="kiln-mock-skip" href="#kiln-mock-board">{text(locale, "Skip to game board", "跳到游戏板")}</a>

      <header className="kiln-mock-topbar">
        <a className="kiln-mock-brand" href={import.meta.env.BASE_URL}>
          <span aria-hidden="true">窑</span>
          <span>
            <strong>{text(locale, "KILN OPENING", "开窑")}</strong>
            <small>{text(locale, "Song workshop strategy", "宋代陶瓷作坊策略游戏")}</small>
          </span>
        </a>

        <div className="kiln-mock-turn-summary" aria-label={text(locale, "Current game status", "当前游戏状态")}>
          <span><small>{text(locale, "Round", "轮次")}</small><strong>3 / 5</strong></span>
          <span><small>{text(locale, "Phase", "阶段")}</small><strong>{text(locale, "Work", "作业")}</strong></span>
          <span className="is-current"><small>{text(locale, "Current player", "当前玩家")}</small><strong>{text(locale, "Your turn", "轮到你")}</strong></span>
          <span><small>{text(locale, "Room", "房间")}</small><strong>JADE26</strong></span>
        </div>

        <div className="kiln-mock-header-actions">
          <span className="kiln-mock-concept-label">{text(locale, "UI concept · sample state", "界面概念 · 示例状态")}</span>
          <div className="kiln-mock-language" role="group" aria-label="Language / 语言">
            <button type="button" aria-pressed={locale === "en"} onClick={() => setLocale("en")}>EN</button>
            <button type="button" aria-pressed={locale === "zh-CN"} onClick={() => setLocale("zh-CN")}>中文</button>
          </div>
          <button className="kiln-mock-icon-button" type="button" onClick={() => setInspection({ type: "log" })} aria-label={text(locale, "Open game log", "打开游戏记录")}>
            <span aria-hidden="true">☰</span>
          </button>
        </div>
      </header>

      <section className="kiln-mock-player-dock" aria-label={text(locale, "Players", "玩家")}>
        {PLAYERS.map((player, index) => (
          <button
            className={`kiln-mock-player kiln-mock-accent-${player.accent} ${index === 0 ? "is-you is-active" : ""}`}
            type="button"
            onClick={() => setInspection({ type: "player", id: player.id })}
            aria-label={text(locale, `Inspect ${player.name}'s workshop`, `查看${player.nameZh}的作坊`)}
            key={player.id}
          >
            <span className="kiln-mock-avatar" aria-hidden="true">{locale === "zh-CN" ? player.nameZh.slice(0, 1) : player.name.slice(0, 1)}</span>
            <span className="kiln-mock-player-name">
              <strong>{locale === "zh-CN" ? player.nameZh : player.name}{index === 0 ? text(locale, " · You", " · 你") : ""}</strong>
              <small>{locale === "zh-CN" ? KILN_DEFINITIONS[player.kilnId].nameZh : KILN_DEFINITIONS[player.kilnId].name}</small>
            </span>
            <span className="kiln-mock-player-score"><small>{text(locale, "VP", "分")}</small><b>{player.vp}</b></span>
            <span className="kiln-mock-player-resources" aria-label={text(locale, "Resources", "资源")}>
              <i>泥 {player.clay}</i><i>柴 {player.wood}</i><i>钱 {player.coins}</i>
            </span>
            <span className="kiln-mock-player-public">
              <i>{player.orderIds.length} {text(locale, "Orders", "委托")}</i>
              <i aria-label={text(locale, `1 Starting Tech and ${player.techniqueIds.length} Advanced Techs`, `1项起始技艺和${player.techniqueIds.length}项进阶技艺`)}>{player.techniqueIds.length + 1} {text(locale, "Techs", "技艺")}</i>
              <i>{player.workersRemaining} {text(locale, "workers", "工人")}</i>
            </span>
            {player.isFirst && <span className="kiln-mock-first-player" title={text(locale, "First Player", "起始玩家")}>一</span>}
          </button>
        ))}
      </section>

      <main className="kiln-mock-table" id="kiln-mock-board">
        <MarketShelf locale={locale} onInspect={(id) => setInspection({ type: "order", id })} />

        <div className="kiln-mock-play-area">
          <div className="kiln-mock-board-scroll">
            <section className="kiln-mock-board" aria-label={text(locale, "Shared game board", "共享游戏板")}>
              <RoundTrack locale={locale} />

              <div className="kiln-mock-action-ring">
                {BOARD_LOCATIONS.map(({ id, glyph, position }) => (
                  <ActionSpace
                    id={id}
                    glyph={glyph}
                    position={position}
                    locale={locale}
                    selectedWorker={selectedWorker}
                    legal={selectedWorker === null ? null : mockLocationReason(id, selectedWorker, locale) === null}
                    illegalReason={selectedWorker === null ? null : mockLocationReason(id, selectedWorker, locale)}
                    selected={selectedLocation === id}
                    onChoose={() => chooseLocation(id)}
                    key={id}
                  />
                ))}
                <SharedKiln locale={locale} />
                <FiringDeck locale={locale} />
              </div>

              <ImperialTrack locale={locale} />
            </section>
          </div>

          <TechniqueMarket locale={locale} onInspect={(id) => setInspection({ type: "technique", id })} />
        </div>

        <OwnWorkshop
          locale={locale}
          selectedWorker={selectedWorker}
          onChooseWorker={chooseWorker}
          onInspectOrder={(id) => setInspection({ type: "order", id })}
          onInspectTechnique={(id) => setInspection({ type: "technique", id })}
        />
      </main>

      <section className="kiln-mock-actionbar" aria-label={text(locale, "Current action", "当前行动")}>
        <div className="kiln-mock-action-copy">
          <span aria-hidden="true">{selectedDefinition === null ? selectedWorker === null ? "人" : "位" : selectedDefinition.nameZh.slice(0, 1)}</span>
          <div>
            <small>{text(locale, "YOUR ACTION", "你的行动")}</small>
            <strong>{instruction}</strong>
            {selectedDefinition !== null && selectedWorker !== null && (
              <p>{selectedWorker === "shifu"
                ? locale === "zh-CN" ? selectedDefinition.shifuZh : selectedDefinition.shifu
                : locale === "zh-CN" ? selectedDefinition.apprenticeZh : selectedDefinition.apprentice}</p>
            )}
            {notice !== null && (
              <p className="kiln-mock-notice" role="status">
                {notice === "worker-first"
                  ? text(locale, "Choose a worker first; the space remains available to inspect.", "请先选择工人；你仍可查看此地点。")
                  : notice === "illegal" && selectedLocation !== null && selectedWorker !== null
                    ? mockLocationReason(selectedLocation, selectedWorker, locale)
                  : notice === "passed"
                    ? text(locale, "Mock preview only — Pass would end your Work participation for this round.", "仅为界面预览——跳过将结束你本轮的作业阶段。")
                    : selectedDefinition !== null && selectedWorker !== null
                      ? text(
                        locale,
                        `Mock preview only — a real game would now submit ${term(selectedWorker)} → ${selectedDefinition.name} to the server.`,
                        `仅为界面预览——正式游戏会将${term(selectedWorker)} → ${selectedDefinition.nameZh}提交给服务器。`,
                      )
                      : null}
              </p>
            )}
          </div>
        </div>
        <div className="kiln-mock-action-buttons">
          {(selectedWorker !== null || selectedLocation !== null) && (
            <button className="kiln-mock-button kiln-mock-button-ghost" type="button" onClick={resetSelection}>{text(locale, "Cancel", "取消")}</button>
          )}
          <button className="kiln-mock-button kiln-mock-button-danger" type="button" onClick={() => setNotice("passed")}>{text(locale, "Pass", "跳过")}</button>
          <button className="kiln-mock-button kiln-mock-button-primary" type="button" disabled={!selectedLocationLegal} onClick={confirmPreview}>{text(locale, "Confirm placement", "确认放置")}</button>
        </div>
      </section>

      {inspection !== null && <Inspector inspection={inspection} locale={locale} onClose={() => setInspection(null)} />}
    </div>
  );
}

function MarketShelf({ locale, onInspect }: { locale: "en" | "zh-CN"; onInspect: (id: string) => void }) {
  return (
    <section className="kiln-mock-market" aria-labelledby="kiln-mock-market-title">
      <div className="kiln-mock-section-title">
        <span aria-hidden="true">单</span>
        <div><small>{text(locale, "COMMISSION MARKET", "瓷牙行")}</small><strong id="kiln-mock-market-title">{text(locale, "Face-up Main Orders", "公开主委托")}</strong></div>
      </div>
      <div className="kiln-mock-order-deck" role="img" aria-label={text(locale, `Main Order deck, ${MAIN_ORDER_DECK_REMAINING} remaining`, `主委托牌库，剩余${MAIN_ORDER_DECK_REMAINING}张`)}>
        <span aria-hidden="true">委</span><small>{MAIN_ORDER_DECK_REMAINING}</small>
      </div>
      <div className="kiln-mock-order-row">
        {MARKET_ORDER_IDS.map((id, index) => <OrderCard id={id} locale={locale} displayIndex={index + 1} onInspect={onInspect} key={id} />)}
      </div>
      <div className="kiln-mock-market-note">
        <small>{text(locale, "Reserve from the display · refills immediately", "从展示区承接 · 立即补牌")}</small>
        <strong>{text(locale, "Round 3 refresh already resolved", "第3轮换牌已结算")}</strong>
      </div>
    </section>
  );
}

function OrderCard({ id, locale, displayIndex, compact = false, onInspect }: {
  id: string;
  locale: "en" | "zh-CN";
  displayIndex?: number;
  compact?: boolean;
  onInspect: (id: string) => void;
}) {
  const order = ORDER_DEFINITIONS[id];
  if (order === undefined) return null;
  return (
    <button
      className={`kiln-mock-order-card ${order.crowns > 0 ? "is-crown" : ""} ${compact ? "is-compact" : ""}`}
      type="button"
      onClick={() => onInspect(id)}
      aria-label={text(locale, `Inspect Order ${id}`, `查看委托 ${id}`)}
    >
      {displayIndex !== undefined && <span className="kiln-mock-display-index">{displayIndex}</span>}
      <header><b>{id}</b><span>{"♛".repeat(order.crowns)}</span></header>
      <div className="kiln-mock-order-seal" aria-hidden="true">{order.ceramics.length}</div>
      <p>{locale === "zh-CN" ? order.requirementsZh : order.requirements}</p>
      <footer>
        <span><small>{text(locale, "MIN", "最低")}</small><b>{qualityLabel(order.minQuality, locale)}</b></span>
        <span><small>{text(locale, "VP", "分")}</small><b>{order.vp}</b></span>
        <span><small>{text(locale, "COIN", "钱")}</small><b>{order.coins}</b></span>
      </footer>
    </button>
  );
}

function RoundTrack({ locale }: { locale: "en" | "zh-CN" }) {
  return (
    <section className="kiln-mock-round-track" aria-label={text(locale, "Round track, round 3 of 5", "轮次轨，第3轮，共5轮")}>
      <strong>{text(locale, "ROUND", "轮次")}</strong>
      {[1, 2, 3, 4, 5].map((round) => (
        <span className={round === 3 ? "is-current" : round < 3 ? "is-complete" : ""} key={round}>
          <i>{round}</i><small>{round === 3 ? text(locale, "Work", "作业") : ""}</small>
        </span>
      ))}
    </section>
  );
}

function ActionSpace({ id, glyph, position, locale, selectedWorker, legal, illegalReason, selected, onChoose }: {
  id: LocationId;
  glyph: string;
  position: string;
  locale: "en" | "zh-CN";
  selectedWorker: WorkerKind | null;
  legal: boolean | null;
  illegalReason: string | null;
  selected: boolean;
  onChoose: () => void;
}) {
  const definition = LOCATION_DEFINITIONS[id];
  const occupants = ACTION_OCCUPANCY[id] ?? [];
  const maximumCapacity = definition.capacity["4"];
  const activeCapacity = definition.capacity[String(MOCK_PLAYER_COUNT) as "2" | "3" | "4"];
  const effect = selectedWorker === "shifu"
    ? locale === "zh-CN" ? definition.shifuZh : definition.shifu
    : locale === "zh-CN" ? definition.apprenticeZh : definition.apprentice;
  return (
    <button
      className={`kiln-mock-action-space position-${position} ${legal === true ? "is-available" : ""} ${legal === false ? "is-illegal" : ""} ${selected ? "is-selected" : ""}`}
      type="button"
      onClick={onChoose}
      aria-pressed={selected}
    >
      <header><span aria-hidden="true">{glyph}</span><div><strong>{locale === "zh-CN" ? definition.nameZh : definition.name}</strong><small>{illegalReason ?? (selectedWorker === "shifu" && activeCapacity !== null && occupants.length >= activeCapacity
        ? text(locale, "Shifu may overfill", "师傅可超容量")
        : selectedWorker === "shifu" ? text(locale, "Shifu effect", "师傅效果") : text(locale, "Apprentice effect", "学徒效果"))}</small></div></header>
      <p>{effect}</p>
      <footer>
        <span className="kiln-mock-capacity" aria-label={activeCapacity === null ? text(locale, "Unlimited capacity", "无限容量") : text(locale, `${occupants.length} of ${activeCapacity} active spaces occupied in this ${MOCK_PLAYER_COUNT}-player game. Spaces marked 3P and 4P require that many players.`, `${MOCK_PLAYER_COUNT}人游戏：已占${occupants.length}/${activeCapacity}个可用位置。标有3P和4P的位置需要相应玩家人数。`)}>
          {maximumCapacity === null ? <i aria-hidden="true">∞</i> : Array.from({ length: maximumCapacity }, (_, index) => {
            const minimumPlayers = index >= 2 ? index + 1 : null;
            const isLocked = activeCapacity !== null && index >= activeCapacity;
            return (
              <i
                aria-hidden="true"
                className={`${index < occupants.length ? "is-filled" : ""} ${isLocked ? "is-locked" : ""}`}
                data-min-players={minimumPlayers ?? undefined}
                key={index}
                title={minimumPlayers === null ? undefined : isLocked
                  ? text(locale, `Locked — requires ${minimumPlayers} players`, `未开放——需要${minimumPlayers}名玩家`)
                  : text(locale, `Available with ${minimumPlayers} or more players`, `${minimumPlayers}人及以上可用`)}
              >
                {minimumPlayers === null ? "" : `${minimumPlayers}P`}
              </i>
            );
          })}
        </span>
        <span className="kiln-mock-occupants">
          {occupants.map((occupant, index) => {
            const player = PLAYERS.find((candidate) => candidate.id === occupant.playerId) ?? PLAYERS[0]!;
            return <WorkerToken
              kind={occupant.kind}
              playerId={occupant.playerId}
              small
              ariaLabel={text(locale, `${player.name}'s ${occupant.kind === "shifu" ? "Shifu" : "Apprentice"}`, `${player.nameZh}的${occupant.kind === "shifu" ? "师傅" : "学徒"}`)}
              key={`${occupant.playerId}-${index}`}
            />;
          })}
        </span>
      </footer>
    </button>
  );
}

function SharedKiln({ locale }: { locale: "en" | "zh-CN" }) {
  const occupiedSpaces = KILN_CERAMICS.filter((ceramic) => ceramic !== null).length;
  return (
    <section className="kiln-mock-shared-kiln" aria-labelledby="kiln-mock-kiln-title">
      <header>
        <div><small>{text(locale, "BASE HEAT", "基础火候")}</small><strong>2</strong></div>
        <span aria-hidden="true">火</span>
        <div><small>{text(locale, "LAST FIRE", "上次窑火")}</small><strong>+1</strong></div>
      </header>
      <div className="kiln-mock-kiln-title"><small>{text(locale, "CENTRAL FIRING BOARD", "共窑板")}</small><strong id="kiln-mock-kiln-title">{text(locale, "Shared Kiln", "共窑")}</strong></div>
      <div className="kiln-mock-kiln-zones">
        {(["high", "middle", "low"] as const).map((zone) => {
          const slots = zone === "high" ? KILN_CERAMICS.slice(0, 3) : zone === "middle" ? KILN_CERAMICS.slice(3, 5) : KILN_CERAMICS.slice(5, 7);
          const modifier = zone === "high" ? 1 : zone === "low" ? -1 : 0;
          return (
            <div className={`kiln-mock-kiln-zone is-${zone}`} key={zone}>
              <span><b>{locale === "zh-CN" ? zoneZh(zone) : zone}</b><i>{modifier > 0 ? `+${modifier}` : modifier}</i></span>
              <div>{slots.map((ceramic, index) => ceramic === null
                ? <i className="kiln-mock-empty-slot" aria-label={text(locale, "Empty kiln space", "空窑位")} key={index} />
                : <Ceramic ceramic={ceramic} locale={locale} compact kilnZone={zone} kilnZoneModifier={modifier} inspectable key={ceramic.id} />)}</div>
            </div>
          );
        })}
      </div>
      <footer><span>{text(locale, "Next firing after all players pass", "所有玩家跳过后烧成")}</span><strong>{text(locale, `${occupiedSpaces} / 7 occupied`, `已占 ${occupiedSpaces} / 7`)}</strong></footer>
    </section>
  );
}

function FiringDeck({ locale }: { locale: "en" | "zh-CN" }) {
  return (
    <section className="kiln-mock-firing-deck" aria-label={text(locale, `Fire deck, ${FIRE_DECK_REMAINING} remaining, and latest result`, `窑火牌库，剩余${FIRE_DECK_REMAINING}张，以及最近结果`)}>
      <div className="kiln-mock-fire-card"><span aria-hidden="true">火</span><small>{FIRE_DECK_REMAINING}</small></div>
      <div><small>{text(locale, "LAST FIRING", "上次烧成")}</small><strong>2 + 1 = 3</strong><p>{text(locale, "Global Heat", "全窑火候")}</p></div>
    </section>
  );
}

function ImperialTrack({ locale }: { locale: "en" | "zh-CN" }) {
  return (
    <section className="kiln-mock-imperial-track" aria-label={text(locale, "Imperial Recognition track", "御府声望轨")}>
      <div className="kiln-mock-track-heading"><span aria-hidden="true">御</span><div><small>{text(locale, "IMPERIAL RECOGNITION", "御府声望")}</small><strong>{text(locale, "Court recognition and rewards", "宫廷认可与奖赏")}</strong></div></div>
      <ol>
        {IMPERIAL_PROGRESS.track.map((space) => (
          <li key={space.space}>
            <span className="kiln-mock-track-number">{space.space}</span>
            <div><strong>{locale === "zh-CN" ? space.titleZh : space.title}</strong><small>{locale === "zh-CN" ? space.rewardZh ?? "—" : space.reward ?? "—"}</small></div>
            <span className="kiln-mock-track-markers">
              {PLAYERS.filter((player) => player.recognition === space.space).map((player) => (
                <i className={`kiln-mock-accent-${player.accent}`} title={locale === "zh-CN" ? player.nameZh : player.name} key={player.id}>{locale === "zh-CN" ? player.nameZh.slice(0, 1) : player.name.slice(0, 1)}</i>
              ))}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function TechniqueMarket({ locale, onInspect }: { locale: "en" | "zh-CN"; onInspect: (id: string) => void }) {
  return (
    <aside className="kiln-mock-tech-market" aria-labelledby="kiln-mock-tech-title">
      <div className="kiln-mock-section-title">
        <span aria-hidden="true">艺</span>
        <div><small>{text(locale, "GUILD & ACADEMY", "陶工行")}</small><strong id="kiln-mock-tech-title">{text(locale, "Face-up Techs", "公开进阶技艺")}</strong></div>
      </div>
      {(["forming", "glazing", "firing"] as TechniqueDiscipline[]).map((discipline) => (
        <section className={`kiln-mock-tech-discipline is-${discipline}`} key={discipline}>
          <header><strong>{locale === "zh-CN" ? disciplineZh(discipline) : titleCase(discipline)}</strong><small>{text(locale, "deck", "牌库")} · {TECH_DECK_REMAINING[discipline]}</small></header>
          <div>{FACE_UP_TECHNIQUES[discipline].map((id) => <TechniqueTile id={id} locale={locale} onInspect={onInspect} key={id} />)}</div>
        </section>
      ))}
    </aside>
  );
}

function TechniqueTile({ id, locale, compact = false, exhausted = false, onInspect }: {
  id: string;
  locale: "en" | "zh-CN";
  compact?: boolean;
  exhausted?: boolean;
  onInspect: (id: string) => void;
}) {
  const technique = TECHNIQUE_DEFINITIONS[id];
  if (technique === undefined) return null;
  return (
    <button
      className={`kiln-mock-tech-tile is-${technique.discipline} ${compact ? "is-compact" : ""} ${exhausted ? "is-exhausted" : ""}`}
      type="button"
      onClick={() => onInspect(id)}
      aria-label={text(locale, `Inspect ${technique.name}`, `查看${technique.nameZh}`)}
    >
      <header><span>{id}</span><b>{technique.cost} ◉</b></header>
      <strong>{locale === "zh-CN" ? technique.nameZh : technique.name}</strong>
      {!compact && <p>{locale === "zh-CN" ? technique.abilityZh : technique.ability}</p>}
      <footer>{technique.oncePerRound ? text(locale, "Once / round", "每轮一次") : text(locale, "Continuous", "持续生效")}</footer>
      {exhausted && <i>{text(locale, "Used", "已用")}</i>}
    </button>
  );
}

function OwnWorkshop({ locale, selectedWorker, onChooseWorker, onInspectOrder, onInspectTechnique }: {
  locale: "en" | "zh-CN";
  selectedWorker: WorkerKind | null;
  onChooseWorker: (kind: WorkerKind) => void;
  onInspectOrder: (id: string) => void;
  onInspectTechnique: (id: string) => void;
}) {
  const kiln = KILN_DEFINITIONS.RU;
  return (
    <section className="kiln-mock-workshop" aria-labelledby="kiln-mock-workshop-title">
      <header>
        <div className="kiln-mock-workshop-name"><span aria-hidden="true">汝</span><div><small>{text(locale, "YOUR WORKSHOP", "你的作坊")}</small><strong id="kiln-mock-workshop-title">{locale === "zh-CN" ? kiln.nameZh : kiln.name}</strong><p><b>{locale === "zh-CN" ? kiln.abilityNameZh : kiln.abilityName}</b> · {locale === "zh-CN" ? kiln.abilityZh : kiln.ability}</p></div></div>
        <div className="kiln-mock-resource-bank">
          <Resource glyph="泥" label={text(locale, "Clay", "泥")} value={4} />
          <Resource glyph="柴" label={text(locale, "Wood", "柴")} value={3} />
          <Resource glyph="宋" label={text(locale, "Coins", "铜钱")} value={6} />
          <Resource glyph="分" label={text(locale, "VP", "分数")} value={18} />
        </div>
        <ImperialStatus player={PLAYERS[0]!} locale={locale} compact />
      </header>
      <div className="kiln-mock-workshop-zones">
        <section className="kiln-mock-worker-supply">
          <h3>{text(locale, "Available workers", "可用工人")}</h3>
          <div>
            <button type="button" aria-pressed={selectedWorker === "shifu"} className={selectedWorker === "shifu" ? "is-selected" : ""} onClick={() => onChooseWorker("shifu")}><WorkerToken kind="shifu" playerId="P1" /><span>{text(locale, "Shifu", "师傅")}</span></button>
            <button type="button" aria-pressed={selectedWorker === "apprentice"} className={selectedWorker === "apprentice" ? "is-selected" : ""} onClick={() => onChooseWorker("apprentice")}><WorkerToken kind="apprentice" playerId="P1" /><span>{text(locale, "Apprentice", "学徒")}</span></button>
          </div>
          <small>{text(locale, "2 workers remain · Pass is permanent for the round", "剩余2名工人 · 本轮跳过后不可返回")}</small>
        </section>
        <section className="kiln-mock-ceramic-shelf">
          <h3>{text(locale, "Ceramics", "陶瓷")}</h3>
          <div>{WORKSHOP_CERAMICS.map((ceramic) => <Ceramic ceramic={ceramic} locale={locale} inspectable key={ceramic.id} />)}</div>
        </section>
        <section className="kiln-mock-own-orders">
          <h3>{text(locale, "Your Orders", "你的委托")} <span>2 / 3</span></h3>
          <div>{PLAYERS[0]!.orderIds.map((id) => <OrderCard id={id} locale={locale} compact onInspect={onInspectOrder} key={id} />)}</div>
        </section>
        <section className="kiln-mock-own-techs">
          <h3>{text(locale, "Your Techs", "你的技艺")} <span>{text(locale, "1 Starting · 2 / 2 Advanced", "1起始 · 2 / 2进阶")}</span></h3>
          <div>
            <StartingTechniqueTile id="ST01" locale={locale} compact />
            <TechniqueTile id="T02" locale={locale} compact onInspect={onInspectTechnique} />
            <TechniqueTile id="T11" locale={locale} compact onInspect={onInspectTechnique} />
          </div>
        </section>
      </div>
    </section>
  );
}

function WorkerToken({ kind, playerId, small = false, ariaLabel }: { kind: WorkerKind; playerId: string; small?: boolean; ariaLabel?: string }) {
  const player = PLAYERS.find((candidate) => candidate.id === playerId) ?? PLAYERS[0]!;
  return (
    <span
      className={`kiln-mock-worker kiln-mock-accent-${player.accent} is-${kind} ${small ? "is-small" : ""}`}
      data-player-id={player.id}
      data-worker-kind={kind}
      aria-hidden={ariaLabel === undefined ? true : undefined}
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      <svg viewBox="0 0 44 54" aria-hidden="true" focusable="false">
        {kind === "shifu" ? (
          <>
            <path className="kiln-mock-worker-hat" d="M15 5h14l3 5H12zM9 10h26l-2 4H11z" />
            <circle className="kiln-mock-worker-piece" cx="22" cy="18" r="6" />
            <path className="kiln-mock-worker-piece" d="M14 25q8-5 16 0l10 7-5 7-5-4 3 16H11l3-16-5 4-5-7z" />
            <path className="kiln-mock-worker-detail" d="M12 40h20" />
          </>
        ) : (
          <>
            <circle className="kiln-mock-worker-piece" cx="22" cy="13" r="6" />
            <path className="kiln-mock-worker-piece" d="M16 21q6-4 12 0l4 28H12z" />
          </>
        )}
        <text className="kiln-mock-worker-role" x="22" y={kind === "shifu" ? "42" : "37"}>{kind === "shifu" ? "S" : "A"}</text>
      </svg>
      <b aria-hidden="true">{player.id}</b>
    </span>
  );
}

function Resource({ glyph, label, value }: { glyph: string; label: string; value: number }) {
  return <span className="kiln-mock-resource"><i aria-hidden="true">{glyph}</i><b>{value}</b><small>{label}</small></span>;
}

function Ceramic({ ceramic, locale, compact = false, inspectable = false, kilnZone, kilnZoneModifier }: {
  ceramic: MockCeramic;
  locale: "en" | "zh-CN";
  compact?: boolean;
  inspectable?: boolean;
  kilnZone?: "high" | "middle" | "low";
  kilnZoneModifier?: number;
}) {
  const player = PLAYERS.find((candidate) => candidate.id === ceramic.ownerId) ?? PLAYERS[0]!;
  const ownerName = locale === "zh-CN" ? player.nameZh : player.name;
  const shape = shapeLabel(ceramic.shape, locale);
  const glaze = ceramic.glaze === undefined ? null : glazeLabel(ceramic.glaze, locale);
  const decoration = ceramic.decoration === undefined ? null : decorationLabel(ceramic.decoration, locale);
  const heat = ceramic.glaze === undefined ? null : preferredHeat(ceramic.glaze);
  const stage = stageLabel(ceramic.stage, locale);
  const glazeDisplay = glaze ?? text(locale, "Not yet glazed", "尚未施釉");
  const decorationDisplay = decoration ?? text(locale, "Not yet decorated", "尚未装饰");
  const zone = kilnZone === undefined
    ? null
    : text(locale, `${kilnZone[0]!.toUpperCase()}${kilnZone.slice(1)} zone`, `${zoneZh(kilnZone)}温区`);
  const signedZoneModifier = kilnZoneModifier === undefined ? null : kilnZoneModifier > 0 ? `+${kilnZoneModifier}` : `${kilnZoneModifier}`;
  const ceramicAttributes = [
    ownerName,
    shape,
    stageLabel(ceramic.stage, locale),
    glaze,
    decoration,
    heat === null ? null : text(locale, `Preferred Heat ${heat}`, `适烧火候${heat}`),
    zone === null ? null : `${zone}${signedZoneModifier === null ? "" : ` ${signedZoneModifier}`}`,
    ceramic.quality === undefined ? null : qualityLabel(ceramic.quality, locale),
    ceramic.shifuMarkedBy === undefined ? null : text(locale, "Shifu-marked", "师傅标记"),
  ].filter((attribute): attribute is string => attribute !== null);
  const ceramicClassName = `kiln-mock-ceramic glaze-${ceramic.glaze ?? "raw"} decoration-${ceramic.decoration ?? "none"} shape-${ceramic.shape} kiln-mock-accent-${player.accent} ${compact ? "is-compact" : ""} ${inspectable ? "is-inspectable" : ""}`;
  const visual = (
    <>
      <svg viewBox="0 0 80 72" aria-hidden="true">
        {ceramic.shape === "bowl" && <path d="M8 22h64c-3 26-14 38-32 38S11 48 8 22zM18 64h44" />}
        {ceramic.shape === "plate" && <path d="M7 35c10 22 56 22 66 0M13 35h54M25 55h30" />}
        {ceramic.shape === "washer" && <path d="M12 28h56l-7 30H19zM27 62h26M25 25c0-10 30-10 30 0" />}
        {ceramic.shape === "vase" && <path d="M29 8h22l-3 13c15 9 19 34 5 42H27c-14-8-10-33 5-42zM29 9h22" />}
        {ceramic.shape === "censer" && <path d="M18 27h44l-5 29H23zM29 17h22l5 10H24zM19 59l-5 7M61 59l5 7M36 12c-3-5 2-7 0-11M46 12c-3-5 2-7 0-11" />}
        {ceramic.decoration === "carved" && (
          <g className="kiln-mock-decoration-pattern is-carved">
            <path d="M31 33q9 6 18 0M29 40q11 7 22 0M31 47q9 6 18 0" />
          </g>
        )}
        {ceramic.decoration === "impressed" && (
          <g className="kiln-mock-decoration-pattern is-impressed">
            <circle cx="34" cy="36" r="2.2" /><circle cx="43" cy="36" r="2.2" /><circle cx="38.5" cy="44" r="2.2" /><circle cx="47.5" cy="44" r="2.2" />
          </g>
        )}
        {ceramic.decoration === "crackle" && (
          <g className="kiln-mock-decoration-pattern is-crackle">
            <path d="M40 29l-3 8 4 5-5 9M37 37l-7-4-4 3M41 42l7-6 6 2M39 46l7 5" />
          </g>
        )}
      </svg>
      {ceramic.quality !== undefined && <b className={`kiln-mock-quality-badge is-${ceramic.quality}`} title={qualityLabel(ceramic.quality, locale)}>{qualityLabel(ceramic.quality, locale)}</b>}
      {ceramic.shifuMarkedBy !== undefined && <em className="kiln-mock-shifu-marker" title={text(locale, "Kiln Yard Shifu committed to this ceramic", "窑坊师傅已标记此陶瓷")}>{text(locale, "S", "师")}</em>}
      {inspectable && (
        <span className="kiln-mock-ceramic-tooltip" id={`kiln-mock-ceramic-tooltip-${ceramic.id}`} role="tooltip">
          <span className="kiln-mock-ceramic-tooltip-owner">
            <i aria-hidden="true">{player.id}</i>
            <span><small>{text(locale, "BELONGS TO", "所属玩家")}</small><strong>{ownerName}</strong></span>
          </span>
          <span className="kiln-mock-ceramic-tooltip-title"><strong>{shape}</strong><small>{ceramic.id} · {stage}{zone === null ? "" : ` · ${zone}${signedZoneModifier === null ? "" : ` ${signedZoneModifier}`}`}</small></span>
          <span className="kiln-mock-ceramic-tooltip-facts">
            <span><small>{text(locale, "Glaze", "釉色")}</small><strong>{glazeDisplay}</strong></span>
            <span><small>{text(locale, "Decoration", "装饰")}</small><strong>{decorationDisplay}</strong></span>
            <span><small>{text(locale, "Preferred Heat", "适烧火候")}</small><strong>{heat ?? "—"}</strong></span>
          </span>
          {ceramic.quality !== undefined && <span className="kiln-mock-ceramic-tooltip-note is-quality">{text(locale, "Quality", "品质")} · {qualityLabel(ceramic.quality, locale)}</span>}
          {ceramic.shifuMarkedBy !== undefined && <span className="kiln-mock-ceramic-tooltip-note">{text(locale, "Shifu reposition marker attached", "已附师傅调位标记")}</span>}
        </span>
      )}
    </>
  );

  if (inspectable) {
    return (
      <button
        className={ceramicClassName}
        type="button"
        data-decoration={ceramic.decoration}
        data-glaze={ceramic.glaze}
        data-shape={ceramic.shape}
        aria-label={text(locale, `Inspect ${ownerName}'s ${shape}`, `查看${ownerName}的${shape}`)}
        aria-describedby={`kiln-mock-ceramic-tooltip-${ceramic.id}`}
      >
        {visual}
      </button>
    );
  }

  return (
    <span className={ceramicClassName} data-decoration={ceramic.decoration} data-glaze={ceramic.glaze} data-shape={ceramic.shape} aria-label={ceramicAttributes.join(" · ")}>
      {visual}
    </span>
  );
}

function Inspector({ inspection, locale, onClose }: { inspection: Exclude<Inspection, null>; locale: "en" | "zh-CN"; onClose: () => void }) {
  const player = inspection.type === "player" ? PLAYERS.find((candidate) => candidate.id === inspection.id) : undefined;
  const order = inspection.type === "order" ? ORDER_DEFINITIONS[inspection.id] : undefined;
  const technique = inspection.type === "technique" ? TECHNIQUE_DEFINITIONS[inspection.id] : undefined;
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    return () => returnFocusRef.current?.focus();
  }, []);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLElement>): void {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
      "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
    ));
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }
    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="kiln-mock-inspector-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="kiln-mock-inspector" role="dialog" aria-modal="true" aria-label={text(locale, "Inspection panel", "查看面板")} onKeyDown={handleKeyDown}>
        <header>
          <div><small>{text(locale, "TABLE INSPECTOR", "桌面查看")}</small><strong>{player !== undefined
            ? locale === "zh-CN" ? `${player.nameZh}的作坊` : `${player.name}'s workshop`
            : order !== undefined ? text(locale, `Order ${order.id}`, `委托 ${order.id}`)
              : technique !== undefined ? locale === "zh-CN" ? technique.nameZh : technique.name
                : text(locale, "Game log", "游戏记录")}</strong></div>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label={text(locale, "Close inspector", "关闭查看面板")}>×</button>
        </header>
        {player !== undefined && <PlayerInspection player={player} locale={locale} />}
        {order !== undefined && <OrderInspection id={order.id} locale={locale} />}
        {technique !== undefined && <TechniqueInspection id={technique.id} locale={locale} />}
        {inspection.type === "log" && <LogInspection locale={locale} />}
      </aside>
    </div>
  );
}

function PlayerInspection({ player, locale }: { player: MockPlayer; locale: "en" | "zh-CN" }) {
  const kiln = KILN_DEFINITIONS[player.kilnId];
  return (
    <div className="kiln-mock-inspector-content">
      <section className={`kiln-mock-inspector-player kiln-mock-accent-${player.accent}`}>
        <span>{locale === "zh-CN" ? player.nameZh.slice(0, 1) : player.name.slice(0, 1)}</span>
        <div><strong>{locale === "zh-CN" ? kiln.nameZh : kiln.name}</strong><small>{locale === "zh-CN" ? kiln.abilityNameZh : kiln.abilityName}</small></div>
        <b>{player.vp} {text(locale, "VP", "分")}</b>
      </section>
      <p className="kiln-mock-ability-copy">{locale === "zh-CN" ? kiln.abilityZh : kiln.ability}</p>
      <section className="kiln-mock-inspector-resources">
        <Resource glyph="泥" label={text(locale, "Clay", "泥")} value={player.clay} />
        <Resource glyph="柴" label={text(locale, "Wood", "柴")} value={player.wood} />
        <Resource glyph="宋" label={text(locale, "Coins", "铜钱")} value={player.coins} />
        <Resource glyph="御" label={text(locale, "Recognition", "御府声望")} value={player.recognition} />
      </section>
      <ImperialStatus player={player} locale={locale} />
      <section className="kiln-mock-inspector-section">
        <h3>{text(locale, "Held Orders", "持有委托")} <span>{player.orderIds.length} / 3</span></h3>
        <div className="kiln-mock-inspector-orders">{player.orderIds.map((id) => <StaticOrderCard id={id} locale={locale} key={id} />)}</div>
      </section>
      <section className="kiln-mock-inspector-section">
        <h3>{text(locale, "Techs", "技艺")} <span>{text(locale, `1 Starting · ${player.techniqueIds.length} / 2 Advanced`, `1起始 · ${player.techniqueIds.length} / 2进阶`)}</span></h3>
        <div className="kiln-mock-inspector-techs">
          <StartingTechniqueTile id={player.startingTechniqueId} locale={locale} />
          {player.techniqueIds.map((id) => <StaticTechniqueTile id={id} locale={locale} key={id} />)}
        </div>
      </section>
    </div>
  );
}

function OrderInspection({ id, locale }: { id: string; locale: "en" | "zh-CN" }) {
  const order = ORDER_DEFINITIONS[id]!;
  return (
    <div className="kiln-mock-inspector-content kiln-mock-detail-view">
      <StaticOrderCard id={id} locale={locale} />
      <dl>
        <div><dt>{text(locale, "Ceramics", "陶瓷")}</dt><dd>{order.ceramics.length}</dd></div>
        <div><dt>{text(locale, "Minimum Quality", "最低品质")}</dt><dd>{qualityLabel(order.minQuality, locale)}</dd></div>
        <div><dt>{text(locale, "Reward", "奖励")}</dt><dd>{order.vp} {text(locale, "VP", "分")} · {order.coins} {text(locale, "Coins", "铜钱")} {order.crowns > 0 ? `· ${order.crowns} ♛` : ""}</dd></div>
      </dl>
      <p>{text(locale, "Each ceramic must independently match the attributes printed for its requirement.", "每件陶瓷都必须分别符合其对应条件中列出的全部属性。")}</p>
    </div>
  );
}

function TechniqueInspection({ id, locale }: { id: string; locale: "en" | "zh-CN" }) {
  const technique = TECHNIQUE_DEFINITIONS[id]!;
  return (
    <div className="kiln-mock-inspector-content kiln-mock-detail-view">
      <StaticTechniqueTile id={id} locale={locale} />
      <dl>
        <div><dt>{text(locale, "Discipline", "类别")}</dt><dd>{locale === "zh-CN" ? disciplineZh(technique.discipline) : titleCase(technique.discipline)}</dd></div>
        <div><dt>{text(locale, "Printed cost", "牌面费用")}</dt><dd>{technique.cost} {text(locale, "Coins", "铜钱")}</dd></div>
        <div><dt>{text(locale, "Timing", "时机")}</dt><dd>{technique.oncePerRound ? text(locale, "Once per round", "每轮一次") : text(locale, "Continuous", "持续生效")}</dd></div>
      </dl>
    </div>
  );
}

function LogInspection({ locale }: { locale: "en" | "zh-CN" }) {
  const events = locale === "zh-CN"
    ? ["陆远将1件陶瓷装入共窑。", "乔承接了主委托 O18，并获得1柴。", "梅将2件陶瓷装入共窑。", "博取得进阶技艺 T14 复烧。"]
    : ["Luyuan loaded 1 ceramic into the Shared Kiln.", "Qiao reserved Main Order O18 and gained 1 Wood.", "Mei loaded 2 ceramics into the Shared Kiln.", "Bo acquired Advanced Tech T14 Second Firing."];
  return (
    <ol className="kiln-mock-log">
      {events.map((event, index) => <li key={event}><span>#{38 - index}</span><p>{event}</p><small>{index * 18 + 4}s</small></li>)}
    </ol>
  );
}

function StaticOrderCard({ id, locale }: { id: string; locale: "en" | "zh-CN" }) {
  const order = ORDER_DEFINITIONS[id]!;
  return (
    <article className={`kiln-mock-order-card kiln-mock-static-order ${order.crowns > 0 ? "is-crown" : ""}`}>
      <header><b>{id}</b><span>{"♛".repeat(order.crowns)}</span></header>
      <div className="kiln-mock-order-seal" aria-hidden="true">{order.ceramics.length}</div>
      <p>{locale === "zh-CN" ? order.requirementsZh : order.requirements}</p>
      <footer><span><small>{text(locale, "MIN", "最低")}</small><b>{qualityLabel(order.minQuality, locale)}</b></span><span><small>{text(locale, "VP", "分")}</small><b>{order.vp}</b></span><span><small>{text(locale, "COIN", "钱")}</small><b>{order.coins}</b></span></footer>
    </article>
  );
}

function StaticTechniqueTile({ id, locale }: { id: string; locale: "en" | "zh-CN" }) {
  const technique = TECHNIQUE_DEFINITIONS[id]!;
  return (
    <article className={`kiln-mock-tech-tile kiln-mock-static-tech is-${technique.discipline}`}>
      <header><span>{id}</span><b>{technique.cost} ◉</b></header>
      <strong>{locale === "zh-CN" ? technique.nameZh : technique.name}</strong>
      <p>{locale === "zh-CN" ? technique.abilityZh : technique.ability}</p>
      <footer>{technique.oncePerRound ? text(locale, "Once / round", "每轮一次") : text(locale, "Continuous", "持续生效")}</footer>
    </article>
  );
}

function StartingTechniqueTile({ id, locale, compact = false }: { id: StartingTechniqueId; locale: "en" | "zh-CN"; compact?: boolean }) {
  const technique = STARTING_TECHNIQUE_DEFINITIONS[id];
  return (
    <article className={`kiln-mock-starting-tech ${compact ? "is-compact" : ""}`}>
      <header><span>{id}</span><small>{text(locale, "Starting Tech", "起始技艺")}</small></header>
      <strong>{locale === "zh-CN" ? technique.nameZh : technique.name}</strong>
      <p>{locale === "zh-CN" ? technique.abilityZh : technique.ability}</p>
      <footer>{text(locale, "Workshop foundation", "作坊基础")}</footer>
    </article>
  );
}

function ImperialStatus({ player, locale, compact = false }: { player: MockPlayer; locale: "en" | "zh-CN"; compact?: boolean }) {
  const priorityStatus = player.imperialPriorityAvailable
    ? text(locale, "Available", "可用")
    : player.recognition >= 3
      ? text(locale, "Spent", "已使用")
      : text(locale, "Locked", "未解锁");
  return (
    <section className={`kiln-mock-imperial-status ${compact ? "is-compact" : ""}`} aria-label={text(locale, "Imperial rewards", "御府奖赏")}>
      <span><i aria-hidden="true">御</i><span><strong>{text(locale, "Imperial Kiln", "御窑")}</strong><small>{player.imperialKilnUnlocked ? text(locale, "Unlocked · Empty", "已解锁 · 空置") : text(locale, "Locked", "未解锁")}</small></span></span>
      <span><i aria-hidden="true">令</i><span><strong>{text(locale, "Imperial Priority", "御烧优先")}</strong><small>{priorityStatus}</small></span></span>
    </section>
  );
}

function titleCase(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1);
}

function disciplineZh(value: TechniqueDiscipline): string {
  return value === "forming" ? "成型" : value === "glazing" ? "施釉" : "烧成";
}

function zoneZh(value: "high" | "middle" | "low"): string {
  return value === "high" ? "高温区" : value === "middle" ? "中温区" : "低温区";
}

function qualityZh(value: Quality): string {
  return value === "flawed" ? "瑕品" : value === "standard" ? "良品" : value === "fine" ? "上品" : "臻品";
}

function qualityLabel(value: Quality, locale: "en" | "zh-CN"): string {
  return locale === "zh-CN" ? qualityZh(value) : titleCase(value);
}

function shapeLabel(value: Shape, locale: "en" | "zh-CN"): string {
  if (locale === "zh-CN") return value === "bowl" ? "碗" : value === "plate" ? "盘" : value === "washer" ? "笔洗" : value === "vase" ? "瓶" : "香炉";
  return value === "washer" ? "Brush Washer" : titleCase(value);
}

function glazeLabel(value: Glaze, locale: "en" | "zh-CN"): string {
  if (locale === "zh-CN") return value === "white" ? "白釉" : value === "celadon" ? "青釉" : value === "grey_green" ? "灰青釉" : "月白釉";
  return value === "grey_green" ? "Grey-Green" : value === "moon_white" ? "Moon White" : titleCase(value);
}

function decorationLabel(value: Decoration, locale: "en" | "zh-CN"): string {
  if (locale === "zh-CN") return value === "plain" ? "素面" : value === "carved" ? "刻花" : value === "impressed" ? "印花" : "开片";
  return titleCase(value);
}

function stageLabel(value: MockCeramic["stage"], locale: "en" | "zh-CN"): string {
  if (locale === "zh-CN") return value === "shaped" ? "已成型" : value === "glazed" ? "已施釉" : value === "loaded" ? "已装窑" : "已烧成";
  return titleCase(value);
}
