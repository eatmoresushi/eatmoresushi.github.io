/**
 * Validation issues of Playtest Form V3 in the reader's language (owner: B3).
 *
 * `validatePlaytestSubmission` (`src/playtest/schema.ts`, shared with the Edge Function) reports
 * each issue as an English sentence, a field path and (change request CR B3-3) a stable `code`
 * with its numbers in `params`. This file names the field from its path ("Round 3 · Lin: Fire
 * Contribution") and renders the issue from its code in the reader's language. An issue without a
 * code (an older server) is matched by its sentence; an unknown one is shown as it is, so a new
 * schema message is never hidden.
 */
import type { PlaytestDraft, PlaytestIssueCode, PlaytestValidationIssue } from "../../playtest/types.ts";
import { FUEL_LEDGER_TECH_ID, TECH_FIELDS } from "../../playtest/schema.ts";
import { contributionCardName, disciplineName, techName } from "../i18n/content.ts";
import { signed } from "../i18n/format.ts";
import type { Translator } from "../i18n/translator.ts";
import type { TechDiscipline } from "../../game/index.ts";

/** The `id` of a form control for a schema path (`players.0.kilnId` → `pt-players-0-kilnId`). */
export function fieldId(path: string): string {
  return `pt-${path.replace(/\./g, "-")}`;
}

/** A player's name in the form, or "Player n". */
export function draftPlayerName(draft: PlaytestDraft, index: number, t: Translator): string {
  const name = draft.players[index]?.name.trim() ?? "";
  return name === "" ? t("playtest.playerN", { n: index + 1 }) : name;
}

const PLAYER_FIELDS: Readonly<Record<string, string>> = {
  name: "playtest.players.name",
  kilnId: "playtest.players.kiln",
  completedOrderIds: "playtest.players.orders",
  recognition: "playtest.players.recognition",
  kilnAbilityUses: "playtest.rounds.kilnAbilityUses",
  finalVp: "playtest.players.finalVp",
  orderVp: "playtest.players.orderVp",
  traditionVp: "playtest.players.traditionVp",
  exhibitionVp: "playtest.players.exhibitionVp",
  coinVp: "playtest.players.coinVp",
};

const RESOURCE_FIELDS = { coinsRemaining: "coins", clayRemaining: "clay", woodRemaining: "wood" } as const;

const ROUND_PLAYER_FIELDS: Readonly<Record<string, string>> = {
  contribution: "playtest.rounds.contribution",
  sharedLoaded: "playtest.rounds.sharedLoaded",
  imperialLoaded: "playtest.rounds.imperialLoaded",
  ordersCompleted: "playtest.rounds.ordersCompleted",
  kilnAbilityUses: "playtest.rounds.kilnAbilityUses",
  playerIndex: "playtest.rounds.player",
};

const META_FIELDS: Readonly<Record<string, string>> = {
  playedOn: "playtest.meta.date",
  playerCount: "playtest.meta.players",
  firstPlayerIndex: "playtest.meta.firstPlayer",
  winnerIndex: "playtest.meta.winner",
  formVersion: "playtest.meta.rulesVersion",
  rulesVersion: "playtest.meta.rulesVersion",
  gameId: "playtest.field.submission",
  submission: "playtest.field.submission",
  players: "playtest.field.players",
  rounds: "playtest.field.rounds",
  feedback: "playtest.field.feedback",
};

function techDisciplineOf(field: string): TechDiscipline | null {
  const entry = (Object.entries(TECH_FIELDS) as Array<[TechDiscipline, string]>).find(([, name]) => name === field);
  return entry === undefined ? null : entry[0];
}

