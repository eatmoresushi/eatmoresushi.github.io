import actionLocationsJson from "../../data/action_locations.json" with { type: "json" };
import firingJson from "../../data/firing.json" with { type: "json" };
import gameConfigJson from "../../data/game_config.json" with { type: "json" };
import imperialProgressJson from "../../data/imperial_progress.json" with { type: "json" };
import kilnsJson from "../../data/kilns.json" with { type: "json" };
import ordersJson from "../../data/orders.json" with { type: "json" };
import techniquesJson from "../../data/techniques.json" with { type: "json" };

/**
 * A fingerprint of the rules a game is actually being played under (DESIGN §6.9, P1).
 *
 * `rules_version` alone cannot do this job: rules have changed inside an unchanged version
 * string before, which leaves the version gate unable to tell a room created before the
 * change from one created after. The fingerprint has two halves:
 *
 * 1. **Content** — hashed automatically from the seven mechanical `data/*.json` files. Catches
 *    any change to an Order's VP, a capacity, a Tech cost, the Fire deck, the Quality table…
 * 2. **Behaviour** — `RULES_BEHAVIOUR_REVISION`, bumped by hand when engine semantics change
 *    with no data field behind them.
 *
 * Display prose (`PROSE_KEYS`, `PROSE_LIST_KEYS`) is excluded so that a typo fix or a translation
 * improvement does not invalidate every game in progress. Order `requirements` text stays in
 * the digest.
 *
 * This is drift detection, not security: FNV-1a is not a defence against a crafted collision.
 * Rooms store `r<revision>-<digest>`; the V1.6.2 Supabase gate requires `^r31-[0-9a-f]{16}$`.
 */

/**
 * Bump this whenever engine semantics change without a corresponding change in `data/`.
 *
 * Revision history (1–28 are the V1.1.5–V1.4 engines, recorded in
 * `src/game-v14/rulesFingerprint.ts` and in git history):
 *  28 -- V1.4 with Ding disabled for new games (last V1.4 revision).
 *  29 -- V1.6.1 rework of V1.2.7: five central and two personal locations with absolute
 *        capacity, Kiln Die starting Base Heat, Heat markers, court-fired Imperial Kiln,
 *        rebuilt Ge Crackle, 18 Advanced Techs and no Starting Techs, held-only single-pass
 *        Order Phase with deferred display refill. All five Kilns selectable. V1.4 rooms
 *        are rejected, never migrated (audit, Digital decisions).
 *        Amended in place by owner amendment A1 (2026-10-15): each Advanced Tech's 1 VP is
 *        recorded in the score ledger when the Tech is gained (`ScoreLedger.techs`,
 *        `TECH_ACQUIRED.vp`) instead of being added at game end; config key
 *        `techs.endGameVpEach` became `techs.vpEach`, which moves the content digest. Final
 *        totals are unchanged. Not bumped: V1.6.1 was unreleased and no r29 room existed in
 *        production when A1 landed.
 *  30 -- V1.6.2: Commission Market looks (top 2 / top 3) with no resource and no blind
 *        reservation; Materials Yard Shifu 6; Guild Hall Shifu takes up to 2 Techs from
 *        different disciplines at printed cost, and Tech displays refill when the taker's turn
 *        ends (owner revision 2026-10-17); Canal Wharf Shifu draws the top Main Order; Colour
 *        Samples once-per-round swap; Canal Barge 2 Coins on completion; Protective Saggars
 *        floor and Standard → Fine; Fuel Ledger free Bank/Stoke; Second Firing best of 2; Fire
 *        reshuffle above buried cards (R15); owner revision 2 (changes 23–24): an 8-card
 *        Starting deck, nineteen re-valued Main Orders, and looked-at Orders not reserved go to
 *        the bottom of the Main deck instead of the discard (superseding R14), several in
 *        random order (owner ruling R19, 2026-10-18). V1.6.1 (r29)
 *        rooms are rejected. The V1.6.2 track lands in stages (ENGINE_V1.6.2_DELTA.md): the
 *        location changes and the new Tech costs first, the Tech behaviour after; V1.6.2 is
 *        unreleased, so the revision stays 30 across the stages, both owner revisions and R19,
 *        and the content digest moves with the data.
 *  31 -- V1.6.2 owner revision 3 (changes 25–27, 2026-10-18), state schema 8: the keyword
 *        Select N, one model for the Commission Market and both Colour Samples looks, every
 *        Select able to reserve a face-up Main Order (refilled at the end of the turn) and one
 *        `SELECT_CHOOSE` command; the Colour Samples swap Selects 3 instead of looking at 2;
 *        Fuel Ledger as Contribution cards (Fuel Ledger Bank and Fuel Ledger Stoke come with
 *        the tile, `PlayerState.contributionCards`; the `fuelLedger` commitment flag is gone);
 *        no Tech VP (owner amendment A1 superseded: `ScoreLedger.techs`, the final `techs`
 *        row, `TECH_ACQUIRED.vp` and `techs.vpEach` are gone). Rules version stays 1.6.2;
 *        r30 rooms and schema-7 saves are rejected, never migrated.
 */
