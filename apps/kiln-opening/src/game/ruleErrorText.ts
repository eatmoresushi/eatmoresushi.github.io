/**
 * Localised rule-error text (DESIGN §6.10, package P1).
 *
 * The engine returns typed `GameRuleError`s whose `message` is English for logs only. Every
 * player-facing rendering goes through this table: `RULE_ERROR_TEXT[code]` holds an English and
 * a Simplified Chinese template plus the documented `details` keys for that code.
 *
 * - **Templates interpolate `details` by key**: `{locationId}` is replaced by the rendered value
 *   of `details.locationId`. IDs are rendered as localised names (`detailLabel`), so a template
 *   never repeats a rule value that lives in `data/`.
 * - **`detailKeys`** lists every key an emitter may put in `details` for that code (the fuzz
 *   loop checks emitted keys against it, DESIGN §6.10). `COMMON_DETAIL_KEYS` are allowed on
 *   every code. A template may use only keys from its own list.
 * - **Fallbacks**: when a template's placeholder has no value, the next template in `fallbacks`
 *   whose placeholders are all available is used; failing that, a neutral word fills the gap.
 * - Chinese follows `docs/GLOSSARY_ZH_V1.6.1.md` §7 (result first, then the cause; no
 *   exclamation marks; never mentions hidden information).
 * - No player-facing text says lock/unlock (owner decision D7): a second personal space is one
 *   you *add* by learning a Tech. Internal identifiers such as `PERSONAL_SPACE_LOCKED` keep
 *   their names.
 *
 * Layer 2: imports `content.ts` for names.
 */
import { CONTRIBUTION_CARD_IDS, KILN_SPACE_IDS, KILNS, LOCATIONS, TECHS, contributionCard, zoneOf } from "./content.ts";
import type {
  ContributionCardId,
  Decoration,
  GamePhaseType,
  GameRuleError,
  GameRuleErrorCode,
  Glaze,
  KilnId,
  KilnSpaceId,
  KilnZone,
  LocationId,
  Quality,
  ResourceKind,
  Shape,
  TechDiscipline,
  TechId,
  WorkerKind,
} from "./types.ts";

export type RuleTextLocale = "en" | "zh";

export interface RuleErrorTemplate {
  en: string;
  zh: string;
}

export interface RuleErrorTextEntry extends RuleErrorTemplate {
  /** Every `details` key an emitter may use for this code (COMMON_DETAIL_KEYS included). */
  detailKeys: string[];
  /** Tried in order when the main template has a placeholder without a value. */
  fallbacks?: RuleErrorTemplate[];
}

/** Keys any rule error may carry. */
export const COMMON_DETAIL_KEYS: readonly string[] = Object.freeze([
  "field",
  "reason",
  "actionType",
  "playerId",
  "phase",
  "step",
]);

function keys(...specific: string[]): string[] {
  return [...COMMON_DETAIL_KEYS, ...specific];
}

/**
 * EN/ZH templates per code. ZH sentences are the glossary §7 sentences with each glossary
 * placeholder (`{location}`, `{n}`, `{name}`, …) replaced by the `details` key that carries it.
 */