/** The field an issue path names, in words. */
export function issueField(path: string, draft: PlaytestDraft, t: Translator): string {
  const parts = path.split(".");
  const [head, second, third, fourth, fifth] = parts;
  if (head === "players" && second !== undefined) {
    const player = draftPlayerName(draft, Number(second), t);
    if (third === undefined) return player;
    let field: string;
    const discipline = techDisciplineOf(third);
    if (discipline !== null) field = t("playtest.players.tech", { discipline: disciplineName(discipline, t.locale) });
    else if (third in RESOURCE_FIELDS) field = t("playtest.players.resources");
    else if (third === "completedOrderIds" && fourth !== undefined) field = t("playtest.field.orderN", { n: Number(fourth) + 1 });
    else field = t.dynamic(PLAYER_FIELDS[third] ?? "playtest.field.players");
    return t("playtest.field.ofPlayer", { player, field });
  }
  if (head === "rounds" && second !== undefined) {
    const round = t("playtest.rounds.round", { n: Number(second) + 1 });
    if (third === undefined) return round;
    if (third === "players" && fourth === undefined) return t("playtest.field.playerRoundRows", { round });
    if (third === "players" && fourth !== undefined) {
      const player = draftPlayerName(draft, Number(fourth), t);
      const field = fifth === undefined ? t("playtest.rounds.player") : t.dynamic(ROUND_PLAYER_FIELDS[fifth] ?? "playtest.rounds.player");
      return t("playtest.field.inRound", { round, field: t("playtest.field.ofPlayer", { player, field }) });
    }
    if (third === "firingTechIds") return t("playtest.field.firingTechs", { round });
    if (third === "kilnDie") return t("playtest.field.inRound", { round, field: t("playtest.rounds.kilnDie") });
    if (third === "fireModifier") return t("playtest.field.inRound", { round, field: t("playtest.rounds.fireModifier") });
    return round;
  }
  if (head === "feedback" && second !== undefined) {
    const key = `playtest.feedback.${second}`;
    return t.has(key) ? t.dynamic(key) : t("playtest.field.feedback");
  }
  return t.dynamic(META_FIELDS[head ?? ""] ?? "playtest.field.submission");
}

type Matcher = { pattern: RegExp; text: (match: RegExpExecArray, t: Translator) => string };

const fuelLedger = (t: Translator) => techName(FUEL_LEDGER_TECH_ID, t.locale);

