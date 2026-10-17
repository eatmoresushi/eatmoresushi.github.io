/**
 * Printable A4 sheets of the Kiln Opening Order cards (V1.6.2): 8 Starting + 48 Main Orders,
 * up to 4 × 4 cards of 50 × 71 mm per A4 portrait page with dashed cut lines.
 *
 *   npm run print:orders                                         # English and Chinese
 *   npx vite-node tools/print/printOrderCards.ts --lang en       # one language (en | zh)
 *
 * Output (gitignored), per language:
 *   output/print/kiln-opening-orders-v1.6.2-A4-<lang>.pdf        # fronts, 4 pages: S01–S08, O01–O16, O17–O32, O33–O48
 *   output/print/kiln-opening-orders-v1.6.2-A4-<lang>-duplex.pdf # 8 pages: front 1, back 1, front 2, back 2, …
 *   output/print/kiln-opening-order-backs-v1.6.2-A4-<lang>.pdf   # the 4 back pages alone (manual duplex)
 *   output/print/preview-<lang>-p<N>.png                         # each front page at 150 dpi
 *   output/print/preview-<lang>-back-p<N>.png                    # each back page at 150 dpi
 *   output/print/kiln-opening-orders-v1.6.2-A4-<lang>.html       # the rendered document (fronts and backs), for inspection
 *
 * Each deck starts a new page (sheet.ts). Page 1 holds the 8 Starting Orders in its top two
 * rows; its lower half is blank paper (no parchment, no cut line), which the run checks on the
 * rendered page and on the 150 dpi preview pixels.
 *
 * Two-sided printing: print the duplex PDF with "two-sided, flip on long edge" at 100 % (its
 * viewer preferences ask for exactly that), or print the fronts PDF, turn the stack over and
 * print the backs PDF. Each back sits behind its front for a long-edge flip (sheet.ts), which
 * the run checks on the plan and on the rendered page. The backs of one deck are identical
 * (Main: deep celadon, Starting: deep clay, from the app's tokens), on one continuous striped
 * field 3 mm beyond the outer cuts with every mark at least 4 mm inside each cut, so a 1–2 mm
 * misregistration shows neither white nor a neighbour's frame; the run checks the field and the
 * 4 mm band on the back previews' pixels. All three PDFs come from one rendered document:
 * the fronts PDF takes its odd pages, the backs PDF its even pages.
 *
 * Content: the V1.6.2 rulebooks' Appendix A tables (English and Chinese), cross-checked against
 * data/orders.json by `orderSource.ts`, which also takes the expected Order IDs from the
 * rulebooks' own table headings; the run fails loudly on any mismatch. Art: the game's
 * 20 neutral ceramic cutouts (assets/current_v04/ceramics) tinted with the light-theme
 * `--glz-*` colours from src/app/styles/tokens.css (White and Grey-Green at a higher print
 * density, see `PRINT_DENSITY`), and the game's coin and crown icons.
 * Fonts: local Iowan Old Style (English) and Songti SC (Chinese), embedded by Chromium;
 * the run fails if any text falls back to another font.
 *
 * The PDF is finished after Chromium writes it: its pages get the exact A4 MediaBox (Chromium
 * rounds the page to 594.96 × 841.92 pt), and an incremental update sets the viewer preference
 * PrintScaling /None (Chrome and Acrobat then default to actual size) and a Subject saying to
 * print at 100 %. Nothing is printed in the page margins, which most printers cannot reach.
 * The run refuses a PDF holding a repeating tiling pattern: Apple's PDF renderer (Preview, and
 * printing from it) seams such tiles, so each card's parchment is one opaque image (cardPage.js).
 *
 * Rendering uses Playwright's Chromium (`@playwright/test`); no network access is needed.
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";
import { checkIllustration, illustrationFor } from "./illustration.ts";
import { APP_ROOT, loadOrderSource } from "./orderSource.ts";
import type { Lang, OrderSource } from "./orderSource.ts";
import { BACK_LAYOUT, BACK_MIN_BLEED, BACK_SAFE, buildSheetHtml, CARD_H, CARD_W, CARDS_PER_SHEET, checkBackPlans, PAGE_H, PAGE_W } from "./sheet.ts";
import type { BackArt, BackPalette, BackPlan, FitSettings, PageInput, SheetCard, SheetPlan } from "./sheet.ts";

const OUT_DIR = resolve(APP_ROOT, "output/print");
const CERAMICS_DIR = resolve(APP_ROOT, "assets/current_v04/ceramics");
const TOKENS_CSS = resolve(APP_ROOT, "src/app/styles/tokens.css");
const HERE = import.meta.dirname;

/**
 * The medallion's drawing: the kiln of the live board's ink illustration (1536 × 1024 px; its
 * README names it the current default), cropped round the kiln (x 975–1535, the chimney at the
 * crop's centre line) and drawn 18 mm wide in the 24.2 mm disc, so the chimney cone sits near the
 * disc's top and the chambers behind the seal; `strength` is the darkest sepia ink before the
 * fades (cardPage.js `medalArt`). Set `strength` to 0 for a plain parchment disc.
 */
const BACK_ART_FILE = "assets/current_v04/illustrated-board/pottery-village-ink.webp";
const BACK_ART: Omit<BackArt, "url"> = {
  crop: { x: 975, y: 0, w: 560, h: 860 },
  place: { left: 3.1, top: 1.6, width: 18 },
  strength: 0.42,
};

/** Fonts the backs may and must use (EN: titling for the words, Songti Bold for the seal). */
const BACK_FONTS: Record<Lang, { allowed: RegExp; needed: string[] }> = {
  en: { allowed: /^(IowanOldStyle-Titling|STSongti-SC-Bold)$/, needed: ["IowanOldStyle-Titling", "STSongti-SC-Bold"] },
  zh: { allowed: /^STSongti-SC-Bold$/, needed: ["STSongti-SC-Bold"] },
};
/** The back's 4 mm band is checked on the 150 dpi pixels this much short of 4 mm (antialiasing and the preview's sub-pixel offset). */
const BAND_PIXEL_SLACK_MM = 0.3;

const SHAPES = ["bowl", "plate", "washer", "vase", "censer"] as const;
const DECORATIONS = ["plain", "carved", "impressed", "painted"] as const;
const GLAZES = ["white", "celadon", "grey_green", "moon_white"] as const;