export const RULE_ERROR_TEXT: Readonly<Record<GameRuleErrorCode, RuleErrorTextEntry>> = {
  // ── General ────────────────────────────────────────────────────────────────────────────
  INVALID_SETUP: {
    en: "This game cannot be set up: {reason}.",
    zh: "无法开局：{reason}",
    detailKeys: keys("playerCount", "minPlayers", "maxPlayers", "kilnId", "seatIndex"),
    fallbacks: [{ en: "This game cannot be set up.", zh: "无法开局" }],
  },
  MALFORMED_ACTION: {
    en: "That choice is not available.",
    zh: "此选项不可用",
    detailKeys: keys("value", "expected"),
  },
  UNKNOWN_PLAYER: {
    en: "That player is not seated in this game.",
    zh: "此玩家不在本局中",
    detailKeys: keys(),
  },
  WRONG_PHASE: {
    en: "It is not {expectedPhase} now, so you cannot do that.",
    zh: "现在不是{expectedPhase}，不能这样做",
    detailKeys: keys("expectedPhase"),
  },
  NOT_YOUR_DECISION: {
    en: "It is not your turn yet; waiting for {waitingFor}.",
    zh: "尚未轮到你，请等候{waitingFor}",
    detailKeys: keys("waitingFor"),
  },
  GAME_FINISHED: {
    en: "This game has finished.",
    zh: "本局已结束",
    detailKeys: keys(),
  },
  STALE_CHOICE: {
    en: "The game has moved on; please choose again.",
    zh: "局面已更新，请重新选择",
    detailKeys: keys("expectedRevision", "revision", "windowId"),
  },
  INVALID_CHOICE: {
    en: "That choice is not available.",
    zh: "此选项不可用",
    detailKeys: keys("value", "choice", "effect", "workerId", "locationId", "techId", "orderId", "ceramicId", "slotIndex", "cardIndex"),
  },
  // ── Setup ──────────────────────────────────────────────────────────────────────────────
  KILN_UNAVAILABLE: {
    en: "That Kiln has already been chosen.",
    zh: "此窑口已被其他玩家选走",
    detailKeys: keys("kilnId"),
  },
  // ── Placement (L162–166) ──────────────────────────────────────────────────────────────
  WORKER_UNAVAILABLE: {
    en: "You have no {workerId} available.",
    zh: "你没有可派的{workerId}",
    detailKeys: keys("workerId", "workerKind"),
  },
  WORKER_ACTION_REQUIRED: {
    en: "You may not pass in the Work Phase: place 1 worker (the Canal Wharf is always available).",
    zh: "派工阶段不能跳过，请派1名工人（总是可以派往漕运码头）",
    detailKeys: keys(),
  },
  WORKER_ACTION_IN_PROGRESS: {
    // Rev. 5 L170: free actions and the Colour Samples swap come before or after the worker
    // action, not during it. `techId` is set only while the swap's own Select is open (step
    // `colour_samples_swap`), which is no worker action: it may be open before the worker is
    // placed. Every other sub-step is part of the worker action and has no `techId`.
    en: "Finish the {techId} Select first: this can be done before or after it, not during it.",
    zh: "先完成{techId}的精选：这一步只能在精选之前或之后进行，不能在中途进行",
    detailKeys: keys("techId"),
    fallbacks: [{
      en: "Finish your worker action first: this can be done before or after it, not during it.",
      zh: "先完成工人行动：这一步只能在工人行动之前或之后进行，不能在行动中途进行",
    }],
  },
  WORKER_ACTION_ALREADY_TAKEN: {
    en: "You have already placed a worker this turn.",
    zh: "本回合你已派过工",
    detailKeys: keys(),
  },
  LOCATION_FULL: {
    en: "{locationId} is full.",
    zh: "{locationId}已满",
    detailKeys: keys("locationId", "capacity"),
  },
  PERSONAL_SPACE_LOCKED: {
    en: "Learn a {discipline} Tech to add this space.",
    zh: "习得{discipline}技艺即添此工位",
    detailKeys: keys("locationId", "discipline", "spaceIndex"),
  },
  PERSONAL_SPACE_USED: {
    en: "This space has already been used this round.",
    zh: "此工位本轮已用",
    detailKeys: keys("locationId", "spaceIndex"),
  },
  NO_MAIN_ACTION_POSSIBLE: {
    en: "You cannot perform at least 1 instance of the main action at {locationId}, so you cannot place a worker there.",
    zh: "你无法在{locationId}执行至少1次主行动，不能派工",
    detailKeys: keys("locationId", "workerId", "effect"),
  },
  NOT_SHIFU_EFFECT: {
    en: "Only the Shifu effect allows that.",
    zh: "只有师傅效果可以这样做",
    detailKeys: keys("workerId", "effect", "locationId"),
  },
  SENIOR_APPRENTICE_NOT_APPLICABLE: {
    en: "Senior Apprentice applies only to an Apprentice at the Materials Yard or Commission Market.",
    zh: "高徒只适用于泥柴场或瓷牙行的学徒",
    detailKeys: keys("workerId", "locationId"),
  },
  // ── Resources and production ──────────────────────────────────────────────────────────
  INSUFFICIENT_RESOURCES: {
    en: "Not enough {resource}: you need {needed} and have {have}.",
    zh: "{resource}不足：需{needed}，现有{have}",
    detailKeys: keys("resource", "needed", "have", "clay", "wood", "coins"),
    fallbacks: [
      { en: "Not enough {resource}.", zh: "{resource}不足" },
      { en: "Not enough resources.", zh: "资源不足" },
    ],
  },
  INVALID_RESOURCE_SPLIT: {
    en: "That split is not allowed: gain exactly {total} Clay and Wood in total.",
    zh: "资源分配不符：必须恰好获得共{total}份泥和柴",
    detailKeys: keys("total", "clay", "wood"),
    fallbacks: [{ en: "That resource split is not allowed.", zh: "资源分配不符" }],
  },
  TOO_MANY_VESSELS: {
    en: "This action allows at most {limit} vessels.",
    zh: "此行动至多{limit}件",
    detailKeys: keys("limit", "count"),
    fallbacks: [{ en: "This action allows fewer vessels.", zh: "件数超出此行动的上限" }],
  },
  INVALID_VESSEL_CHOICE: {
    en: "That Shape or Decoration choice is not allowed.",
    zh: "此器型或纹饰选择不可用",
    detailKeys: keys("shape", "decoration", "index", "vesselIndex", "ceramicId"),
  },
  CERAMIC_NOT_FOUND: {
    en: "That ceramic does not exist or is not yours.",
    zh: "找不到这件器物，或它不属于你",
    detailKeys: keys("ceramicId"),
  },
  CERAMIC_NOT_OWNED: {
    en: "That ceramic does not exist or is not yours.",
    zh: "找不到这件器物，或它不属于你",
    detailKeys: keys("ceramicId", "ownerId"),
  },
  ILLEGAL_CERAMIC_STAGE: {
    en: "That ceramic is {stage} now and cannot be used this way.",
    zh: "这件器物现在是{stage}，不能这样使用",
    detailKeys: keys("ceramicId", "stage", "expectedStage"),
    fallbacks: [{ en: "That ceramic cannot be used this way now.", zh: "这件器物现在不能这样使用" }],
  },
  DUPLICATE_CERAMIC: {
    en: "The same ceramic cannot be chosen twice.",
    zh: "同一件器物不能重复选用",
    detailKeys: keys("ceramicId"),
  },
  // ── Loading (R5) ──────────────────────────────────────────────────────────────────────
  KILN_SPACE_UNAVAILABLE: {
    en: "{spaceId} is not available: it is covered or already holds a ceramic.",
    zh: "{spaceId}不可用：已被盖住或已有器物",
    detailKeys: keys("spaceId", "ceramicId"),
    fallbacks: [{
      en: "There is nowhere to load: no empty active Shared Kiln space, and your Imperial Kiln is unavailable.",
      zh: "没有可装窑的去处：共窑没有空的启用窑位，你的御窑也不可用",
    }],
  },
  KILN_SPACE_MARKED: {
    en: "{ownerId}'s Setter's Mark holds this space this round.",
    zh: "此窑位本轮已由{ownerId}的窑位签占用",
    detailKeys: keys("spaceId", "ownerId"),
  },
  IMPERIAL_KILN_UNAVAILABLE: {
    en: "You have no Imperial Kiln, or it already holds a ceramic this firing.",
    zh: "你还没有御窑，或御窑本次烧成已有器物",
    detailKeys: keys("ceramicId"),
  },
  INVERTED_FIRING_INVALID: {
    en: "Inverted Firing stacks only a Bowl, Plate or Brush Washer in an active space holding exactly 1 of your ceramics.",
    zh: "覆烧只能把碗、盘或笔洗叠放进恰好已有1件你的器物的启用窑位",
    detailKeys: keys("spaceId", "ceramicId", "shape"),
  },
  // ── Orders and market (B1) ────────────────────────────────────────────────────────────
  ORDER_NOT_AVAILABLE: {
    en: "That Order is no longer on the display.",
    zh: "这张委托已不在委托榜上",
    detailKeys: keys("orderId", "slotIndex"),
  },
  ORDER_NOT_HELD: {
    // Completion, the Cleanup trim and the Colour Samples swap (ENGINE_V1.6.2_DELTA.md §2.5).
    en: "That Order is not in your hand.",
    zh: "这张委托不在你手中",
    detailKeys: keys("orderId"),
  },
  ORDER_SUPPLY_EMPTY: {
    en: "No Main Order shows on the display and the Main Order deck and discard pile are both empty; there is nothing to reserve.",
    zh: "委托榜上没有主委托，主委托牌堆和弃牌堆也都空了，没有可承接的委托",
    detailKeys: keys(),
  },
  RESERVATION_REQUIRED: {
    en: "Reserve at least 1 Order.",
    zh: "至少要承接1张委托",
    detailKeys: keys(),
  },
  RESERVATION_LIMIT: {
    // Only a Select returns it (work/select.ts): the Commission Market's, or Colour Samples',
    // which is a Tech effect, not an action (v1.6.2 L656). `requested` is always 2 or more.
    en: "This Select reserves at most {limit}; you chose {requested} Orders.",
    zh: "这次精选至多承接{limit}张，你选了{requested}张",
    detailKeys: keys("limit", "requested"),
    fallbacks: [
      { en: "This Select reserves at most {limit}.", zh: "这次精选至多承接{limit}张" },
      { en: "This Select cannot reserve another Order.", zh: "这次精选不能再承接委托" },
    ],
  },
  ORDER_REQUIREMENTS_NOT_MET: {
    en: "The chosen ceramics do not meet Order {orderId}: {reason}.",
    zh: "所选器物不满足委托{orderId}的要求：{reason}",
    detailKeys: keys("orderId", "ceramicId", "slotIndex"),
    fallbacks: [
      { en: "The chosen ceramics do not meet Order {orderId}.", zh: "所选器物不满足委托{orderId}的要求" },
      { en: "The chosen ceramics do not meet that Order.", zh: "所选器物不满足该委托的要求" },
    ],
  },
  INVALID_CRACKLE_DECLARATION: {
    en: "That Crackle declaration is not valid: {reason}.",
    zh: "开片声明无效：{reason}",
    detailKeys: keys("ceramicId", "decoration", "orderId"),
    fallbacks: [{ en: "That Crackle declaration is not valid.", zh: "开片声明无效" }],
  },
  HAND_LIMIT_DISCARD_COUNT: {
    en: "At Cleanup, discard down to {limit} Orders: discard {needed} more.",
    zh: "收工时要把委托弃到{limit}张：请再弃{needed}张",
    detailKeys: keys("limit", "needed", "held", "given"),
    fallbacks: [{ en: "At Cleanup, discard down to your hand limit.", zh: "收工时要把委托弃到上限" }],
  },
  // ── Techs and abilities (R4) ──────────────────────────────────────────────────────────
  TECH_NOT_AVAILABLE: {
    en: "That Tech is not available to take.",
    zh: "这张技艺牌不能拿取",
    detailKeys: keys("techId", "discipline"),
  },
  TECH_LIMIT: {
    en: "You already own {maxOwned} Techs.",
    zh: "你已拥有{maxOwned}项技艺",
    detailKeys: keys("techId", "maxOwned"),
    fallbacks: [{ en: "You already own the most Techs allowed.", zh: "你拥有的技艺已达上限" }],
  },
  TECH_DISCIPLINE_OWNED: {
    en: "You already own a {discipline} Tech.",
    zh: "你已拥有一项{discipline}技艺",
    detailKeys: keys("techId", "discipline"),
  },
  TECH_TAKE_LIMIT: {
    en: "This action takes at most {limit} Techs.",
    zh: "此行动至多习得{limit}项技艺",
    detailKeys: keys("limit", "techId"),
    fallbacks: [{ en: "This action cannot take another Tech.", zh: "此行动不能再习得技艺" }],
  },
  TECH_TAKE_REQUIRED: {
    en: "Take at least 1 Tech.",
    zh: "至少要习得1项技艺",
    detailKeys: keys(),
  },
  TECH_NOT_OWNED: {
    en: "You do not own {techId}.",
    zh: "你没有{techId}",
    detailKeys: keys("techId"),
  },
  TECH_ALREADY_USED: {
    en: "{techId} has already been used this round.",
    zh: "{techId}本轮已用",
    detailKeys: keys("techId"),
  },
  TECH_MARKER_IN_KILN: {
    // P7: Kiln Master has one marker (rev. 5 L105); it returns when its ceramic's firing
    // finishes (L683), so it cannot go on another ceramic while one loaded in an earlier
    // Order Phase still waits in a kiln.
    en: "{techId}'s marker is still on a ceramic in a kiln; it returns when that firing finishes.",
    zh: "{techId}标还在窑中的器物上，要到那次烧窑开窑取器时才收回",
    detailKeys: keys("techId", "ceramicId"),
  },
  INVALID_BOTTOM_ORDER: {
    en: "Put every untaken inspected Tech on the bottom exactly once, in the order you choose.",
    zh: "请为每张没有拿的所看技艺牌排定置底顺序",
    detailKeys: keys("expected", "given", "techId"),
  },
  KILN_ABILITY_NOT_OWNED: {
    en: "You do not have {kilnId}.",
    zh: "你没有{kilnId}",
    detailKeys: keys("kilnId"),
  },
  ABILITY_ALREADY_USED: {
    en: "{kilnId} has already been used this round.",
    zh: "{kilnId}本轮已用",
    detailKeys: keys("kilnId"),
  },
  INVALID_TARGET: {
    en: "That target is not allowed: {reason}.",
    zh: "此目标不合法：{reason}",
    detailKeys: keys("ceramicId", "spaceId", "orderId", "slotIndex", "techId", "kilnId"),
    fallbacks: [{ en: "That target is not allowed.", zh: "此目标不合法" }],
  },
  // ── Recognition ───────────────────────────────────────────────────────────────────────
  RECOGNITION_GATE: {
    en: "The Magistrate's Hall is usable only at Recognition 0–2 and never advances you to 4.",
    zh: "州衙只能在声望0–2时使用，不能推进到声望4",
    detailKeys: keys("recognition"),
  },
  IMPERIAL_PRIORITY_UNAVAILABLE: {
    en: "You have no Imperial Priority token, your Imperial Kiln is not empty, or you have no Shaped vessel.",
    zh: "你没有御烧优先标，或御窑不空，或没有坯",
    detailKeys: keys("ceramicId"),
  },
  // ── Contributions (DESIGN §4.2) ───────────────────────────────────────────────────────
  NOT_CONTRIBUTOR: {
    en: "You have no ceramic in the Shared Kiln, so you do not contribute this round.",
    zh: "你在共窑中没有器物，本轮不参与控火",
    detailKeys: keys(),
  },
  CONTRIBUTION_ALREADY_SUBMITTED: {
    en: "You have already submitted your Contribution; waiting for the other workshops.",
    zh: "你已提交控火，等候其他作坊",
    detailKeys: keys(),
  },
  CONTRIBUTION_CARD_NOT_HELD: {
    en: "You do not hold that Contribution card; Fuel Ledger Bank and Fuel Ledger Stoke come with Fuel Ledger.",
    zh: "你没有这张控火牌；柴簿压火与柴簿添柴随柴簿一起获得",
    detailKeys: keys("card"),
  },
  INVALID_CONTRIBUTION: {
    en: "That Contribution is not allowed: {reason}.",
    zh: "此控火不合法：{reason}",
    detailKeys: keys("card", "needed", "have"),
    fallbacks: [{
      en: "Not enough Wood for that Contribution (Tend the Fire is always available).",
      zh: "柴不足，打不出这张控火牌（守火永远可选）",
    }],
  },
  PRIVATE_WINDOW_MISMATCH: {
    en: "That Contribution window has closed or changed; please submit again.",
    zh: "此控火时机已结束或已更新，请重新提交",
    detailKeys: keys("windowId", "expectedWindowId"),
  },
};