const MATCHERS: readonly Matcher[] = [
  { pattern: /^This section is missing or invalid\.$/, text: (_, t) => t("playtest.issue.section") },
  { pattern: /^This list is missing or invalid\.$/, text: (_, t) => t("playtest.issue.list") },
  { pattern: /^Keep this list to (\d+) entries or fewer\.$/, text: (m, t) => t("playtest.issue.listMax", { n: Number(m[1]) }) },
  { pattern: /^Enter text or leave this blank\.$/, text: (_, t) => t("playtest.issue.text") },
  { pattern: /^Use (\d+) characters or fewer\.$/, text: (m, t) => t("playtest.issue.textMax", { n: Number(m[1]) }) },
  { pattern: /^Enter a whole number of at least (-?\d+)\.$/, text: (m, t) => t("playtest.issue.intMin", { min: Number(m[1]) }) },
  { pattern: /^Enter a whole number from (-?\d+) to (-?\d+)\.$/, text: (m, t) => t("playtest.issue.intRange", { min: Number(m[1]), max: Number(m[2]) }) },
  { pattern: /^Choose one of the available options\.$/, text: (_, t) => t("playtest.issue.option") },
  { pattern: /^Choose a valid Order\.$/, text: (_, t) => t("playtest.issue.order") },
  { pattern: /^Record each completed Order once\.$/, text: (_, t) => t("playtest.issue.orderOnce") },
  { pattern: /^Add exactly (\d+) player rows for this round\.$/, text: (m, t) => t("playtest.issue.roundRows", { n: Number(m[1]) }) },
  { pattern: /^Player rows must stay in seat order\.$/, text: (_, t) => t("playtest.issue.seatOrder") },
  { pattern: /^Shared Kiln loading cannot exceed (\d+) ceramics\.$/, text: (m, t) => t("playtest.issue.sharedCapacity", { n: Number(m[1]) }) },
  { pattern: /^Choose a Kiln Die face\.$/, text: (_, t) => t("playtest.issue.kilnDie") },
  { pattern: /^Choose a valid Firing Tech\.$/, text: (_, t) => t("playtest.issue.firingTech") },
  { pattern: /^Record each Firing Tech at most once per round\.$/, text: (_, t) => t("playtest.issue.firingTechOnce") },
  {
    pattern: /^Check Fuel Ledger when a −2 or \+2 Contribution was used\.$/,
    text: (_, t) => t("playtest.issue.fuelLedgerCheck", { tech: fuelLedger(t), low: signed(-2), high: signed(2) }),
  },
  {
    pattern: /^Fuel Ledger requires exactly one Bank −2 or Stoke \+2 Contribution\.$/,
    text: (_, t) =>
      t("playtest.issue.fuelLedgerOne", {
        tech: fuelLedger(t),
        bank: contributionCardName("BANK", t.locale),
        stoke: contributionCardName("STOKE", t.locale),
        low: signed(-2),
        high: signed(2),
      }),
  },
  { pattern: /^The reference number is assigned by the server\.$/, text: (_, t) => t("playtest.issue.reference") },
  { pattern: /^Unsupported form version\.$/, text: (_, t) => t("playtest.issue.formVersion") },
  { pattern: /^This form records rules V([\d.]+)\.$/, text: (m, t) => t("playtest.issue.rulesVersion", { version: m[1] ?? "" }) },
  { pattern: /^Enter a valid play date\.$/, text: (_, t) => t("playtest.issue.date") },
  { pattern: /^Add exactly (\d+) player records\.$/, text: (m, t) => t("playtest.issue.playerRecords", { n: Number(m[1]) }) },
  { pattern: /^Each player should have a different Kiln\.$/, text: (_, t) => t("playtest.issue.differentKilns") },
  { pattern: /^A Tech tile can only belong to one player\.$/, text: (_, t) => t("playtest.issue.techOnce") },
  { pattern: /^A physical Order card can only be completed once per game\.$/, text: (_, t) => t("playtest.issue.orderPerGame") },
  { pattern: /^Add exactly (\d+) rounds\.$/, text: (m, t) => t("playtest.issue.rounds", { n: Number(m[1]) }) },
  { pattern: /^Record each round at most once\.$/, text: (_, t) => t("playtest.issue.roundOnce") },
  { pattern: /^A Firing Tech can only be used after assigning it to a player\.$/, text: (_, t) => t("playtest.issue.firingTechOwner") },
  {
    pattern: /^Only the player who owns Fuel Ledger can record a −2 or \+2 Contribution\.$/,
    text: (_, t) => t("playtest.issue.fuelLedgerOwner", { tech: fuelLedger(t), low: signed(-2), high: signed(2) }),
  },
  { pattern: /^Kiln ability total must match the \w+ round counters\.$/, text: (_, t) => t("playtest.issue.abilityTotal") },
  { pattern: /^Completed Orders must match the total recorded across rounds\.$/, text: (_, t) => t("playtest.issue.orderTotal") },
];

type Params = Readonly<Record<string, number | string>>;
const numberOf = (params: Params | undefined, key: string): number => Number(params?.[key] ?? 0);