const PREVIEW_DPI = 150;
/** Fonts the cards may use: PostScript-name prefixes (EN: Iowan; ZH: Iowan for Latin, Songti SC for Chinese). */
const ALLOWED_FONTS: Record<Lang, RegExp> = {
  en: /^IowanOldStyle-/,
  zh: /^(IowanOldStyle-|STSongti-SC-)/,
};

const FIT: Record<Lang, FitSettings> = {
  en: { req: { size: 8.2, leading: 1.15, minLeading: 1.08, keepWhole: 0.3, min: 6.4 }, qual: { max: 9.6, min: 7 } },
  zh: { req: { size: 8.6, leading: 1.3, minLeading: 1.2, keepWhole: 0.3, min: 6.6 }, qual: { max: 9.4, min: 7 } },
};

/**
 * Print density of each Glaze tint: the token colour is multiplied in `density` times (each
 * channel c → c^density; 1 = exactly as on screen). On paper the light-theme White token is
 * nearly the untinted cutout that stands for "any Glaze", and Grey-Green sits close to Celadon,
 * so those two print denser: White reads as ivory, Grey-Green as a darker olive. The hues are
 * the game's. Set every density to 1 to print the screen colours exactly.
 */
const PRINT_DENSITY: Record<(typeof GLAZES)[number], number> = { white: 2, celadon: 1, grey_green: 1.3, moon_white: 1 };
/** The pictures must keep every two Glazes (and "any Glaze") at least this far apart (ΔE76). */
const MIN_GLAZE_DELTA_E = 10;

/** Exact A4 in PDF points. */
const A4_PT = { width: (210 / 25.4) * 72, height: (297 / 25.4) * 72 };

/** The three PDFs: which pages of the document they hold, their Subject (a print note) and duplex preference. */
type PdfKind = "fronts" | "duplex" | "backs";
const PDF_SUBJECT: Record<Lang, Record<PdfKind, string>> = {
  en: {
    fronts:
      "Kiln Opening Order cards, V1.6.2 Player Rulebook Appendix A: Starting and Main Orders. A4; print at 100 % (actual size), each card 50 × 71 mm. For card backs use the -duplex PDF, or the order-backs PDF for manual duplex.",
    duplex:
      "Kiln Opening Order cards with backs, V1.6.2 Appendix A: front 1, back 1, front 2, back 2 … A4; print two-sided (duplex), flip on long edge, at 100 % (actual size); each card 50 × 71 mm.",
    backs:
      "Kiln Opening Order card backs, V1.6.2: the backs of the 4 front pages, for manual duplex. Print the fronts PDF, turn the stack over (flip on long edge: top stays at the top), then print this at 100 % (actual size).",
  },
  zh: {
    fronts: "开窑委托卡，V1.6.2规则书附录A：起始委托与主委托。A4纸，按100%实际尺寸打印，每张卡50 × 71毫米。卡背请用 -duplex 文件，手动双面请用 order-backs 文件。",
    duplex: "开窑委托卡（含卡背），V1.6.2规则书附录A：正面1、背面1、正面2、背面2……A4纸，双面打印，沿长边翻转，按100%实际尺寸打印；每张卡50 × 71毫米。",
    backs: "开窑委托卡背面，V1.6.2：4页正面的背面，用于手动双面打印。先打印正面文件，把整叠纸翻面（沿长边翻转，上边仍在上），再按100%实际尺寸打印本文件。",
  },
};
/** Viewer preference /Duplex: the duplex PDF asks for flip on long edge, the one-sided ones for simplex. */
const PDF_DUPLEX: Record<PdfKind, "DuplexFlipLongEdge" | "Simplex"> = { fronts: "Simplex", duplex: "DuplexFlipLongEdge", backs: "Simplex" };

class PrintError extends Error {
  override name = "PrintError";
}

function parseLangs(argv: string[]): Lang[] {
  const langs: Lang[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    let value: string | undefined;
    if (arg === "--lang") value = argv[++index];
    else if (arg.startsWith("--lang=")) value = arg.slice("--lang=".length);
    else continue;
    for (const lang of (value ?? "").split(",")) {
      if (lang !== "en" && lang !== "zh") throw new PrintError(`--lang must be en or zh (got "${lang}")`);
      if (!langs.includes(lang)) langs.push(lang);
    }
  }
  return langs.length > 0 ? langs : ["en", "zh"];
}