// ── Detail values → localised labels ────────────────────────────────────────────────────

type Labels<K extends string> = Readonly<Record<K, RuleErrorTemplate>>;

/** Glossary §2.3 resources. */
export const RESOURCE_TEXT: Labels<ResourceKind> = {
  clay: { en: "Clay", zh: "泥" },
  wood: { en: "Wood", zh: "柴" },
  coins: { en: "Coins", zh: "铜钱" },
};

/** Glossary §2.6. */
export const SHAPE_TEXT: Labels<Shape> = {
  bowl: { en: "Bowl", zh: "碗" },
  plate: { en: "Plate", zh: "盘" },
  washer: { en: "Brush Washer", zh: "笔洗" },
  vase: { en: "Vase", zh: "瓶" },
  censer: { en: "Censer", zh: "香炉" },
};

/** Glossary §2.8. */
export const GLAZE_TEXT: Labels<Glaze> = {
  white: { en: "White", zh: "白釉" },
  celadon: { en: "Celadon", zh: "青釉" },
  grey_green: { en: "Grey-Green", zh: "灰青釉" },
  moon_white: { en: "Moon White", zh: "月白釉" },
};

/** Glossary §2.7 (Painted is 画花, never 彩绘). */
export const DECORATION_TEXT: Labels<Decoration> = {
  plain: { en: "Plain", zh: "素面" },
  carved: { en: "Carved", zh: "刻花" },
  impressed: { en: "Impressed", zh: "印花" },
  painted: { en: "Painted", zh: "画花" },
};

