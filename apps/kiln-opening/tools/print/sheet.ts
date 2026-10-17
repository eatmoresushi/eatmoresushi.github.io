/**
 * HTML for the printable Order card sheets: A4 portrait, up to 4 × 4 cards of 50 × 71 mm with
 * dashed cut lines. Each deck starts on a new sheet (V1.6.2: page 1 the 8 Starting Orders
 * S01–S08, pages 2–4 the 48 Main Orders). A deck that needs several sheets is dealt across them
 * back and forth (`dealOrder`: O01 → page 2, O02 → 3, O03 → 4, O04 → 4, O05 → 3, O06 → 2, …), so
 * every sheet holds a third of every run of IDs, i.e. of every tier, and no sheet can be told
 * from the others by its cards' worth (see "Card backs" below). A sheet that is not full prints
 * only the rows it uses, from the top: below them the paper stays blank, with no parchment and
 * no cut line (the vertical cuts stop at the parchment's edge). A last row with fewer than 4
 * cards would keep its empty cells as plain parchment (no V1.6.2 deck needs it).
 *
 * Each card: parchment with a thin gold double border and fret corners, the printed ID top
 * right (Starting Orders carry their kind word beside it), the ceramic illustration, the
 * requirement and quality headings and lines (rulebook strings, "Masterpiece"/"臻品" in red),
 * and a reward row: VP hexagon and number | one coin per Coin, then one crown per Crown. In
 * Chinese the number comes first and the hexagon carries 分 after it ("14分", glossary §1.3).
 *
 * The cards abut: one shared cut separates two cards. Over the parchment the cut lines are a
 * dark parchment tone (a slightly missed cut leaves no grey on a card edge); they turn grey
 * only where they run out into the white page margin. Nothing else is printed in the margin,
 * which most printers cannot reach.
 *
 * The coin and crown are the game's own icons (src/app/pieces/ResourceIcon.tsx coin,
 * src/app/pieces/CrownIcon.tsx), copied here as SVG markup so this tool imports no app module.
 *
 * Card backs (for two-sided printing): after each front sheet comes its back sheet, a full grid
 * of 16 identical backs of that sheet's deck (Main Orders on a deep celadon field, Starting
 * Orders on a lighter clay field with a lobed medallion, each with fine 135° stripes echoing
 * the online card back, CardBack.css). The grid is symmetric on the paper, so every front card
 * has a back of its deck behind it whichever way the sheet is turned over: on the long edge (the
 * usual duplex default; a back at x lands on x' = 210 − x − 50) or on the short edge (y' = 297 −
 * y − 71). On page 1 the backs of the lower two rows back the blank paper after a long-edge flip
 * and the Starting cards after a short-edge one (`planBacks`, checked numerically here, on the
 * rendered page and on the PDF itself). The field is one continuous area across the whole grid
 * and `BACK_BLEED` mm beyond the outer cuts, and its stripes repeat every 1 mm along x and y,
 * which divides the card pitch, so a front-to-back misregistration of 1–2 mm never shows white or
 * a seam at a cut and every card's stripes sit the same way. A back has no frame or other mark
 * near its edges (a misregistered sheet would show its offset as uneven margins): only the
 * centred medallion and words, far inside `BACK_SAFE` mm of each cut. Every mark is drawn in one
 * page-sized SVG whose user unit is exactly 1 mm on a whole-pixel box, so the PDF holds the
 * planned geometry (an SVG per card would be snapped to whole CSS pixels, 0.26 mm). Back sheets
 * carry no cut lines.
 */
import type { BackLabels, CardModel, Lang, SheetLabels } from "./orderSource.ts";
import type { Illustration } from "./illustration.ts";

/** Text sizes in pt (cardPage.js applies them to the whole deck). */
export interface FitSettings {
  /**
   * The requirement's deck size and line height. A card whose requirement does not fit first
   * shrinks by up to `keepWhole` to keep its clauses whole, then breaks long clauses and
   * tightens its leading to `minLeading`, and only then shrinks towards `min`.
   */
  req: { size: number; leading: number; minLeading: number; keepWhole: number; min: number };
  /** The quality line: the largest size up to `max` at which every card's fits on one line. */
  qual: { max: number; min: number };
}

/** Colours of one deck's backs. */
export interface BackColours {
  /** The field and its stripes. */
  field: string;
  stripe: string;
  /** The band between the medallion's outer outline and its inner ring. */
  band: string;
  /** The medallion's outline and rings. */
  gold: string;
  /** The words and the divider under the medallion. */
  words: string;
}

/** Colours of the backs: the light-theme tokens of src/app/styles/tokens.css (printOrderCards.ts). */
export interface BackPalette {
  decks: Record<CardModel["kind"], BackColours>;
  /** The seal block. */
  seal: string;
}