/** Light-theme colour tokens from the app's design tokens (the first definition is the light theme). */
function lightTokens<Name extends string>(names: readonly Name[]): Record<Name, string> {
  const css = readFileSync(TOKENS_CSS, "utf8");
  const colours = {} as Record<Name, string>;
  for (const name of names) {
    const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\b`).exec(css);
    if (match?.[1] === undefined) throw new PrintError(`${TOKENS_CSS}: --${name} not found`);
    colours[name] = match[1].toLowerCase();
  }
  return colours;
}

/** The light-theme Glaze colours. */
function glazeTokens(): Record<(typeof GLAZES)[number], string> {
  const tokens = lightTokens(GLAZES.map((glaze) => `glz-${glaze}` as const));
  return Object.fromEntries(GLAZES.map((glaze) => [glaze, tokens[`glz-${glaze}`]])) as Record<(typeof GLAZES)[number], string>;
}

const rgbOf = (hex: string): [number, number, number] => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16)) as [number, number, number];
const hexOf = (rgb: number[]): string => `#${rgb.map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`;

/** A token colour at a print density (each channel c → c^density). */
function atDensity(hex: string, density: number): string {
  return hexOf(rgbOf(hex).map((value) => 255 * (value / 255) ** density));
}

/** `a` mixed with `t` of `b` (sRGB channels). */
function mix(a: string, b: string, t: number): string {
  const [ra, rb] = [rgbOf(a), rgbOf(b)];
  return hexOf(ra.map((value, index) => value * (1 - t) + (rb[index] ?? 0) * t));
}

/**
 * The backs' colours, from the app's light-theme tokens. Main Orders: the online card back's
 * pair (CardBack.css: --celadon-ink stripes with --celadon), as a deep --celadon-ink field with
 * stripes a quarter of the way to --celadon. Starting Orders: the unglazed-clay token --glz-clay
 * printed at density 3.5 (as the fronts deepen their Glaze tints), a deep clay, with stripes a
 * fifth of the way back to --glz-clay. The medallion's band is the field a little deeper; frame
 * and rings in --gold-line, words in --gold-pale, the seal in --cinnabar.
 */
function backPalette(): { palette: BackPalette; summary: string } {
  const t = lightTokens(["celadon-ink", "celadon", "glz-clay", "gold-line", "gold-pale", "cinnabar"] as const);
  const clay = atDensity(t["glz-clay"], 3.5);
  const palette: BackPalette = {
    decks: {
      main: { field: t["celadon-ink"], stripe: mix(t["celadon-ink"], t.celadon, 0.24), ring: atDensity(t["celadon-ink"], 1.2) },
      starting: { field: clay, stripe: mix(clay, t["glz-clay"], 0.2), ring: atDensity(clay, 1.2) },
    },
    gold: t["gold-line"],
    ivory: t["gold-pale"],
    seal: t.cinnabar,
  };
  const deck = (kind: "main" | "starting"): string => `field ${palette.decks[kind].field}, stripes ${palette.decks[kind].stripe}`;
  return { palette, summary: `Main ${deck("main")}; Starting (--glz-clay ${t["glz-clay"]}^3.5) ${deck("starting")}; gold ${palette.gold}, words ${palette.ivory}, seal ${palette.seal}` };
}

/** The print tints: the game's light-theme Glaze tokens at their print densities. */
function glazeColours(): { tints: Record<string, string>; summary: string } {
  const tokens = glazeTokens();
  const tints: Record<string, string> = {};
  const summary: string[] = [];
  for (const glaze of GLAZES) {
    tints[glaze] = atDensity(tokens[glaze], PRINT_DENSITY[glaze]);
    summary.push(PRINT_DENSITY[glaze] === 1 ? `${glaze} ${tokens[glaze]}` : `${glaze} ${tokens[glaze]}^${PRINT_DENSITY[glaze]} = ${tints[glaze]}`);
  }
  return { tints, summary: summary.join(", ") };
}

function cutouts(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const shape of SHAPES) {
    for (const decoration of DECORATIONS) {
      const file = resolve(CERAMICS_DIR, `ceramic-${shape}-${decoration}-v1.webp`);
      result[`${shape}-${decoration}`] = `data:image/webp;base64,${readFileSync(file).toString("base64")}`;
    }
  }
  return result;
}

interface PageReport {
  errors: string[];
  info: string[];
  sizes: Record<string, { req: number | null; reqLeading: number | null; reqWrapped: boolean | null; qual?: number; icon?: number; qualFit: number | null; iconFit: number | null }>;
}

async function renderPage(browser: Browser, html: string, deviceScaleFactor: number): Promise<{ page: Page; report: PageReport }> {
  const context = await browser.newContext({ viewport: { width: 794, height: 1123 }, deviceScaleFactor });
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(String(error)));
  await page.emulateMedia({ media: "print" });
  await page.setContent(html, { waitUntil: "load" });
  await page.waitForFunction(() => (window as unknown as { __PRINT_READY?: boolean }).__PRINT_READY === true, null, { timeout: 180_000 });
  const report = (await page.evaluate(() => (window as unknown as { __PRINT_REPORT: unknown }).__PRINT_REPORT)) as PageReport;
  report.errors.push(...consoleErrors.map((text) => `console: ${text}`));
  return { page, report };
}

/** The text elements of the fronts and of the backs, for the font check. */
const FRONT_TEXT =
  ".card .id, .card .kind, .card .h, .card .req p, .card .req .seg, .card .req .mp, .card .req .pz, .card .qual p, .card .qual .seg, .card .qual .mp, .card .qual .pz, .card .vp-num, .card .vp-badge text";
const BACK_TEXT = ".back-card .bt, .back-card .seal-ch";

/** Every font Chromium actually used for the text of `selector`, by PostScript name, via the DevTools protocol. */
async function usedFonts(page: Page, selector: string): Promise<Map<string, number>> {
  const client = await page.context().newCDPSession(page);
  await client.send("DOM.enable");
  await client.send("CSS.enable");
  const { root } = await client.send("DOM.getDocument", { depth: -1 });
  const { nodeIds } = await client.send("DOM.querySelectorAll", { nodeId: root.nodeId, selector });
  const fonts = new Map<string, number>();
  for (const nodeId of nodeIds) {
    const { fonts: platform } = await client.send("CSS.getPlatformFontsForNode", { nodeId });
    for (const font of platform) {
      const name = font.postScriptName || font.familyName;
      fonts.set(name, (fonts.get(name) ?? 0) + font.glyphCount);
    }
  }
  await client.detach();
  return fonts;
}

/**
 * Tiling patterns whose cells abut or overlap, i.e. a tile meant to repeat across the page
 * (Chromium writes a repeated CSS background that way). Apple's PDF renderer (Preview, and
 * printing from it) shows faint hairline seams where such cells meet, so the sheets use none;
 * Chromium's one-off patterns, whose step leaves a gap after the cell, are fine.
 */
function repeatingPatterns(bytes: string): string[] {
  const found: string[] = [];
  for (const match of bytes.matchAll(/\/PatternType\s+1\b([\s\S]*?)\bstream\b/g)) {
    const dict = match[1] ?? "";
    const box = /\/BBox\s*\[([^\]]*)\]/.exec(dict)?.[1]?.trim().split(/\s+/).map(Number);
    const xStep = Number(/\/XStep\s+([-\d.]+)/.exec(dict)?.[1]);
    const yStep = Number(/\/YStep\s+([-\d.]+)/.exec(dict)?.[1]);
    if (box === undefined || box.length !== 4 || box.some((n) => !Number.isFinite(n)) || !Number.isFinite(xStep) || !Number.isFinite(yStep)) {
      found.push(`unreadable tiling pattern at byte ${match.index}`);
      continue;
    }
    const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = box;
    if (Math.abs(xStep) <= x1 - x0 + 0.01 || Math.abs(yStep) <= y1 - y0 + 0.01) found.push(`cell ${(x1 - x0).toFixed(2)} × ${(y1 - y0).toFixed(2)}, step ${xStep} × ${yStep} (byte ${match.index})`);
  }
  return found;
}

interface PdfFacts {
  pages: number;
  embedded: number;
  baseFonts: string[];
  /** Font descriptors without an embedded font program (/FontFile, /FontFile2 or /FontFile3). */
  unembedded: string[];
  mediaBoxes: string[];
  printScalingNone: boolean;
  /** The last /Duplex viewer preference, or null. */
  duplex: string | null;
  subject: string | null;
  repeating: string[];
  tilingPatterns: number;
}