/** Glossary §2.9. */
export const QUALITY_TEXT: Labels<Quality> = {
  flawed: { en: "Flawed", zh: "瑕品" },
  standard: { en: "Standard", zh: "良品" },
  fine: { en: "Fine", zh: "上品" },
  masterpiece: { en: "Masterpiece", zh: "臻品" },
};

/** Glossary §7 `{stage}`. */
export const STAGE_TEXT: Labels<"shaped" | "loaded" | "finished" | "delivered"> = {
  shaped: { en: "Shaped", zh: "坯" },
  loaded: { en: "Loaded", zh: "入窑" },
  finished: { en: "Finished", zh: "成器" },
  delivered: { en: "Delivered", zh: "已交付" },
};

/** Glossary §2.2. */
export const WORKER_TEXT: Labels<WorkerKind> = {
  shifu: { en: "Shifu", zh: "师傅" },
  apprentice: { en: "Apprentice", zh: "学徒" },
};

/** Glossary §2.15. */
export const DISCIPLINE_TEXT: Labels<TechDiscipline> = {
  workshop: { en: "Form & Decorate", zh: "坯作" },
  glazing_loading: { en: "Glazing & Loading", zh: "釉作" },
  firing: { en: "Firing", zh: "火作" },
};

/** Glossary §2.10. */
export const ZONE_TEXT: Labels<KilnZone> = {
  high: { en: "High", zh: "高温区" },
  middle: { en: "Middle", zh: "中温区" },
  low: { en: "Low", zh: "低温区" },
};