/** The faint kiln drawing inside the medallion (composited by cardPage.js). */
export interface BackArt {
  /** Data URL of the approved board illustration. */
  url: string;
  /** Source rectangle (px) holding the kiln. */
  crop: { x: number; y: number; w: number; h: number };
  /** Where the crop is drawn, mm from the disc's top-left corner, and its width in mm. */
  place: { left: number; top: number; width: number };
  /** Darkest ink, 0–1, before the radial fade (0 = no drawing). */
  strength: number;
}

export interface PageInput {
  lang: Lang;
  /** The backs: the medallion drawing, the disc radius (mm) it fills, and the check limits. */
  back: { art: BackArt; discR: number; safe: number; minBleed: number; pageW: number; pageH: number };
  /** `<shape>-<decoration>` → data URL of the neutral cutout. */
  cutouts: Record<string, string>;
  /** Glaze → print tint (the light-theme `--glz-*` colour at its print density). */
  glazes: Record<string, string>;
  /** Smallest colour difference (ΔE76) allowed between two Glazes, or a Glaze and "any Glaze". */
  minGlazeDeltaE: number;
  fit: FitSettings;
}

export interface SheetCard {
  card: CardModel;
  art: Illustration;
}

export const COLUMNS = 4;
export const ROWS = 4;
export const CARDS_PER_SHEET = COLUMNS * ROWS;

export const CARD_W = 50;
export const CARD_H = 71;
export const GRID_LEFT = 5;
export const GRID_TOP = 6.5;
/** Parchment printed beyond the outer cuts (the sheet's `.bleed`). */
export const BLEED = 1;
export const PAGE_W = 210;
export const PAGE_H = 297;
/** The cut lines run out to this distance from the paper edge. */
const RUN_OUT_EDGE = 0.6;

/** The back's field runs this far beyond the outer cuts (the check asks for at least `BACK_MIN_BLEED`). */
export const BACK_BLEED = 3;
export const BACK_MIN_BLEED = 2;
/** Every mark on a back stays at least this far inside each cut. */
export const BACK_SAFE = 4;
/** CSS px per mm, and the back sheet's SVG box in whole CSS px (just over A4; the sheet clips it). */
const PX_PER_MM = 96 / 25.4;
const BACK_SVG_PX = { w: Math.ceil(PAGE_W * PX_PER_MM), h: Math.ceil(PAGE_H * PX_PER_MM) };
/**
 * The stripes' repeat along x and along y, mm. It divides the card pitch (50 and 71 mm), so the
 * stripes sit the same way on every card: their centre lines run where x + y is a whole number
 * of millimetres on the page, which is half a repeat from each card's corners.
 */
export const BACK_STRIPE_PITCH = 1;