/** Reads a UTF-16BE hex PDF string (as `pdfText` writes it). */
function readPdfText(hex: string): string {
  const body = hex.replace(/^FEFF/i, "");
  let text = "";
  for (let at = 0; at + 4 <= body.length; at += 4) text += String.fromCharCode(parseInt(body.slice(at, at + 4), 16));
  return text;
}

/** Page count, page sizes, embedded font programs, print preferences, Subject and repeating tiles of a Chromium PDF. */
function inspectPdf(path: string): PdfFacts {
  const bytes = readFileSync(path).toString("latin1");
  const pages = (bytes.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
  const embedded = (bytes.match(/\/FontFile[23]?\b/g) ?? []).length;
  const baseFonts = [...new Set([...bytes.matchAll(/\/BaseFont\s*\/([^\s/<>\[\]]+)/g)].map((match) => match[1] ?? ""))].sort();
  const unembedded = [...bytes.matchAll(/<<((?:(?!>>)[\s\S])*?\/Type\s*\/FontDescriptor\b(?:(?!>>)[\s\S])*?)>>/g)]
    .filter((match) => !/\/FontFile[23]?\s+\d+\s+0\s+R/.test(match[1] ?? ""))
    .map((match) => /\/FontName\s*\/([^\s/<>\[\]]+)/.exec(match[1] ?? "")?.[1] ?? "(unnamed)");
  const mediaBoxes = [...bytes.matchAll(/\/MediaBox\s*\[([^\]]*)\]/g)].map((match) => (match[1] ?? "").trim().split(/\s+/).join(" "));
  const tilingPatterns = (bytes.match(/\/PatternType\s+1\b/g) ?? []).length;
  const duplex = [...bytes.matchAll(/\/Duplex\s*\/(\w+)/g)].at(-1)?.[1] ?? null;
  const subjectHex = [...bytes.matchAll(/\/Subject\s*<([0-9A-Fa-f]*)>/g)].at(-1)?.[1];
  return {
    pages,
    embedded,
    baseFonts,
    unembedded,
    mediaBoxes,
    printScalingNone: /\/PrintScaling\s*\/None/.test(bytes),
    duplex,
    subject: subjectHex === undefined ? null : readPdfText(subjectHex),
    repeating: repeatingPatterns(bytes),
    tilingPatterns,
  };
}

/** A UTF-16BE PDF text string (hex, with byte-order mark). */
function pdfText(text: string): string {
  let hex = "FEFF";
  for (let index = 0; index < text.length; index += 1) hex += text.charCodeAt(index).toString(16).padStart(4, "0").toUpperCase();
  return `<${hex}>`;
}

/** The dictionary body of object `num` (the last definition in the file). */
function objectDict(bytes: string, num: number): string {
  const matches = [...bytes.matchAll(new RegExp(`(?:^|[\\r\\n])${num} 0 obj\\s*<<([\\s\\S]*?)>>\\s*endobj`, "g"))];
  const body = matches.at(-1)?.[1];
  if (body === undefined) throw new PrintError(`PDF: object ${num} is not a plain dictionary`);
  return body;
}

/**
 * Finishes Chromium's PDF:
 * 1. every page's MediaBox becomes exact A4 (595.276 × 841.890 pt). The numbers are rewritten
 *    in place at the same byte length (padded with spaces), so no object moves;
 * 2. an incremental update (new Catalog and Info objects, an xref section and a trailer with
 *    /Prev) adds the viewer preferences /PrintScaling /None and /Duplex (the print dialog's
 *    default: two-sided flip on long edge, or one-sided) and the Subject.
 */
function finishPdf(path: string, subject: string, duplex: "DuplexFlipLongEdge" | "Simplex"): void {
  let bytes = readFileSync(path).toString("latin1");
  let boxes = 0;
  bytes = bytes.replace(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g, (match) => {
    boxes += 1;
    for (let digits = 5; digits >= 2; digits -= 1) {
      const exact = `/MediaBox [0 0 ${A4_PT.width.toFixed(digits)} ${A4_PT.height.toFixed(digits)}`;
      if (exact.length + 1 <= match.length) return `${exact}${" ".repeat(match.length - exact.length - 1)}]`;
    }
    throw new PrintError(`PDF: cannot rewrite "${match}" in place`);
  });
  if (boxes === 0) throw new PrintError("PDF: no page MediaBox found");

  const tail = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(bytes);
  const trailer = [...bytes.matchAll(/trailer\s*<<([\s\S]*?)>>\s*startxref/g)].at(-1)?.[1];
  if (tail?.[1] === undefined || trailer === undefined) throw new PrintError("PDF: no classic trailer (startxref / trailer dictionary)");
  const ref = (key: string): number => {
    const match = new RegExp(`/${key}\\s+(\\d+)\\s+0\\s+R`).exec(trailer);
    if (match?.[1] === undefined) throw new PrintError(`PDF: trailer has no /${key}`);
    return Number(match[1]);
  };
  const size = Number(/\/Size\s+(\d+)/.exec(trailer)?.[1] ?? Number.NaN);
  const root = ref("Root");
  const info = ref("Info");

  const catalog = objectDict(bytes, root);
  const withoutPrefs = catalog.replace(/\/ViewerPreferences\s*<<[^<>]*>>/, "");
  if (/\/ViewerPreferences/.test(withoutPrefs)) throw new PrintError("PDF: the Catalog's ViewerPreferences is not an inline dictionary");
  const oldPrefs = /\/ViewerPreferences\s*<<([^<>]*)>>/.exec(catalog)?.[1] ?? "/Type /ViewerPreferences";
  const prefs = `${oldPrefs.replace(/\/PrintScaling\s*\/\w+/, "").replace(/\/Duplex\s*\/\w+/, "").trim()}\n/PrintScaling /None\n/Duplex /${duplex}`;
  const infoDict = objectDict(bytes, info).replace(/\/Subject\s*(\([^)]*\)|<[^>]*>)/, "").trim();

  if (!bytes.endsWith("\n")) bytes += "\n";
  const offsets = new Map<number, number>();
  offsets.set(root, bytes.length);
  bytes += `${root} 0 obj\n<<${withoutPrefs.trim()}\n/ViewerPreferences <<${prefs}>>>>\nendobj\n`;
  offsets.set(info, bytes.length);
  bytes += `${info} 0 obj\n<<${infoDict}\n/Subject ${pdfText(subject)}>>\nendobj\n`;
  const xref = bytes.length;
  bytes += "xref\n";
  for (const num of [...offsets.keys()].sort((a, b) => a - b)) bytes += `${num} 1\n${String(offsets.get(num)).padStart(10, "0")} 00000 n \n`;
  bytes += `trailer\n<</Size ${size}\n/Root ${root} 0 R\n/Info ${info} 0 R\n/Prev ${tail[1]}>>\nstartxref\n${xref}\n%%EOF\n`;
  for (const [num, offset] of offsets) {
    if (!bytes.startsWith(`${num} 0 obj`, offset)) throw new PrintError(`PDF: the update's xref entry for object ${num} does not point at it`);
  }
  if (!bytes.startsWith("xref", xref)) throw new PrintError("PDF: startxref does not point at the update's xref section");
  writeFileSync(path, Buffer.from(bytes, "latin1"));
}