/** Phase and timing-window names (glossary §2.11, §1.4). */
export const PHASE_TEXT: Labels<GamePhaseType> = {
  setup_kiln_selection: { en: "Kiln and Main Order choice", zh: "选窑口和主委托" },
  round_start_setters_mark: { en: "the start of the Work Phase", zh: "派工阶段开始时" },
  work_turn: { en: "the Work Phase", zh: "派工阶段" },
  firing_contributions: { en: "Choose Contributions", zh: "暗选控火" },
  firing_test_pieces: { en: "Test Pieces", zh: "火照" },
  firing_heat_adjustment: { en: "Heat adjustment", zh: "调火" },
  firing_after_quality: { en: "after-Quality abilities", zh: "定品后结算" },
  firing_second_firing_choice: { en: "the Second Firing choice", zh: "复烧选牌" },
  orders: { en: "the Order Phase", zh: "交货阶段" },
  cleanup_hand_limit: { en: "Cleanup", zh: "收工" },
  finished: { en: "game end", zh: "终局" },
};

/** Glossary §7 `{reason}` phrases, keyed by the reason code an emitter puts in `details.reason`. */
export const REASON_TEXT: Readonly<Record<string, RuleErrorTemplate>> = {
  shape_mismatch: { en: "the Shape does not match", zh: "器型不符" },
  glaze_mismatch: { en: "the Glaze does not match", zh: "釉不符" },
  decoration_mismatch: { en: "the Decoration does not match", zh: "纹饰不符" },
  quality_too_low: { en: "the Quality is too low", zh: "品质不足" },
  masterpiece_required: { en: "a Masterpiece is required", zh: "需臻品" },
  already_delivered: { en: "the ceramic has been delivered", zh: "器物已交付" },
  flawed: { en: "a Flawed ceramic cannot complete an Order", zh: "瑕品不能完成委托" },
  not_this_firing: { en: "the ceramic is not in this firing", zh: "器物不在本次烧成中" },
  // After-Quality targets (L643, L646): Protective Saggars takes a Standard ceramic,
  // Second Firing a Flawed or Standard one. Ge takes any of its owner's ceramics of the firing
  // (rev. 5 L482, change 39), so it has no Quality reason.
  not_standard: { en: "the ceramic is not Standard", zh: "器物不是良品" },
  not_flawed_or_standard: { en: "the ceramic is not Flawed or Standard", zh: "器物不是瑕品或良品" },
  // Only a Finished Flawed ceramic can be sold (rev. 5 L172, L302).
  not_flawed: { en: "the ceramic is not Flawed", zh: "器物不是瑕品" },
  // The Magistrate's Hall Shifu reserves only a face-up Crown Order (L259).
  no_crown: { en: "the Order shows no Crown", zh: "委托上没有御令" },
  wrong_count: { en: "the number of ceramics does not match", zh: "器物件数不符" },
  relation_mismatch: { en: "the combined requirements are not met", zh: "组合要求不符" },
  crackle_not_selected: { en: "the declared ceramic is not one of those chosen", zh: "声明的器物不在所选器物中" },
  not_crackle: { en: "only Crackle ceramics may declare a Decoration", zh: "只有开片器可以声明纹饰" },
  crackle_declared_twice: { en: "a Crackle ceramic may be declared only once", zh: "同一件开片器只能声明一次" },
  declaration_does_not_satisfy: {
    en: "these declarations do not satisfy the Order, but other declarations would",
    zh: "这些声明不满足委托，换一种声明就可以满足",
  },
};