/** One printed sheet: its cards (one deck only) and the grid rows they take. */
export interface SheetPlan {
  kind: CardModel["kind"];
  ids: string[];
  rows: number;
  /** Lowest printed point, mm from the paper's top edge (everything below is blank paper). */
  inkBottom: number;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Wraps every "Masterpiece(s)" / "臻品" in the red span. */
function markMasterpiece(text: string): string {
  return escapeHtml(text).replace(/Masterpieces?|臻品/g, (word) => `<span class="mp">${word}</span>`);
}

/**
 * Splits `text` after each match of `pattern`, keeping every character: the delimiter stays
 * with the piece before it, its trailing spaces go between the pieces (or `joiner` when it has
 * none, as after "；" and "、").
 */
function splitKeeping(text: string, pattern: RegExp, wrapPiece: (piece: string) => string, joiner: string): string {
  const parts: string[] = [];
  let start = 0;
  for (const match of text.matchAll(pattern)) {
    const end = (match.index ?? 0) + match[0].length;
    const piece = text.slice(start, end);
    const trailing = /\s+$/.exec(piece)?.[0] ?? "";
    parts.push(`${wrapPiece(piece.slice(0, piece.length - trailing.length))}${trailing === "" ? joiner : escapeHtml(trailing)}`);
    start = end;
  }
  parts.push(wrapPiece(text.slice(start)));
  return parts.join("");
}

/**
 * The text as segments (clauses), split after each " · ", "; ", "；" or "，" separator, each made
 * of unbreakable chunks split after ", ", " + " and "、" ("one Grey-Green,"). The separators stay
 * in the text, so the element's textContent is exactly the source string. Lines break between
 * segments where possible; cardPage.js lets a segment break between its chunks only when it is
 * wider than the box, and then sets it on lines of its own, so a line never breaks inside
 * "Grey-Green" or "Brush Washer" and never holds the end of one clause and the start of the next
 * broken one. A chunk's closing full-width "；", "，" or "、" is its own `.pz` span, so cardPage.js
 * can trim its blank right half where it ends a centred line.
 */
function segmented(text: string): string {
  const chunk = (piece: string): string => {
    const closing = /[；，、]$/.exec(piece)?.[0];
    const body = closing === undefined ? piece : piece.slice(0, -closing.length);
    return `<span class="ch">${markMasterpiece(body)}${closing === undefined ? "" : `<span class="pz">${closing}</span>`}</span>`;
  };
  // Between segments a `<wbr>` marks the break after "；"/"，"; between chunks nothing is
  // added (Chromium breaks at a `<wbr>` even inside `nowrap`), so "白釉、月白釉各1件" stays whole
  // unless the segment is allowed to wrap, where the line-break rules allow a break after "、".
  return splitKeeping(text, / · |; |；|，/g, (segment) => `<span class="seg">${splitKeeping(segment, /, | \+ |、/g, chunk, "")}</span>`, "<wbr>");
}

/**
 * Game coin (ResourceIcon `coins`): same geometry, viewBox cropped to the coin's outer stroke
 * (r 6.3 + 0.275) with a 0.2-unit margin. Chromium clips an inline SVG to its box snapped to
 * whole CSS pixels, which shaved the rim of a tightly cropped coin, so the box keeps a margin
 * and cards.css also lets the icon overflow it (`.ico { overflow: visible }`).
 */
const COIN_SVG =
  '<svg class="ico coin" viewBox="1.225 1.225 13.55 13.55" aria-hidden="true">' +
  '<circle class="ri-body" cx="8" cy="8" r="6.3"/>' +
  '<circle class="ri-cut" cx="8" cy="8" r="4.6" fill="none" stroke-width="0.9"/>' +
  '<rect class="ri-cut ri-fill" x="6.3" y="6.3" width="3.4" height="3.4"/>' +
  "</svg>";

/** Game Crown glyph (CrownIcon): same path, viewBox cropped to the glyph with the same margin. */
const CROWN_SVG = '<svg class="ico crown" viewBox="0.4 0.4 12.2 9.8" aria-hidden="true"><path d="M1 9.5h11L12 2.5 9 5.5 6.5 1 4 5.5 1 2.5z"/></svg>';

const DEFS_SVG =
  '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>' +
  '<linearGradient id="coin-grad" x1="0.2" y1="0" x2="0.75" y2="1">' +
  '<stop offset="0" stop-color="#c99a4c"/><stop offset="0.55" stop-color="#a87a2f"/><stop offset="1" stop-color="#7f5a22"/>' +
  "</linearGradient>" +
  '<linearGradient id="crown-grad" x1="0" y1="0" x2="0" y2="1">' +
  '<stop offset="0" stop-color="#d9b062"/><stop offset="1" stop-color="#a77a30"/>' +
  "</linearGradient>" +
  "</defs></svg>";

/** A 回-key fret in a 3.2 mm square, drawn for the top-left corner; mirrored for the others. */
const FRET = '<path class="fret" d="M0 3.2V0H3.2V2.4H0.8V0.8H2.4V1.6H1.6"/>';

const FRAME_SVG =
  `<svg class="frame" viewBox="0 0 ${CARD_W} ${CARD_H}" aria-hidden="true">` +
  `<rect class="outer" x="1.75" y="1.75" width="${CARD_W - 3.5}" height="${CARD_H - 3.5}"/>` +
  `<rect class="inner" x="2.4" y="2.4" width="${CARD_W - 4.8}" height="${CARD_H - 4.8}"/>` +
  `<g transform="translate(3.05 3.05)">${FRET}</g>` +
  `<g transform="translate(3.05 ${CARD_H - 3.05}) scale(1 -1)">${FRET}</g>` +
  `<g transform="translate(${CARD_W - 3.05} ${CARD_H - 3.05}) scale(-1 -1)">${FRET}</g>` +
  "</svg>";

/** A faint auspicious-cloud scroll, 14 × 6 units. */
const CLOUD =
  '<path d="M0.5 5.5C0.5 3.2 2.6 2 4.4 2.9C5.6 3.5 5.6 5.1 4.4 5.3C3.5 5.5 3.1 4.5 3.8 4.1"/>' +
  '<path d="M4.4 2.9C5.2 0.8 8.4 0.3 9.8 2.2C10.6 3.3 10 4.6 8.9 4.4C8.1 4.2 8.1 3.2 8.8 3.1"/>' +
  '<path d="M9.8 2.2C11.4 1.6 13.4 2.6 13.5 4.4C13.6 5.4 12.6 5.9 11.9 5.3"/>' +
  '<path d="M0.5 5.5C3 5.9 5 5.2 7.2 5.6C9.4 6 11.6 5.4 13.2 5.7"/>';

const CLOUDS_SVG =
  `<svg class="clouds" viewBox="0 0 ${CARD_W} ${CARD_H}" aria-hidden="true">` +
  `<g transform="translate(4.2 14.5) scale(0.95)">${CLOUD}</g>` +
  `<g transform="translate(46 9.5) scale(-0.8 0.8)">${CLOUD}</g>` +
  `<g transform="translate(31.5 24.2) scale(0.7)">${CLOUD}</g>` +
  "</svg>";

/** The divider's drawing, 33 × 2.2 units (also used, scaled, on the backs). */
const DIVIDER_PATHS =
  '<line x1="0.9" y1="1.1" x2="13.1" y2="1.1"/><line x1="19.9" y1="1.1" x2="32.1" y2="1.1"/>' +
  '<path d="M13.1 1.1C13.9 0.15 15.2 0.2 15.4 0.95C15.6 1.65 14.7 1.85 14.4 1.35"/>' +
  '<path d="M19.9 1.1C19.1 0.15 17.8 0.2 17.6 0.95C17.4 1.65 18.3 1.85 18.6 1.35"/>' +
  '<path class="dot" d="M16.5 0.35L17.15 1.1L16.5 1.85L15.85 1.1Z"/>' +
  '<circle class="dot" cx="0.6" cy="1.1" r="0.28"/><circle class="dot" cx="32.4" cy="1.1" r="0.28"/>';

const DIVIDER_SVG = `<svg class="divider" viewBox="0 0 33 2.2" aria-hidden="true">${DIVIDER_PATHS}</svg>`;

function vpBadge(label: string): string {
  return (
    '<svg class="vp-badge" viewBox="0 0 20 22.5" aria-hidden="true">' +
    '<polygon class="hex" points="10,0.5 19.4,5.85 19.4,16.65 10,22 0.6,16.65 0.6,5.85"/>' +
    '<polygon class="hex-line" points="10,2.3 17.8,6.75 17.8,15.75 10,20.2 2.2,15.75 2.2,6.75"/>' +
    `<text x="10" y="13.9" text-anchor="middle">${escapeHtml(label)}</text>` +
    "</svg>"
  );
}

function cardHtml({ card, art }: SheetCard, labels: SheetLabels): string {
  const kind = card.kind === "starting" ? `<span class="kind">${escapeHtml(labels.startingKind)}</span>` : "";
  const icons = [...Array.from({ length: card.coins }, () => COIN_SVG), ...Array.from({ length: card.crowns }, () => CROWN_SVG)].join("");
  const attributes = [
    ["data-id", card.id],
    ["data-kind", card.kind],
    ["data-req", card.requirement],
    ["data-qual", card.quality],
    ["data-vp", String(card.vp)],
    ["data-coins", String(card.coins)],
    ["data-crowns", String(card.crowns)],
  ]
    .map(([name, value]) => `${name}="${escapeHtml(value ?? "")}"`)
    .join(" ");
  return (
    `<article class="card" ${attributes}>` +
    CLOUDS_SVG +
    FRAME_SVG +
    `<div class="id-row">${kind}<span class="id">${escapeHtml(card.id)}</span><i class="baseline"></i></div>` +
    `<div class="art" data-layout="${art.layout}" data-figures="${escapeHtml(JSON.stringify(art.figures))}"></div>` +
    '<div class="text">' +
    `<div class="h h-req">${escapeHtml(labels.requirement)}</div>` +
    // An English single-ceramic requirement ("Bowl · any Glaze · any Decoration") is set on two
    // lines, as on the reference cards: cardPage.js breaks it before the Decoration (or after
    // the Shape). The Chinese one ("碗 · 任意釉 · 任意纹饰") is short and reads as one line.
    `<div class="req"><p${labels.lang === "en" && card.data.ceramics.length === 1 ? ' class="single"' : ""}>${segmented(card.requirement)}</p></div>` +
    DIVIDER_SVG +
    `<div class="h h-qual">${escapeHtml(labels.quality)}</div>` +
    `<div class="qual"><p>${segmented(card.quality)}</p></div>` +
    "</div>" +
    '<div class="reward">' +
    // English: [VP] 14 (the reference's order). Chinese: 14[分], number then unit (glossary §1.3).
    (labels.lang === "zh" ? `<span class="vp-num">${card.vp}</span>${vpBadge(labels.vp)}` : `${vpBadge(labels.vp)}<span class="vp-num">${card.vp}</span>`) +
    '<span class="sep"></span>' +
    `<span class="icons">${icons}</span>` +
    "</div>" +
    "</article>"
  );
}

/**
 * The cut lines of a sheet whose cards take `rows` rows: every card edge, run out to 0.6 mm
 * from the paper edge. Over the parchment (the cards and their 1 mm bleed) they are toned
 * (`.on-card`); in the white margin grey. On a sheet with fewer than 4 rows the vertical cuts
 * end at the parchment's lower edge: the blank paper below carries no line.
 */
function cutLines(rows: number): string {
  const gridRight = GRID_LEFT + COLUMNS * CARD_W;
  const gridBottom = GRID_TOP + rows * CARD_H;
  const lines: string[] = [];
  const line = (x1: number, y1: number, x2: number, y2: number, onCard: boolean): void => {
    lines.push(`<line${onCard ? ' class="on-card"' : ""} x1="${+x1.toFixed(3)}" y1="${+y1.toFixed(3)}" x2="${+x2.toFixed(3)}" y2="${+y2.toFixed(3)}"/>`);
  };
  for (let column = 0; column <= COLUMNS; column += 1) {
    const x = GRID_LEFT + column * CARD_W;
    line(x, RUN_OUT_EDGE, x, GRID_TOP - BLEED, false);
    line(x, GRID_TOP - BLEED, x, gridBottom + BLEED, true);
    if (rows === ROWS) line(x, gridBottom + BLEED, x, PAGE_H - RUN_OUT_EDGE, false);
  }
  for (let row = 0; row <= rows; row += 1) {
    const y = GRID_TOP + row * CARD_H;
    line(RUN_OUT_EDGE, y, GRID_LEFT - BLEED, y, false);
    line(GRID_LEFT - BLEED, y, gridRight + BLEED, y, true);
    line(gridRight + BLEED, y, PAGE_W - RUN_OUT_EDGE, y, false);
  }
  return `<svg class="cuts" viewBox="0 0 ${PAGE_W} ${PAGE_H}" aria-hidden="true">${lines.join("")}</svg>`;
}

/**
 * The sheet (0-based, within its deck) of the card at `position` in a deck printed on `sheets`
 * sheets: dealt back and forth, as round a table (0, 1, 2, 2, 1, 0, 0, 1, …). Every block of
 * `sheets` consecutive cards puts one card on each sheet, so any run of IDs (an Order tier) is
 * spread evenly, and the back-and-forth evens out the rise in worth within a run.
 */
export function dealSheet(position: number, sheets: number): number {
  const block = Math.floor(position / sheets);
  const at = position % sheets;
  return block % 2 === 0 ? at : sheets - 1 - at;
}

/**
 * The sheets in print order: each deck (Starting, then Main, in the order the cards come)
 * starts a new sheet and takes as few sheets of 16 as it needs; a deck of several sheets is
 * dealt across them (`dealSheet`), each sheet keeping its cards in deck order. Throws if the
 * cards are not grouped by deck.
 */
export function planSheets(cards: SheetCard[]): Array<{ plan: SheetPlan; cards: SheetCard[] }> {
  const decks: SheetCard[][] = [];
  for (const card of cards) {
    const deck = decks.at(-1);
    if (deck !== undefined && deck[0]?.card.kind === card.card.kind) deck.push(card);
    else {
      if (decks.some((earlier) => earlier[0]?.card.kind === card.card.kind)) throw new Error(`sheet: the ${card.card.kind} cards are not together (${card.card.id})`);
      decks.push([card]);
    }
  }
  const sheets: Array<{ plan: SheetPlan; cards: SheetCard[] }> = [];
  for (const deck of decks) {
    const count = Math.ceil(deck.length / CARDS_PER_SHEET);
    const dealt = Array.from({ length: count }, () => [] as SheetCard[]);
    deck.forEach((card, position) => dealt[dealSheet(position, count)]?.push(card));
    for (const sheetCards of dealt) {
      if (sheetCards.length > CARDS_PER_SHEET) throw new Error(`sheet: ${sheetCards.length} cards dealt to one sheet`);
      const rows = Math.ceil(sheetCards.length / COLUMNS);
      const inkBottom = rows === ROWS ? PAGE_H - RUN_OUT_EDGE : GRID_TOP + rows * CARD_H + BLEED;
      sheets.push({ plan: { kind: sheetCards[0]?.card.kind ?? "main", ids: sheetCards.map(({ card }) => card.id), rows, inkBottom }, cards: sheetCards });
    }
  }
  return sheets;
}

// ---- Card backs ---------------------------------------------------------------------------

/** One back: the card it backs, and where that card's front and its back sit (mm from the paper's top-left). */
export interface BackCell {
  id: string;
  kind: CardModel["kind"];
  front: { x: number; y: number };
  back: { x: number; y: number };
}

/** The back sheet of one front sheet. */
export interface BackPlan {
  /** The front sheet it backs (1-based); in the duplex PDF it is page 2 × sheet. */
  sheet: number;
  kind: CardModel["kind"];
  rows: number;
  cells: BackCell[];
  /** The continuous field, mm from the paper's top-left. */
  field: { left: number; top: number; right: number; bottom: number };
  /** Lowest printed point (the field's lower edge): below it the paper stays blank. */
  inkBottom: number;
}

/**
 * The back sheets: each card's back sits behind its front after a duplex flip on the long edge
 * (the sheet turns over its vertical axis: x → 210 − x, y unchanged). The field covers the
 * mirrored grid rows the front uses, `BACK_BLEED` mm beyond its outer cuts.
 */
export function planBacks(sheets: SheetPlan[]): BackPlan[] {
  const gridLeft = PAGE_W - (GRID_LEFT + COLUMNS * CARD_W);
  return sheets.map((sheet, index) => {
    const cells = sheet.ids.map((id, at) => {
      const front = { x: GRID_LEFT + (at % COLUMNS) * CARD_W, y: GRID_TOP + Math.floor(at / COLUMNS) * CARD_H };
      return { id, kind: sheet.kind, front, back: { x: PAGE_W - front.x - CARD_W, y: front.y } };
    });
    const field = {
      left: gridLeft - BACK_BLEED,
      top: GRID_TOP - BACK_BLEED,
      right: gridLeft + COLUMNS * CARD_W + BACK_BLEED,
      bottom: GRID_TOP + sheet.rows * CARD_H + BACK_BLEED,
    };
    return { sheet: index + 1, kind: sheet.kind, rows: sheet.rows, cells, field, inkBottom: field.bottom };
  });
}

/**
 * Numeric checks of the back plan: one back per front card, in the same deck; turning the
 * sheet over its long edge puts every back exactly on its front; no two backs overlap; the field
 * runs at least `BACK_MIN_BLEED` mm beyond every outer cut and stays on the paper.
 */
export function checkBackPlans(sheets: SheetPlan[], backs: BackPlan[]): string[] {
  const problems: string[] = [];
  const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-9;
  if (backs.length !== sheets.length) problems.push(`${backs.length} back sheets for ${sheets.length} front sheets`);
  backs.forEach((back, index) => {
    const sheet = sheets[index];
    const say = (message: string): void => {
      problems.push(`back of page ${index + 1}: ${message}`);
    };
    if (sheet === undefined) return;
    if (back.cells.map((cell) => cell.id).join() !== sheet.ids.join()) say(`backs [${back.cells.map((cell) => cell.id).join(", ")}], front [${sheet.ids.join(", ")}]`);
    if (back.kind !== sheet.kind || back.cells.some((cell) => cell.kind !== sheet.kind)) say("mixes decks");
    for (const cell of back.cells) {
      // Turning the sheet over its vertical axis maps the back's [x, x + 50] to [210 − x − 50, 210 − x].
      if (!near(PAGE_W - cell.back.x - CARD_W, cell.front.x) || !near(cell.back.y, cell.front.y)) {
        say(`${cell.id}: back at (${cell.back.x}, ${cell.back.y}) lands on (${PAGE_W - cell.back.x - CARD_W}, ${cell.back.y}), front at (${cell.front.x}, ${cell.front.y})`);
      }
    }
    back.cells.forEach((a, i) =>
      back.cells.slice(i + 1).forEach((b) => {
        if (Math.abs(a.back.x - b.back.x) < CARD_W - 1e-9 && Math.abs(a.back.y - b.back.y) < CARD_H - 1e-9) say(`${a.id} and ${b.id} overlap`);
      }),
    );
    const xs = back.cells.map((cell) => cell.back.x);
    const ys = back.cells.map((cell) => cell.back.y);
    const outer = { left: Math.min(...xs), top: Math.min(...ys), right: Math.max(...xs) + CARD_W, bottom: Math.max(...ys) + CARD_H };
    const bleed = Math.min(outer.left - back.field.left, outer.top - back.field.top, back.field.right - outer.right, back.field.bottom - outer.bottom);
    if (bleed < BACK_MIN_BLEED - 1e-9) say(`the field runs only ${bleed} mm beyond the outer cuts (at least ${BACK_MIN_BLEED})`);
    if (back.field.left < 0 || back.field.top < 0 || back.field.right > PAGE_W || back.field.bottom > PAGE_H) say("the field leaves the paper");
  });
  return problems;
}

/** The back's layout in card millimetres (a card is 50 × 71; the medallion centre is at x 25). */
export const BACK_LAYOUT = {
  /** Gold double frame (stroke centres, inset from each cut) and the 回-key fret corners. */
  frame: { outer: 4.2, outerW: 0.3, inner: 4.85, innerW: 0.13, fret: 5.55, fretW: 0.2 },
  /** Medallion radii: band behind the gold rings, inner gold ring, parchment disc. */
  medal: { cx: CARD_W / 2, ring: 13.5, ringW: 0.3, ring2: 12.85, ring2W: 0.13, disc: 12.1, discW: 0.15 },
  /** The seal: two characters, one above the other, on a cinnabar block. */
  seal: { char: 5, gap: 0.35, padX: 1.2, padY: 1.35, radius: 0.45 },
  /** Per language, mm from the card's top edge: medallion centre, divider top, word lines' tops. */
  lang: {
    en: { cy: 29.5, divider: 46.6, game: 49.5, deck: 53.6 },
    zh: { cy: 30.5, divider: 48.3, game: 0 /* no game line: the seal is the name */, deck: 52.1 },
  },
  divider: { width: 24, strokeW: 0.22 },
} as const;

/** The stripes of a field: centre lines x + y = n · pitch, clipped to the field. */
function stripePath(field: BackPlan["field"]): string {
  const p = BACK_STRIPE_PITCH;
  const parts: string[] = [];
  for (let n = Math.floor((field.left + field.top) / p) - 1; n * p <= field.right + field.bottom + p; n += 1) {
    const s = n * p;
    const x1 = Math.max(field.left - p, s - (field.bottom + p));
    const x2 = Math.min(field.right + p, s - (field.top - p));
    if (x2 <= x1) continue;
    parts.push(`M${+x1.toFixed(3)} ${+(s - x1).toFixed(3)}L${+x2.toFixed(3)} ${+(s - x2).toFixed(3)}`);
  }
  return parts.join("");
}

function backCardHtml(cell: BackCell, labels: BackLabels, palette: BackPalette): string {
  const { frame: F, medal: M, seal: S, divider: D } = BACK_LAYOUT;
  const at = BACK_LAYOUT.lang[labels.lang];
  const deck = palette.decks[cell.kind];
  const gold = palette.gold;
  const cy = at.cy;
  const frets = [
    [F.fret, F.fret, 1, 1],
    [CARD_W - F.fret, F.fret, -1, 1],
    [F.fret, CARD_H - F.fret, 1, -1],
    [CARD_W - F.fret, CARD_H - F.fret, -1, -1],
  ]
    .map(([x, y, sx, sy]) => `<g transform="translate(${x} ${y}) scale(${sx} ${sy})">${FRET}</g>`)
    .join("");
  const under =
    `<svg class="back-under" viewBox="0 0 ${CARD_W} ${CARD_H}" aria-hidden="true">` +
    `<rect x="${F.outer}" y="${F.outer}" width="${CARD_W - 2 * F.outer}" height="${CARD_H - 2 * F.outer}" fill="none" stroke="${gold}" stroke-width="${F.outerW}"/>` +
    `<rect x="${F.inner}" y="${F.inner}" width="${CARD_W - 2 * F.inner}" height="${CARD_H - 2 * F.inner}" fill="none" stroke="${gold}" stroke-width="${F.innerW}"/>` +
    `<g fill="none" stroke="${gold}" stroke-width="${F.fretW}" stroke-linecap="square">${frets}</g>` +
    `<circle cx="${M.cx}" cy="${cy}" r="${M.ring}" fill="${deck.ring}" stroke="${gold}" stroke-width="${M.ringW}"/>` +
    `<circle cx="${M.cx}" cy="${cy}" r="${M.ring2}" fill="none" stroke="${gold}" stroke-width="${M.ring2W}"/>` +
    `<circle class="disc" cx="${M.cx}" cy="${cy}" r="${M.disc}"/>` +
    `<g class="back-divider" transform="translate(${M.cx - D.width / 2} ${at.divider}) scale(${D.width / 33})" fill="none" stroke="${gold}" stroke-width="${(D.strokeW * 33) / D.width}" stroke-linecap="round">${DIVIDER_PATHS.replace(/class="dot"/g, `fill="${gold}" stroke="none"`)}</g>` +
    "</svg>";
  const art = `<img class="medal-art" alt="" style="left:${M.cx - M.disc}mm;top:${cy - M.disc}mm;width:${2 * M.disc}mm;height:${2 * M.disc}mm">`;
  const sealW = S.char + 2 * S.padX;
  const sealH = 2 * S.char + S.gap + 2 * S.padY;
  const chars = [...labels.seal];
  const over =
    `<svg class="back-over" viewBox="0 0 ${CARD_W} ${CARD_H}" aria-hidden="true">` +
    `<circle cx="${M.cx}" cy="${cy}" r="${M.disc}" fill="none" stroke="${gold}" stroke-width="${M.discW}"/>` +
    `<rect class="seal" x="${M.cx - sealW / 2}" y="${cy - sealH / 2}" width="${sealW}" height="${sealH}" rx="${S.radius}" fill="${palette.seal}"/>` +
    chars
      .map((char, index) => {
        const y = cy + (index - (chars.length - 1) / 2) * (S.char + S.gap);
        return `<text class="seal-ch" x="${M.cx}" y="${+y.toFixed(3)}" font-size="${S.char}" text-anchor="middle" dominant-baseline="central">${escapeHtml(char)}</text>`;
      })
      .join("") +
    "</svg>";
  const deckName = cell.kind === "starting" ? labels.starting : labels.main;
  const words =
    (labels.game === null ? "" : `<div class="bt game" style="top:${at.game}mm">${escapeHtml(labels.game)}</div>`) +
    `<div class="bt deck" style="top:${at.deck}mm">${escapeHtml(deckName)}</div>`;
  return (
    `<div class="back-card" data-backs="${escapeHtml(cell.id)}" data-kind="${cell.kind}" style="left:${cell.back.x}mm;top:${cell.back.y}mm">` +
    under +
    art +
    over +
    words +
    "</div>"
  );
}

function backSheetHtml(plan: BackPlan, labels: BackLabels, palette: BackPalette): string {
  const deck = palette.decks[plan.kind];
  const f = plan.field;
  const clip = `back-field-${plan.sheet}`;
  const rect = `x="${f.left}" y="${f.top}" width="${+(f.right - f.left).toFixed(3)}" height="${+(f.bottom - f.top).toFixed(3)}"`;
  return (
    `<section class="sheet back" data-side="back" data-sheet="${plan.sheet}" data-kind="${plan.kind}" data-rows="${plan.rows}" data-ink-bottom="${plan.inkBottom}" style="--back-ivory:${palette.ivory}">` +
    `<svg class="back-field" viewBox="0 0 ${PAGE_W} ${PAGE_H}" aria-hidden="true">` +
    `<defs><clipPath id="${clip}"><rect ${rect}/></clipPath></defs>` +
    `<rect class="field" ${rect} fill="${deck.field}"/>` +
    `<path class="stripes" d="${stripePath(f)}" fill="none" stroke="${deck.stripe}" stroke-width="${+(BACK_STRIPE_PITCH / (2 * Math.SQRT2)).toFixed(4)}" clip-path="url(#${clip})"/>` +
    "</svg>" +
    plan.cells.map((cell) => backCardHtml(cell, labels, palette)).join("") +
    "</section>"
  );
}

/**
 * The print document: each front sheet followed by its back sheet (the duplex PDF prints all
 * pages; the fronts-only and backs-only PDFs take the odd and the even pages).
 */
export function buildSheetHtml(options: {
  lang: Lang;
  labels: SheetLabels;
  backLabels: BackLabels;
  palette: BackPalette;
  cards: SheetCard[];
  css: string;
  script: string;
  input: PageInput;
}): { html: string; sheets: SheetPlan[]; backs: BackPlan[] } {
  const { lang, labels, cards } = options;
  const sheets = planSheets(cards);
  const backs = planBacks(sheets.map(({ plan }) => plan));
  const body = sheets
    .map(
      ({ plan, cards: sheetCards }, index) =>
        `<section class="sheet front" data-side="front" data-sheet="${index + 1}" data-rows="${plan.rows}" data-ink-bottom="${plan.inkBottom}">` +
        `<div class="bleed" style="height:${plan.rows * CARD_H + 2 * BLEED}mm"></div>` +
        `<div class="grid" style="height:${plan.rows * CARD_H}mm;grid-template-rows:repeat(${plan.rows},${CARD_H}mm)">${sheetCards.map((card) => cardHtml(card, labels)).join("")}</div>` +
        cutLines(plan.rows) +
        "</section>" +
        backSheetHtml(backs[index] as BackPlan, options.backLabels, options.palette),
    )
    .join("");
  // `</` cannot appear inside the inline JSON or script.
  const inputJson = JSON.stringify(options.input).replace(/</g, "\\u003c");
  const html =
    "<!doctype html>" +
    `<html lang="${lang === "en" ? "en" : "zh-CN"}"><head><meta charset="utf-8">` +
    `<title>${lang === "en" ? "Kiln Opening — Order cards (A4)" : "开窑 · 委托卡（A4）"}</title>` +
    `<style>${options.css}</style></head><body>` +
    DEFS_SVG +
    body +
    `<script>window.__PRINT_INPUT = ${inputJson};</script>` +
    `<script>${options.script.replace(/<\/script/gi, "<\\/script")}</script>` +
    "</body></html>";
  return { html, sheets: sheets.map(({ plan }) => plan), backs };
}
