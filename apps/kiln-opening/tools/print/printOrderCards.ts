/**
 * Printable A4 sheets of the Kiln Opening Order cards (V1.6.2): 8 Starting + 48 Main Orders,
 * up to 4 × 4 cards of 50 × 71 mm per A4 portrait page with dashed cut lines.
 *
 *   npm run print:orders                                         # English and Chinese
 *   npx vite-node tools/print/printOrderCards.ts --lang en       # one language (en | zh)
 *
 * Output (gitignored), per language:
 *   output/print/kiln-opening-orders-v1.6.2-A4-<lang>.pdf        # 4 pages: S01–S08, O01–O16, O17–O32, O33–O48
 *   output/print/preview-<lang>-p<N>.png                         # each page at 150 dpi
 *   output/print/kiln-opening-orders-v1.6.2-A4-<lang>.html       # the rendered page, for inspection
 *
 * Each deck starts a new page (sheet.ts). Page 1 holds the 8 Starting Orders in its top two
 * rows; its lower half is blank paper (no parchment, no cut line), which the run checks on the
 * rendered page and on the 150 dpi preview pixels.
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
import { buildSheetHtml, CARDS_PER_SHEET, PAGE_H, PAGE_W } from "./sheet.ts";
import type { FitSettings, PageInput, SheetCard, SheetPlan } from "./sheet.ts";

const OUT_DIR = resolve(APP_ROOT, "output/print");
const CERAMICS_DIR = resolve(APP_ROOT, "assets/current_v04/ceramics");
const TOKENS_CSS = resolve(APP_ROOT, "src/app/styles/tokens.css");
const HERE = import.meta.dirname;

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

const PDF_SUBJECT: Record<Lang, string> = {
  en: "Kiln Opening Order cards, V1.6.2 Player Rulebook Appendix A: Starting and Main Orders. A4; print at 100 % (actual size), each card 50 × 71 mm.",
  zh: "开窑委托卡，V1.6.2规则书附录A：起始委托与主委托。A4纸，按100%实际尺寸打印，每张卡50 × 71毫米。",
};

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

/** The light-theme Glaze colours, read from the app's design tokens (first block = light). */
function glazeTokens(): Record<(typeof GLAZES)[number], string> {
  const css = readFileSync(TOKENS_CSS, "utf8");
  const colours = {} as Record<(typeof GLAZES)[number], string>;
  for (const glaze of GLAZES) {
    const match = new RegExp(`--glz-${glaze}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
    if (match?.[1] === undefined) throw new PrintError(`${TOKENS_CSS}: --glz-${glaze} not found`);
    colours[glaze] = match[1];
  }
  return colours;
}

/** A token colour at a print density (each channel c → c^density). */
function atDensity(hex: string, density: number): string {
  const channels = [1, 3, 5].map((at) => Math.round(255 * (parseInt(hex.slice(at, at + 2), 16) / 255) ** density));
  return `#${channels.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
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

/** Every font Chromium actually used for card text, by PostScript name, via the DevTools protocol. */
async function usedFonts(page: Page): Promise<Map<string, number>> {
  const client = await page.context().newCDPSession(page);
  await client.send("DOM.enable");
  await client.send("CSS.enable");
  const { root } = await client.send("DOM.getDocument", { depth: -1 });
  const { nodeIds } = await client.send("DOM.querySelectorAll", {
    nodeId: root.nodeId,
    selector: ".card .id, .card .kind, .card .h, .card .req p, .card .req .seg, .card .req .mp, .card .req .pz, .card .qual p, .card .qual .seg, .card .qual .mp, .card .qual .pz, .card .vp-num, .card .vp-badge text",
  });
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

/** Page count, page sizes, embedded font programs, print preference and repeating tiles of a Chromium PDF. */
function inspectPdf(path: string): { pages: number; embedded: number; baseFonts: string[]; mediaBoxes: string[]; printScalingNone: boolean; repeating: string[]; tilingPatterns: number } {
  const bytes = readFileSync(path).toString("latin1");
  const pages = (bytes.match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
  const embedded = (bytes.match(/\/FontFile[23]?\b/g) ?? []).length;
  const baseFonts = [...new Set([...bytes.matchAll(/\/BaseFont\s*\/([^\s/<>\[\]]+)/g)].map((match) => match[1] ?? ""))].sort();
  const mediaBoxes = [...bytes.matchAll(/\/MediaBox\s*\[([^\]]*)\]/g)].map((match) => (match[1] ?? "").trim().split(/\s+/).join(" "));
  const tilingPatterns = (bytes.match(/\/PatternType\s+1\b/g) ?? []).length;
  return { pages, embedded, baseFonts, mediaBoxes, printScalingNone: /\/PrintScaling\s*\/None/.test(bytes), repeating: repeatingPatterns(bytes), tilingPatterns };
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
 *    /Prev) adds the viewer preference /PrintScaling /None and the Subject.
 */
function finishPdf(path: string, subject: string): void {
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
  const prefs = `${oldPrefs.replace(/\/PrintScaling\s*\/\w+/, "").trim()}\n/PrintScaling /None`;
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
async function checkBlankBelow(page: Page, sheet: SheetPlan, png: Buffer): Promise<string | null> {
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

async function printLanguage(browser: Browser, source: OrderSource, lang: Lang, art: Map<string, SheetCard["art"]>, input: Omit<PageInput, "lang" | "fit">): Promise<void> {
  const cards: SheetCard[] = source.cards[lang].map((card) => {
    const illustration = art.get(card.id);
    if (illustration === undefined) throw new PrintError(`${card.id}: no illustration`);
    return { card, art: illustration };
  });
  const { html, sheets: plans } = buildSheetHtml({
    lang,
    labels: source.labels[lang],
    cards,
    css: readFileSync(resolve(HERE, "cards.css"), "utf8"),
    script: readFileSync(resolve(HERE, "cardPage.js"), "utf8"),
    input: { ...input, lang, fit: FIT[lang] },
  });
  const sheetProblems = checkSheets(source, lang, plans);
  if (sheetProblems.length > 0) throw new PrintError(`${lang}: sheet plan check failed:\n  - ${sheetProblems.join("\n  - ")}`);
  const sheets = plans.length;
  const base = `kiln-opening-orders-v1.6.2-A4-${lang}`;
  writeFileSync(resolve(OUT_DIR, `${base}.html`), html);

  // PDF: rendered at device scale 1 in print media.
  const pdfRun = await renderPage(browser, html, 1);
  if (pdfRun.report.errors.length > 0) throw new PrintError(`${lang}: card check failed:\n  - ${pdfRun.report.errors.join("\n  - ")}`);
  const fonts = await usedFonts(pdfRun.page);
  const strange = [...fonts.keys()].filter((name) => !ALLOWED_FONTS[lang].test(name));
  if (strange.length > 0) {
    throw new PrintError(`${lang}: text fell back to other fonts: ${strange.map((name) => `${name} (${fonts.get(name)} glyphs)`).join(", ")}`);
  }
  const pdfPath = resolve(OUT_DIR, `${base}.pdf`);
  await pdfRun.page.pdf({ path: pdfPath, format: "A4", printBackground: true, preferCSSPageSize: true, margin: { top: "0", right: "0", bottom: "0", left: "0" } });
  await pdfRun.page.context().close();
  finishPdf(pdfPath, PDF_SUBJECT[lang]);
  const pdf = inspectPdf(pdfPath);
  if (pdf.pages !== sheets) throw new PrintError(`${lang}: the PDF has ${pdf.pages} pages, expected ${sheets}`);
  const a4 = `0 0 ${A4_PT.width.toFixed(5)} ${A4_PT.height.toFixed(5)}`;
  if (pdf.mediaBoxes.length !== sheets || pdf.mediaBoxes.some((box) => box !== a4)) throw new PrintError(`${lang}: PDF page sizes [${pdf.mediaBoxes.join("; ")}], expected ${a4} on every page`);
  if (!pdf.printScalingNone) throw new PrintError(`${lang}: the PDF lacks /PrintScaling /None`);
  if (pdf.embedded === 0) throw new PrintError(`${lang}: the PDF embeds no font program`);
  const unexpected = pdf.baseFonts.filter((name) => !ALLOWED_FONTS[lang].test(name.replace(/^[A-Z]{6}\+/, "")));
  if (unexpected.length > 0) throw new PrintError(`${lang}: the PDF names unexpected fonts: ${unexpected.join(", ")}`);
  if (pdf.repeating.length > 0) {
    throw new PrintError(`${lang}: the PDF has ${pdf.repeating.length} repeating tiling pattern(s), which Apple's PDF renderer draws with hairline seams: ${pdf.repeating.slice(0, 5).join("; ")}`);
  }

  // Previews: the same page at 150 dpi.
  const previewRun = await renderPage(browser, html, PREVIEW_DPI / 96);
  if (previewRun.report.errors.length > 0) throw new PrintError(`${lang}: preview check failed:\n  - ${previewRun.report.errors.join("\n  - ")}`);
  const drift = Object.entries(pdfRun.report.sizes).filter(([id, size]) => JSON.stringify(size) !== JSON.stringify(previewRun.report.sizes[id]));
  for (const file of readdirSync(OUT_DIR)) {
    if (new RegExp(`^preview-${lang}-p\\d+\\.png$`).test(file)) rmSync(resolve(OUT_DIR, file));
  }
  const previews: string[] = [];
  const blankProblems: string[] = [];
  const sheetLocators = await previewRun.page.locator(".sheet").all();
  if (sheetLocators.length !== sheets) throw new PrintError(`${lang}: the page has ${sheetLocators.length} sheets, expected ${sheets}`);
  for (const [index, sheet] of sheetLocators.entries()) {
    const path = resolve(OUT_DIR, `preview-${lang}-p${index + 1}.png`);
    const png = await sheet.screenshot({ path, animations: "disabled" });
    const plan = plans[index];
    const blank = plan === undefined ? "no sheet plan" : await checkBlankBelow(previewRun.page, plan, png);
    if (blank !== null) blankProblems.push(`page ${index + 1}: ${blank}`);
    previews.push(path);
  }
  await previewRun.page.context().close();
  if (blankProblems.length > 0) throw new PrintError(`${lang}: blank-area check failed:\n  - ${blankProblems.join("\n  - ")}`);

  console.log(`\n[${lang}] ${pdfPath}`);
  console.log(`  ${pdf.pages} A4 pages (${A4_PT.width.toFixed(2)} × ${A4_PT.height.toFixed(2)} pt, print scaling: none), ${cards.length} cards; fonts used: ${[...fonts.keys()].sort().join(", ")}; PDF fonts: ${pdf.baseFonts.join(", ")} (${pdf.embedded} embedded font programs); no repeating tile (${pdf.tilingPatterns} one-off tiling patterns)`);
  console.log(`  ${plans.map(describeSheet).join("; ")}`);
  const partial = plans.filter((plan) => plan.rows < 4).length;
  if (partial > 0) console.log(`  blank area: pure white on the 150 dpi preview of ${partial} part-filled page${partial === 1 ? "" : "s"}`);
  for (const line of pdfRun.report.info) console.log(`  ${line}`);
  if (drift.length > 0) console.log(`  note: preview fitted ${drift.length} card(s) differently from the PDF run: ${drift.map(([id]) => id).join(", ")}`);
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
  const input = { cutouts: cutouts(), glazes: glazes.tints, minGlazeDeltaE: MIN_GLAZE_DELTA_E };
  const browser = await chromium.launch();
  try {
    for (const lang of langs) await printLanguage(browser, source, lang, art, input);
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error(`\nprint:orders FAILED\n${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