/** Words used when a placeholder has no value and no fallback template fits. */
const PLACEHOLDER_DEFAULTS: Readonly<Record<string, RuleErrorTemplate>> = {
  expectedPhase: { en: "the phase for that action", zh: "该行动所属的阶段" },
  waitingFor: { en: "the other players", zh: "其他玩家" },
  workerId: { en: "worker", zh: "工人" },
  locationId: { en: "This location", zh: "此地点" },
  discipline: { en: "the matching discipline's", zh: "相应门类的" },
  ownerId: { en: "Another player", zh: "他人" },
  techId: { en: "That Tech", zh: "该技艺" },
  kilnId: { en: "That Kiln ability", zh: "该窑口能力" },
  spaceId: { en: "That kiln space", zh: "此窑位" },
  orderId: { en: "that Order", zh: "该张" },
  reason: { en: "requirements not met", zh: "要求未满足" },
};

/** Keys whose value is a player ID, rendered through `FormatOptions.playerName`. */
const PLAYER_KEYS: ReadonlySet<string> = new Set(["playerId", "waitingFor", "ownerId"]);
/** Detail keys that hold ceramic IDs (rendered through `FormatOptions.ceramicName`, D9). */
const CERAMIC_KEYS: ReadonlySet<string> = new Set(["ceramicId", "ceramicIds", "underCeramicId"]);