/** Each issue code in the reader's language (CR B3-3); a code without an entry falls back to its sentence. */
const BY_CODE: Partial<Readonly<Record<PlaytestIssueCode, (params: Params | undefined, t: Translator) => string>>> = {
  section_invalid: (_, t) => t("playtest.issue.section"),
  list_invalid: (_, t) => t("playtest.issue.list"),
  list_max: (p, t) => t("playtest.issue.listMax", { n: numberOf(p, "max") }),
  text_invalid: (_, t) => t("playtest.issue.text"),
  text_max: (p, t) => t("playtest.issue.textMax", { n: numberOf(p, "max") }),
  integer_min: (p, t) => t("playtest.issue.intMin", { min: numberOf(p, "min") }),
  integer_range: (p, t) => t("playtest.issue.intRange", { min: numberOf(p, "min"), max: numberOf(p, "max") }),
  option_invalid: (_, t) => t("playtest.issue.option"),
  order_invalid: (_, t) => t("playtest.issue.order"),
  order_once: (_, t) => t("playtest.issue.orderOnce"),
  firing_tech_invalid: (_, t) => t("playtest.issue.firingTech"),
  firing_tech_once: (_, t) => t("playtest.issue.firingTechOnce"),
  round_rows: (p, t) => t("playtest.issue.roundRows", { n: numberOf(p, "count") }),
  seat_order: (_, t) => t("playtest.issue.seatOrder"),
  shared_capacity: (p, t) => t("playtest.issue.sharedCapacity", { n: numberOf(p, "capacity") }),
  kiln_die_face: (_, t) => t("playtest.issue.kilnDie"),
  fuel_ledger_check: (_, t) => t("playtest.issue.fuelLedgerCheck", { tech: fuelLedger(t), low: signed(-2), high: signed(2) }),
  fuel_ledger_one: (_, t) =>
    t("playtest.issue.fuelLedgerOne", {
      tech: fuelLedger(t),
      bank: contributionCardName("BANK", t.locale),
      stoke: contributionCardName("STOKE", t.locale),
      low: signed(-2),
      high: signed(2),
    }),
  fuel_ledger_owner: (_, t) => t("playtest.issue.fuelLedgerOwner", { tech: fuelLedger(t), low: signed(-2), high: signed(2) }),
  reference_server: (_, t) => t("playtest.issue.reference"),
  form_version: (_, t) => t("playtest.issue.formVersion"),
  rules_version: (p, t) => t("playtest.issue.rulesVersion", { version: String(p?.["version"] ?? "") }),
  date_invalid: (_, t) => t("playtest.issue.date"),
  player_records: (p, t) => t("playtest.issue.playerRecords", { n: numberOf(p, "count") }),
  duplicate_kiln: (_, t) => t("playtest.issue.differentKilns"),
  tech_once: (_, t) => t("playtest.issue.techOnce"),
  order_per_game: (_, t) => t("playtest.issue.orderPerGame"),
  rounds_count: (p, t) => t("playtest.issue.rounds", { n: numberOf(p, "count") }),
  round_once: (_, t) => t("playtest.issue.roundOnce"),
  firing_tech_owner: (_, t) => t("playtest.issue.firingTechOwner"),
  ability_total: (_, t) => t("playtest.issue.abilityTotal"),
  order_total: (_, t) => t("playtest.issue.orderTotal"),
};

/** The issue codes rendered from the catalogue (for the test that keeps the schema and this file in step). */
export const RENDERED_ISSUE_CODES: readonly PlaytestIssueCode[] = Object.keys(BY_CODE) as PlaytestIssueCode[];

/** The issue in the current language: from its code, else its sentence matched, else as it is. */
export function issueMessageOf(issue: PlaytestValidationIssue, t: Translator): string {
  const byCode = issue.code === undefined ? undefined : BY_CODE[issue.code];
  return byCode === undefined ? issueMessage(issue.message, t) : byCode(issue.params, t);
}

/** The issue's sentence in the current language; an unknown sentence as it is. */
export function issueMessage(message: string, t: Translator): string {
  for (const matcher of MATCHERS) {
    const match = matcher.pattern.exec(message);
    if (match !== null) return matcher.text(match, t);
  }
  return message;
}

/** "Field: message" for one issue. */
export function issueText(issue: PlaytestValidationIssue, draft: PlaytestDraft, t: Translator): string {
  return t("playtest.submit.issueAt", { field: issueField(issue.path, draft, t), message: issueMessageOf(issue, t) });
}

/** Every schema message this file matches (for the test that keeps the two in step). */
export const MATCHED_PATTERNS: readonly RegExp[] = MATCHERS.map((matcher) => matcher.pattern);