export const RULES_BEHAVIOUR_REVISION = 31;

/**
 * Display-only keys. A key is dropped only when its value is prose (a string, or `null` for an
 * empty reward text); if one of these names ever holds a number or an object, it still reaches
 * the digest. Location `effects.apprentice` / `effects.shifu` are objects and therefore stay in.
 */
export const PROSE_KEYS: ReadonlySet<string> = new Set([
  // Kept from V1.4.
  "name",
  "nameZh",
  "ability",
  "abilityZh",
  "abilityName",
  "abilityNameZh",
  "description",
  "descriptionZh",
  "notes",
  "note",
  "text",
  "flavour",
  "flavor",
  "apprentice",
  "shifu",
  "apprenticeZh",
  "shifuZh",
  // New in V1.6.1 (DESIGN §6.9).
  "shortText",
  "shortTextZh",
  "apprenticeText",
  "apprenticeTextZh",
  "shifuText",
  "shifuTextZh",
  "title",
  "titleZh",
  "rewardText",
  "rewardTextZh",
  "summary",
  "summaryZh",
  "notesZh",
]);

/**
 * Display-only keys whose value is a list of prose records rather than one string: the D10
 * `clarifications` (owner decision D10, `docs/KILN_OPENING_v1.6.2_CLARIFICATIONS.md`, which is
 * itself outside the fingerprint). A key is dropped only when its value is prose: an array of
 * records whose every value is a string, or an object whose every value is such an array (the
 * top-level `clarifications` of `orders.json` and `imperial_progress.json`). Anything else under
 * this name still reaches the digest.
 */
export const PROSE_LIST_KEYS: ReadonlySet<string> = new Set(["clarifications"]);

function isProseRecordList(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => item !== null && typeof item === "object" && !Array.isArray(item)
    && Object.values(item as Record<string, unknown>).every((field) => typeof field === "string"));
}

function isProseList(value: unknown): boolean {
  if (isProseRecordList(value)) return true;
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.values(value as Record<string, unknown>).every(isProseRecordList);
}

/** True when a key/value pair is display prose and stays out of the digest. */
function isProse(key: string, item: unknown): boolean {
  if (PROSE_KEYS.has(key)) return typeof item === "string" || item === null;
  return PROSE_LIST_KEYS.has(key) && isProseList(item);
}

/** Deterministic serialisation: keys sorted, prose dropped, no incidental whitespace. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map((item) => canonical(item)).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([key, item]) => !isProse(key, item))
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
}

/** FNV-1a, 64-bit. Short, dependency-free and identical in every runtime. */
function fnv1a64(input: string): string {
  const prime = 0x1_0000_01b3n;
  const mask = 0xffff_ffff_ffff_ffffn;
  let hash = 0xcbf2_9ce4_8422_2325n;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= BigInt(input.charCodeAt(index) & 0xff);
    hash = (hash * prime) & mask;
    // Surrogate-safe: mix the high byte too rather than truncating non-ASCII to one byte.
    const high = input.charCodeAt(index) >> 8;
    if (high !== 0) {
      hash ^= BigInt(high);
      hash = (hash * prime) & mask;
    }
  }
  return hash.toString(16).padStart(16, "0");
}

/** The content half: the seven mechanical files, in this order (reordering changes the digest). */
export const CONTENT_SOURCES: ReadonlyArray<readonly [string, unknown]> = [
  ["action_locations", actionLocationsJson],
  ["firing", firingJson],
  ["game_config", gameConfigJson],
  ["imperial_progress", imperialProgressJson],
  ["kilns", kilnsJson],
  ["orders", ordersJson],
  ["techniques", techniquesJson],
];

/** The digest of any list of named sources (pure; tests pass modified copies). */
export function contentDigestOf(sources: ReadonlyArray<readonly [string, unknown]>): string {
  return fnv1a64(sources.map(([name, data]) => `${name}:${canonical(data)}`).join("|"));
}

/** The digest of the checked-in content. */
export function contentDigest(): string {
  return contentDigestOf(CONTENT_SOURCES);
}

/**
 * The value stored on a room and compared on every action, shaped `r<revision>-<digest>` so an
 * operator can see at a glance which half differs.
 */
export function rulesFingerprint(): string {
  return `r${RULES_BEHAVIOUR_REVISION}-${contentDigest()}`;
}