export interface FormatOptions {
  /** Display name for a player ID (e.g. from `PlayerState.displayName`). Default: the ID. */
  playerName?: (playerId: string) => string;
  /**
   * Description of a ceramic ID in words, e.g. "Lin's Celadon Vase, Carved · Fine" (owner
   * decision D9: a Vessel card has no number, so player-facing text never shows `c12`).
   * The UI passes its `ceramicLabel` helper. Default: the ID (logs and tests).
   */
  ceramicName?: (ceramicId: string) => string;
}

function pick(template: RuleErrorTemplate, locale: RuleTextLocale): string {
  return locale === "zh" ? template.zh : template.en;
}

function has<K extends string>(table: Readonly<Record<K, unknown>>, value: string): value is K {
  return Object.prototype.hasOwnProperty.call(table, value);
}

function kilnSpaceLabel(spaceId: KilnSpaceId, locale: RuleTextLocale): string {
  const number = spaceId.slice(spaceId.lastIndexOf("_") + 1);
  const zone = pick(ZONE_TEXT[zoneOf(spaceId)], locale);
  return locale === "zh" ? `${zone}${number}号窑位` : `${zone} space ${number}`;
}

/**
 * Renders one `details` value as player-facing text: IDs become localised names (locations,
 * Techs, Kilns, kiln spaces, Contribution cards, phases, reasons, vocabulary), player IDs go
 * through `playerName`; Order IDs (the printed card number), numbers and unknown strings are
 * printed as they are. Pure; never mutates its inputs.
 */