/**
 * The sheets print every card once, in the rulebook's order; each deck starts a new sheet and
 * fills sheets of 16, the Starting deck first (V1.6.2: page 1 is S01–S08 alone).
 */
function checkSheets(source: OrderSource, lang: Lang, sheets: SheetPlan[]): string[] {
  const problems: string[] = [];
  const kindOf = new Map(source.cards[lang].map((card) => [card.id, card.kind]));
  const order = source.cards[lang].map((card) => card.id);
  const printed = sheets.flatMap((sheet) => sheet.ids);
  if (printed.join() !== order.join()) problems.push(`the sheets print [${printed.join(", ")}], the rulebook lists [${order.join(", ")}]`);
  const want = { starting: Math.ceil(source.deckSizes.starting / CARDS_PER_SHEET), main: Math.ceil(source.deckSizes.main / CARDS_PER_SHEET) };
  const kinds = sheets.map((sheet) => sheet.kind);
  const expectedKinds = [...Array<string>(want.starting).fill("starting"), ...Array<string>(want.main).fill("main")];
  if (kinds.join() !== expectedKinds.join()) problems.push(`sheet decks [${kinds.join(", ")}], expected [${expectedKinds.join(", ")}]`);
  sheets.forEach((sheet, index) => {
    if (sheet.ids.some((id) => kindOf.get(id) !== sheet.kind)) problems.push(`page ${index + 1} mixes decks: ${sheet.ids.join(", ")}`);
    if (sheet.rows !== Math.ceil(sheet.ids.length / 4)) problems.push(`page ${index + 1}: ${sheet.rows} rows for ${sheet.ids.length} cards`);
  });
  return problems;
}

/** "page 1: S01–S08 (rows 1–2; rows 3–4 blank)". */
function describeSheet(sheet: SheetPlan, index: number): string {
  const range = sheet.ids.length === 1 ? sheet.ids[0] : `${sheet.ids[0]}–${sheet.ids.at(-1)}`;
  return `page ${index + 1}: ${range}${sheet.rows < 4 ? ` (rows 1–${sheet.rows}; rows ${sheet.rows + 1}–4 blank below ${sheet.inkBottom} mm)` : ""}`;
}

/**
 * On a sheet that is not full, the 150 dpi preview must be pure white from just below its
 * lowest printed point (`inkBottom`, plus 0.3 mm for antialiasing) to the paper's bottom edge.
 */
async function checkBlankBelow(page: Page, sheet: Pick<SheetPlan, "rows" | "inkBottom">, png: Buffer): Promise<string | null> {
  if (sheet.rows === 4) return null;
  const from = (sheet.inkBottom + 0.3) / PAGE_H;
  const result = await page.evaluate(
    async ({ url, from }) => {
      const img = new Image();
      img.src = url;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (ctx === null) return { error: "no 2D canvas" };
      ctx.drawImage(img, 0, 0);
      const top = Math.ceil(from * img.naturalHeight);
      const data = ctx.getImageData(0, top, img.naturalWidth, img.naturalHeight - top).data;
      let marked = 0;
      let firstRow = -1;
      for (let index = 0; index < data.length; index += 4) {
        if (data[index] !== 255 || data[index + 1] !== 255 || data[index + 2] !== 255) {
          marked += 1;
          if (firstRow < 0) firstRow = top + Math.floor(index / 4 / img.naturalWidth);
        }
      }
      return { width: img.naturalWidth, height: img.naturalHeight, top, marked, firstRow };
    },
    { url: `data:image/png;base64,${png.toString("base64")}`, from },
  );
  if ("error" in result) return `blank-area check: ${result.error}`;
  if (Math.abs(result.width / result.height - PAGE_W / PAGE_H) > 0.002) return `blank-area check: preview is ${result.width} × ${result.height} px, not A4`;
  if (result.marked > 0) {
    return `${result.marked} non-white pixels in the blank area below ${sheet.inkBottom} mm (first at ${((result.firstRow / result.height) * PAGE_H).toFixed(1)} mm)`;
  }
  return null;
}

/**
 * A back page's 150 dpi preview, pixel by pixel: outside the field the paper is pure white (no
 * cut line, no stray mark; on page 1 the blank half); inside the field, every pixel outside the
 * cards' inner areas (the bleed, and the band within `BACK_SAFE` mm of every cut, less
 * `BAND_PIXEL_SLACK_MM` for antialiasing) is the field: its colour, its stripe colour or a blend
 * of the two. So a misregistered back can show neither white nor a seam nor a neighbour's mark at
 * a cut. A Playwright element screenshot starts on the whole CSS pixel at or above the element
 * (its `enclosingIntRect`), so the page sits `offset` device px right of and below the image's
 * corner; the pixels are judged with that offset, give or take a pixel of rasterisation, which
 * `BAND_PIXEL_SLACK_MM` and the 2 px left unjudged along the field's own edge (antialiased
 * against the paper) absorb. The field's edges must also be found on the image within 2 px of
 * the plan.
 */