export function detailLabel(
  key: string,
  value: string | number | boolean,
  locale: RuleTextLocale,
  options: FormatOptions = {},
): string {
  if (typeof value !== "string") return String(value);
  if (PLAYER_KEYS.has(key)) {
    const name = options.playerName ?? ((id: string) => id);
    return value.split(",").map((id) => name(id.trim())).join(locale === "zh" ? "、" : ", ");
  }
  if (CERAMIC_KEYS.has(key)) {
    const name = options.ceramicName ?? ((id: string) => id);
    return value.split(",").map((id) => name(id.trim())).join(locale === "zh" ? "、" : ", ");
  }
  switch (key) {
    case "locationId":
      return has(LOCATIONS, value) ? (locale === "zh" ? LOCATIONS[value as LocationId].nameZh : LOCATIONS[value as LocationId].name) : value;
    case "techId":
      return has(TECHS, value) ? (locale === "zh" ? TECHS[value as TechId].nameZh : TECHS[value as TechId].name) : value;
    case "kilnId":
      return has(KILNS, value) ? (locale === "zh" ? KILNS[value as KilnId].nameZh : KILNS[value as KilnId].name) : value;
    case "spaceId":
      return (KILN_SPACE_IDS as readonly string[]).includes(value) ? kilnSpaceLabel(value as KilnSpaceId, locale) : value;
    case "card":
      return (CONTRIBUTION_CARD_IDS as readonly string[]).includes(value)
        ? (locale === "zh" ? contributionCard(value as ContributionCardId).nameZh : contributionCard(value as ContributionCardId).name)
        : value;
    case "workerId":
    case "workerKind":
    case "effect": {
      const kind = value.includes("shifu") ? "shifu" : value.includes("apprentice") ? "apprentice" : null;
      return kind === null ? value : pick(WORKER_TEXT[kind], locale);
    }
    case "phase":
    case "expectedPhase":
      return has(PHASE_TEXT, value) ? pick(PHASE_TEXT[value], locale) : value;
    case "reason":
      return has(REASON_TEXT, value) ? pick(REASON_TEXT[value] as RuleErrorTemplate, locale) : value;
    default:
      break;
  }
  const vocabulary: ReadonlyArray<Readonly<Record<string, RuleErrorTemplate>>> = [
    RESOURCE_TEXT, SHAPE_TEXT, GLAZE_TEXT, DECORATION_TEXT, QUALITY_TEXT, STAGE_TEXT, DISCIPLINE_TEXT,
  ];
  for (const table of vocabulary) {
    const label = has(table, value) ? table[value] : undefined;
    if (label !== undefined) return pick(label, locale);
  }
  return value;
}

/** Values a placeholder can take when its own key is absent but another detail implies it. */
function derivedValue(key: string, details: GameRuleError["details"]): string | number | boolean | undefined {
  if (key === "workerId") return details["workerKind"];
  if (key === "discipline") {
    const location = details["locationId"];
    if (location === "form_decorate") return "workshop";
    if (location === "glaze_load") return "glazing_loading";
  }
  return undefined;
}

const PLACEHOLDER = /\{([A-Za-z]+)\}/g;

function placeholders(template: string): string[] {
  return [...template.matchAll(PLACEHOLDER)].map((match) => match[1] ?? "");
}

function valueFor(key: string, details: GameRuleError["details"]): string | number | boolean | undefined {
  return Object.prototype.hasOwnProperty.call(details, key) ? details[key] : derivedValue(key, details);
}

/**
 * Player-facing text for a rule error. Chooses the first template whose placeholders all have
 * values, then interpolates rendered `details`. `zh-CN` is accepted as `zh`.
 */
export function formatRuleError(
  error: Pick<GameRuleError, "code" | "details">,
  locale: RuleTextLocale | "zh-CN",
  options: FormatOptions = {},
): string {
  const lang: RuleTextLocale = locale === "en" ? "en" : "zh";
  const entry = RULE_ERROR_TEXT[error.code];
  const details = error.details ?? {};
  const candidates = [entry, ...(entry.fallbacks ?? [])].map((template) => pick(template, lang));
  const complete = candidates.find((template) => placeholders(template).every((key) => valueFor(key, details) !== undefined));
  const chosen = complete ?? candidates[0] ?? "";
  return chosen.replace(PLACEHOLDER, (_, key: string) => {
    const value = valueFor(key, details);
    if (value !== undefined) return detailLabel(key, value, lang, options);
    const fallback = PLACEHOLDER_DEFAULTS[key];
    return fallback === undefined ? "" : pick(fallback, lang);
  });
}