async function checkBackPixels(
  page: Page,
  plan: BackPlan,
  colours: { field: string; stripe: string },
  png: Buffer,
  offset: { x: number; y: number },
): Promise<{ problems: string[]; judged: { field: number; white: number }; shift: number }> {
  const band = BACK_SAFE - BAND_PIXEL_SLACK_MM;
  const inner = plan.cells.map((cell) => ({ left: cell.back.x + band, top: cell.back.y + band, right: cell.back.x + CARD_W - band, bottom: cell.back.y + CARD_H - band }));
  const result = await page.evaluate(
    async ({ url, field, inner, base, stripe, pxPerMm, offset }) => {
      const img = new Image();
      img.src = url;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (ctx === null) return { error: "no 2D canvas" };
      ctx.drawImage(img, 0, 0);
      const { width, height } = canvas;
      const data = ctx.getImageData(0, 0, width, height).data;
      const white = (x: number, y: number): boolean => {
        const i = (y * width + x) * 4;
        return data[i] === 255 && data[i + 1] === 255 && data[i + 2] === 255;
      };
      // The field's edges as planned (image px) and as found along its middle row and column.
      const edge = { left: field.left * pxPerMm + offset.x, right: field.right * pxPerMm + offset.x, top: field.top * pxPerMm + offset.y, bottom: field.bottom * pxPerMm + offset.y };
      const midX = Math.round((edge.left + edge.right) / 2);
      const midY = Math.round((edge.top + edge.bottom) / 2);
      let left = 0;
      while (left < width - 1 && white(left, midY)) left += 1;
      let right = width - 1;
      while (right > 0 && white(right, midY)) right -= 1;
      let top = 0;
      while (top < height - 1 && white(midX, top)) top += 1;
      let bottom = height - 1;
      while (bottom > 0 && white(midX, bottom)) bottom -= 1;
      // An edge at e px touches pixels from floor(e) (a left or top edge) or up to ceil(e) − 1.
      const misses = [left - Math.floor(edge.left), right - (Math.ceil(edge.right) - 1), top - Math.floor(edge.top), bottom - (Math.ceil(edge.bottom) - 1)];
      const found = { left, right, top, bottom, miss: Math.max(...misses.map(Math.abs)) };
      const dx = offset.x;
      const dy = offset.y;
      const [b0 = 0, b1 = 0, b2 = 0] = base;
      const [d0, d1, d2] = [(stripe[0] ?? 0) - b0, (stripe[1] ?? 0) - b1, (stripe[2] ?? 0) - b2];
      const dd = d0 * d0 + d1 * d1 + d2 * d2;
      let whitePixels = 0;
      let fieldPixels = 0;
      const bad = { white: 0, field: 0, firstWhite: "", firstField: "", worst: 0 };
      for (let y = 0; y < height; y += 1) {
        const cy = y + 0.5;
        const ymm = (cy - dy) / pxPerMm;
        for (let x = 0; x < width; x += 1) {
          const cx = x + 0.5;
          const i = (y * width + x) * 4;
          const r = data[i] ?? 0;
          const g = data[i + 1] ?? 0;
          const b = data[i + 2] ?? 0;
          if (cx < edge.left - 2 || cx > edge.right + 2 || cy < edge.top - 2 || cy > edge.bottom + 2) {
            whitePixels += 1;
            if (r !== 255 || g !== 255 || b !== 255) {
              bad.white += 1;
              if (bad.firstWhite === "") bad.firstWhite = `(${((cx - dx) / pxPerMm).toFixed(1)}, ${ymm.toFixed(1)}) mm rgb(${r}, ${g}, ${b})`;
            }
            continue;
          }
          if (cx < edge.left + 2 || cx > edge.right - 2 || cy < edge.top + 2 || cy > edge.bottom - 2) continue;
          const xmm = (cx - dx) / pxPerMm;
          if (inner.some((box) => xmm >= box.left && xmm <= box.right && ymm >= box.top && ymm <= box.bottom)) continue;
          fieldPixels += 1;
          // Distance from the segment field colour → stripe colour.
          const t = Math.min(1, Math.max(0, ((r - b0) * d0 + (g - b1) * d1 + (b - b2) * d2) / dd));
          const off = Math.hypot(r - (b0 + t * d0), g - (b1 + t * d1), b - (b2 + t * d2));
          if (off > bad.worst) bad.worst = off;
          if (off > 6) {
            bad.field += 1;
            if (bad.firstField === "") bad.firstField = `(${xmm.toFixed(1)}, ${ymm.toFixed(1)}) mm rgb(${r}, ${g}, ${b})`;
          }
        }
      }
      return { width, height, found, white: whitePixels, fieldPixels, bad };
    },
    { url: `data:image/png;base64,${png.toString("base64")}`, field: plan.field, inner, base: rgbOf(colours.field), stripe: rgbOf(colours.stripe), pxPerMm: PREVIEW_DPI / 25.4, offset },
  );
  if ("error" in result) return { problems: [`back pixel check: ${result.error ?? "failed"}`], judged: { field: 0, white: 0 }, shift: 0 };
  const problems: string[] = [];
  const pageW = (PAGE_W / 25.4) * PREVIEW_DPI;
  const pageH = (PAGE_H / 25.4) * PREVIEW_DPI;
  // Whole CSS pixels around the page: up to 1 CSS px (1.6 device px) more than the page.
  if (result.width < pageW - 1 || result.width > pageW + 2.2 || result.height < pageH - 1 || result.height > pageH + 2.2) {
    problems.push(`back preview is ${result.width} × ${result.height} px, not A4 at ${PREVIEW_DPI} dpi (${pageW.toFixed(1)} × ${pageH.toFixed(1)})`);
  }
  const { found } = result;
  if (found.miss > 2) {
    problems.push(`the field's edges on the preview (x ${found.left}–${found.right}, y ${found.top}–${found.bottom} px) are up to ${found.miss} px from where the plan puts them`);
  }
  if (result.bad.white > 0) problems.push(`${result.bad.white} non-white pixels outside the field (first at ${result.bad.firstWhite})`);
  if (result.bad.field > 0) problems.push(`${result.bad.field} pixels in the bleed or the ${BACK_SAFE} mm band are not the field (first at ${result.bad.firstField}; largest colour distance ${result.bad.worst.toFixed(1)})`);
  if (result.fieldPixels === 0 || result.white === 0) problems.push("back pixel check judged no pixels");
  return { problems, judged: { field: result.fieldPixels, white: result.white }, shift: found.miss };
}

async function printLanguage(
  browser: Browser,
  source: OrderSource,
  lang: Lang,
  art: Map<string, SheetCard["art"]>,
  input: Omit<PageInput, "lang" | "fit">,
  palette: BackPalette,
): Promise<void> {
  const cards: SheetCard[] = source.cards[lang].map((card) => {
    const illustration = art.get(card.id);
    if (illustration === undefined) throw new PrintError(`${card.id}: no illustration`);
    return { card, art: illustration };
  });
  const { html, sheets: plans, backs } = buildSheetHtml({
    lang,
    labels: source.labels[lang],
    backLabels: source.backLabels[lang],
    palette,
    cards,
    css: readFileSync(resolve(HERE, "cards.css"), "utf8"),
    script: readFileSync(resolve(HERE, "cardPage.js"), "utf8"),
    input: { ...input, lang, fit: FIT[lang] },
  });
  const sheetProblems = [...checkSheets(source, lang, plans), ...checkBackPlans(plans, backs)];
  if (sheetProblems.length > 0) throw new PrintError(`${lang}: sheet plan check failed:\n  - ${sheetProblems.join("\n  - ")}`);
  const sheets = plans.length;
  const base = `kiln-opening-orders-v1.6.2-A4-${lang}`;
  writeFileSync(resolve(OUT_DIR, `${base}.html`), html);

  // PDFs: the document rendered once at device scale 1 in print media. It holds front 1, back 1,
  // front 2, back 2 …: the duplex PDF prints every page, the fronts and backs PDFs the odd and
  // the even pages.
  const pdfRun = await renderPage(browser, html, 1);
  if (pdfRun.report.errors.length > 0) throw new PrintError(`${lang}: card check failed:\n  - ${pdfRun.report.errors.join("\n  - ")}`);
  const fonts = await usedFonts(pdfRun.page, FRONT_TEXT);
  const strange = [...fonts.keys()].filter((name) => !ALLOWED_FONTS[lang].test(name));
  if (strange.length > 0) {
    throw new PrintError(`${lang}: text fell back to other fonts: ${strange.map((name) => `${name} (${fonts.get(name)} glyphs)`).join(", ")}`);
  }
  const backFonts = await usedFonts(pdfRun.page, BACK_TEXT);
  const backStrange = [...backFonts.keys()].filter((name) => !BACK_FONTS[lang].allowed.test(name));
  const backMissing = BACK_FONTS[lang].needed.filter((name) => !backFonts.has(name));
  if (backStrange.length > 0 || backMissing.length > 0) {
    throw new PrintError(`${lang}: card back fonts: used [${[...backFonts.keys()].join(", ")}], expected [${BACK_FONTS[lang].needed.join(", ")}]`);
  }
  const allPages = Array.from({ length: 2 * sheets }, (_, index) => index + 1);
  const outputs: Array<{ kind: PdfKind; path: string; pages: number[]; fonts: (name: string) => boolean; needed: string[] }> = [
    { kind: "fronts", path: resolve(OUT_DIR, `${base}.pdf`), pages: allPages.filter((page) => page % 2 === 1), fonts: (name) => ALLOWED_FONTS[lang].test(name), needed: [] },
    { kind: "duplex", path: resolve(OUT_DIR, `${base}-duplex.pdf`), pages: allPages, fonts: (name) => ALLOWED_FONTS[lang].test(name) || BACK_FONTS[lang].allowed.test(name), needed: BACK_FONTS[lang].needed },
    { kind: "backs", path: resolve(OUT_DIR, `kiln-opening-order-backs-v1.6.2-A4-${lang}.pdf`), pages: allPages.filter((page) => page % 2 === 0), fonts: (name) => BACK_FONTS[lang].allowed.test(name), needed: BACK_FONTS[lang].needed },
  ];
  const a4 = `0 0 ${A4_PT.width.toFixed(5)} ${A4_PT.height.toFixed(5)}`;
  const written: Array<{ kind: PdfKind; path: string; pdf: PdfFacts }> = [];
  for (const output of outputs) {
    const say = (message: string): PrintError => new PrintError(`${lang}: ${output.path.slice(OUT_DIR.length + 1)}: ${message}`);
    await pdfRun.page.pdf({
      path: output.path,
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
      ...(output.pages.length === allPages.length ? {} : { pageRanges: output.pages.join(",") }),
    });
    finishPdf(output.path, PDF_SUBJECT[lang][output.kind], PDF_DUPLEX[output.kind]);
    const pdf = inspectPdf(output.path);
    if (pdf.pages !== output.pages.length) throw say(`${pdf.pages} pages, expected ${output.pages.length}`);
    if (pdf.mediaBoxes.length !== output.pages.length || pdf.mediaBoxes.some((box) => box !== a4)) throw say(`page sizes [${pdf.mediaBoxes.join("; ")}], expected ${a4} on every page`);
    if (!pdf.printScalingNone) throw say("lacks /PrintScaling /None");
    if (pdf.duplex !== PDF_DUPLEX[output.kind]) throw say(`viewer preference /Duplex /${pdf.duplex}, expected /${PDF_DUPLEX[output.kind]}`);
    if (pdf.subject !== PDF_SUBJECT[lang][output.kind]) throw say(`Subject reads "${pdf.subject}"`);
    if (pdf.embedded === 0) throw say("embeds no font program");
    if (pdf.unembedded.length > 0) throw say(`fonts without an embedded program: ${pdf.unembedded.join(", ")}`);
    const names = pdf.baseFonts.map((name) => name.replace(/^[A-Z]{6}\+/, ""));
    const unexpected = names.filter((name) => !output.fonts(name));
    if (unexpected.length > 0) throw say(`names unexpected fonts: ${unexpected.join(", ")}`);
    const missing = output.needed.filter((name) => !names.includes(name));
    if (missing.length > 0) throw say(`does not embed ${missing.join(", ")}`);
    if (pdf.repeating.length > 0) {
      throw say(`${pdf.repeating.length} repeating tiling pattern(s), which Apple's PDF renderer draws with hairline seams: ${pdf.repeating.slice(0, 5).join("; ")}`);
    }
    written.push({ kind: output.kind, path: output.path, pdf });
  }
  await pdfRun.page.context().close();

  // Previews: the same pages at 150 dpi.
  const previewRun = await renderPage(browser, html, PREVIEW_DPI / 96);
  if (previewRun.report.errors.length > 0) throw new PrintError(`${lang}: preview check failed:\n  - ${previewRun.report.errors.join("\n  - ")}`);
  const drift = Object.entries(pdfRun.report.sizes).filter(([id, size]) => JSON.stringify(size) !== JSON.stringify(previewRun.report.sizes[id]));
  for (const file of readdirSync(OUT_DIR)) {
    if (new RegExp(`^preview-${lang}-(back-)?p\\d+\\.png$`).test(file)) rmSync(resolve(OUT_DIR, file));
  }
  const previews: string[] = [];
  const blankProblems: string[] = [];
  const frontLocators = await previewRun.page.locator(".sheet.front").all();
  const backLocators = await previewRun.page.locator(".sheet.back").all();
  if (frontLocators.length !== sheets || backLocators.length !== sheets) {
    throw new PrintError(`${lang}: the page has ${frontLocators.length} front and ${backLocators.length} back sheets, expected ${sheets} of each`);
  }
  for (const [index, sheet] of frontLocators.entries()) {
    const path = resolve(OUT_DIR, `preview-${lang}-p${index + 1}.png`);
    const png = await sheet.screenshot({ path, animations: "disabled" });
    const plan = plans[index];
    const blank = plan === undefined ? "no sheet plan" : await checkBlankBelow(previewRun.page, plan, png);
    if (blank !== null) blankProblems.push(`page ${index + 1}: ${blank}`);
    previews.push(path);
  }
  const judged = { field: 0, white: 0, shift: 0 };
  for (const [index, sheet] of backLocators.entries()) {
    const path = resolve(OUT_DIR, `preview-${lang}-back-p${index + 1}.png`);
    // Where the sheet starts within the screenshot, device px (see checkBackPixels).
    const scale = PREVIEW_DPI / 96;
    const origin = await sheet.evaluate((element, dpr) => {
      const box = element.getBoundingClientRect();
      const x = box.left + window.scrollX;
      const y = box.top + window.scrollY;
      return { x: (x - Math.floor(x + 1e-3)) * dpr, y: (y - Math.floor(y + 1e-3)) * dpr };
    }, scale);
    const png = await sheet.screenshot({ path, animations: "disabled" });
    const plan = backs[index];
    if (plan === undefined) {
      blankProblems.push(`back of page ${index + 1}: no back plan`);
      continue;
    }
    const blank = await checkBlankBelow(previewRun.page, plan, png);
    if (blank !== null) blankProblems.push(`back of page ${index + 1}: ${blank}`);
    const pixels = await checkBackPixels(previewRun.page, plan, palette.decks[plan.kind], png, origin);
    blankProblems.push(...pixels.problems.map((problem) => `back of page ${index + 1}: ${problem}`));
    judged.field += pixels.judged.field;
    judged.white += pixels.judged.white;
    judged.shift = Math.max(judged.shift, pixels.shift);
    previews.push(path);
  }
  await previewRun.page.context().close();
  if (blankProblems.length > 0) throw new PrintError(`${lang}: preview pixel check failed:\n  - ${blankProblems.join("\n  - ")}`);

  const fronts = written.find((output) => output.kind === "fronts");
  if (fronts === undefined) throw new PrintError(`${lang}: no fronts PDF`);
  const pdf = fronts.pdf;
  console.log(`\n[${lang}] ${fronts.path}`);
  console.log(`  ${pdf.pages} A4 pages (${A4_PT.width.toFixed(2)} × ${A4_PT.height.toFixed(2)} pt, print scaling: none), ${cards.length} cards; fonts used: ${[...fonts.keys()].sort().join(", ")}; PDF fonts: ${pdf.baseFonts.join(", ")} (${pdf.embedded} embedded font programs); no repeating tile (${pdf.tilingPatterns} one-off tiling patterns)`);
  console.log(`  ${plans.map(describeSheet).join("; ")}`);
  const partial = plans.filter((plan) => plan.rows < 4).length;
  if (partial > 0) console.log(`  blank area: pure white on the 150 dpi preview of ${partial} part-filled page${partial === 1 ? "" : "s"} (front and back)`);
  for (const line of pdfRun.report.info) console.log(`  ${line}`);
  if (drift.length > 0) console.log(`  note: preview fitted ${drift.length} card(s) differently from the PDF run: ${drift.map(([id]) => id).join(", ")}`);
  for (const output of written.filter((item) => item.kind !== "fronts")) {
    console.log(`  ${output.kind === "duplex" ? "duplex" : "backs "} ${output.path}`);
    console.log(
      `    ${output.pdf.pages} A4 pages, /Duplex /${output.pdf.duplex}, print scaling: none; PDF fonts: ${output.pdf.baseFonts.join(", ")} (${output.pdf.embedded} embedded font programs, none missing); no repeating tile`,
    );
  }
  console.log(`  back fonts used: ${[...backFonts.keys()].sort().join(", ")}; back plan: every back mirrors its front for a long-edge flip (x → ${PAGE_W} − x − ${CARD_W})`);
  console.log(
    `  back pixels (150 dpi): ${judged.field} pixels of bleed and ${BACK_SAFE} mm band (less ${BAND_PIXEL_SLACK_MM} mm antialiasing) all field colours; ${judged.white} pixels outside the field all white (field found within ${judged.shift} px of the plan)`,
  );
  for (const path of previews) console.log(`  preview ${path}`);
}

async function main(): Promise<void> {
  const langs = parseLangs(process.argv.slice(2));
  const source = loadOrderSource();
  const art = new Map<string, SheetCard["art"]>();
  const problems: string[] = [];
  for (const card of source.cards.en) {
    const illustration = illustrationFor(card.data);
    problems.push(...checkIllustration(card.data, illustration));
    art.set(card.id, illustration);
  }
  if (problems.length > 0) throw new PrintError(`illustration check failed:\n  - ${problems.join("\n  - ")}`);
  console.log(
    `Order source OK: ${source.deckSizes.starting} Starting + ${source.deckSizes.main} Main Orders (from the Appendix A headings); EN and ZH Appendix A agree with ${"data/orders.json"} (its rulesVersion field reads "${source.rulesVersionInData}").`,
  );

  mkdirSync(OUT_DIR, { recursive: true });
  const glazes = glazeColours();
  console.log(`Glaze print tints: ${glazes.summary}`);
  const backs = backPalette();
  console.log(`Card back colours: ${backs.summary}; medallion drawing from ${BACK_ART_FILE}`);
  const input: Omit<PageInput, "lang" | "fit"> = {
    cutouts: cutouts(),
    glazes: glazes.tints,
    minGlazeDeltaE: MIN_GLAZE_DELTA_E,
    back: {
      art: { ...BACK_ART, url: `data:image/webp;base64,${readFileSync(resolve(APP_ROOT, BACK_ART_FILE)).toString("base64")}` },
      discR: BACK_LAYOUT.medal.disc,
      safe: BACK_SAFE,
      minBleed: BACK_MIN_BLEED,
      pageW: PAGE_W,
    },
  };
  const browser = await chromium.launch();
  try {
    for (const lang of langs) await printLanguage(browser, source, lang, art, input, backs.palette);
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error(`\nprint:orders FAILED\n${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
