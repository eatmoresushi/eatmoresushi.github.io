/**
 * Checks of the finished PDFs themselves, as Apple's PDF renderer draws them (Quartz: Preview,
 * and printing from it), so the numbers reported are what the PDF holds rather than what the
 * browser's layout planned.
 *
 * Each page is rendered at `PDF_CHECK_DPI` (0.064 mm a pixel) by a small JavaScript-for-Automation
 * script (`osascript -l JavaScript`, Core Graphics' `CGContextDrawPDFPage`, sRGB), written as raw
 * RGBA to a temporary file and measured here:
 *
 * - a front page: its cut lines, found in the white margin (the grey run-outs of the vertical cuts
 *   above the grid and of the horizontal cuts left of it), each to a hundredth of a millimetre;
 *   on a page with blank rows, the paper below its lowest printed point must be pure white;
 * - a back page: the continuous field's edges; the back's own grid, which is the front's cuts
 *   seen through the paper after a long-edge flip (x → 210 − x) and after a short-edge one
 *   (y → 297 − y); every back's seal, edge by edge, which after either flip must land on its
 *   front card where the layout puts it; every pixel of the bleed and of the band within
 *   `BACK_SAFE` mm of every cut must be the field (its colour, its stripe colour or a blend of
 *   the two: no white, no seam, no mark); outside the field the paper must be pure white; and
 *   the words, the divider and the seal must share one centre line.
 *
 * macOS only, as the build is (its fonts are the system's Iowan Old Style and Songti SC).
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BACK_LAYOUT, BACK_MIN_BLEED, BACK_SAFE, CARD_H, CARD_W, COLUMNS, PAGE_H, PAGE_W, ROWS } from "./sheet.ts";
import type { BackPlan, SheetPlan } from "./sheet.ts";
import type { Lang } from "./orderSource.ts";

export const PDF_CHECK_DPI = 400;
const PX_PER_MM = PDF_CHECK_DPI / 25.4;
/** A pixel is the field when it lies within this colour distance (8-bit RGB) of the field–stripe blend. */
const FIELD_TOLERANCE = 6;
/** The seal and the words may sit this far off one another's centre line (glyph side bearings). */
const CENTRE_TOLERANCE_MM = 0.15;
/** After either flip a back's seal must land this close to where its front card puts it. */
const FLIP_TOLERANCE_MM = 0.05;

/** Renders one PDF page to raw RGBA (premultiplied, on white, so opaque) and prints its size as JSON. */
const RENDER_JXA = `
ObjC.import("Foundation");
ObjC.import("CoreGraphics");
ObjC.import("Quartz");
function run(argv) {
  const [pdfPath, pageArg, dpiArg, outPath] = argv;
  const doc = $.CGPDFDocumentCreateWithURL($.NSURL.fileURLWithPath(pdfPath));
  const count = Number($.CGPDFDocumentGetNumberOfPages(doc));
  const number = Number(pageArg);
  if (!(number >= 1 && number <= count)) throw new Error("page " + number + " of " + count);
  const page = $.CGPDFDocumentGetPage(doc, number);
  const box = $.CGPDFPageGetBoxRect(page, $.kCGPDFMediaBox);
  const scale = Number(dpiArg) / 72;
  const width = Math.round(box.size.width * scale);
  const height = Math.round(box.size.height * scale);
  const ctx = $.CGBitmapContextCreate(null, width, height, 8, width * 4, $.CGColorSpaceCreateWithName($.kCGColorSpaceSRGB), $.kCGImageAlphaPremultipliedLast);
  $.CGContextSetRGBFillColor(ctx, 1, 1, 1, 1);
  $.CGContextFillRect(ctx, $.CGRectMake(0, 0, width, height));
  $.CGContextScaleCTM(ctx, width / box.size.width, height / box.size.height);
  $.CGContextTranslateCTM(ctx, -box.origin.x, -box.origin.y);
  $.CGContextDrawPDFPage(ctx, page);
  const image = $.CGBitmapContextCreateImage(ctx);
  ObjC.castRefToObject($.CGDataProviderCopyData($.CGImageGetDataProvider(image))).writeToFileAtomically(outPath, true);
  return JSON.stringify({ pages: count, width, height, stride: Number($.CGImageGetBytesPerRow(image)), box: [box.origin.x, box.origin.y, box.size.width, box.size.height] });
}
`;

export interface Raster {
  width: number;
  height: number;
  /** RGBA, `width * 4` bytes a row. */
  data: Buffer;
}

/** Renders PDF pages one at a time with Quartz; `use` sees each raster before the next is made. */
export class PdfRenderer {
  private readonly dir: string;
  private readonly script: string;

  constructor() {
    if (process.platform !== "darwin") throw new Error("the PDF check renders with Quartz (macOS)");
    this.dir = mkdtempSync(join(tmpdir(), "kiln-print-check-"));
    this.script = join(this.dir, "render.js");
    writeFileSync(this.script, RENDER_JXA);
  }

  render(pdf: string, page: number): Raster {
    const out = join(this.dir, `page-${page}.rgba`);
    try {
      const json = execFileSync("osascript", ["-l", "JavaScript", this.script, pdf, String(page), String(PDF_CHECK_DPI), out], { encoding: "utf8", maxBuffer: 1 << 20 });
      const info = JSON.parse(json) as { width: number; height: number; stride: number; box: number[] };
      const raw = readFileSync(out);
      if (raw.length !== info.stride * info.height) throw new Error(`${raw.length} bytes for ${info.width} × ${info.height} px`);
      let data = raw;
      if (info.stride !== info.width * 4) {
        data = Buffer.alloc(info.width * 4 * info.height);
        for (let y = 0; y < info.height; y += 1) raw.copy(data, y * info.width * 4, y * info.stride, y * info.stride + info.width * 4);
      }
      return { width: info.width, height: info.height, data };
    } finally {
      rmSync(out, { force: true });
    }
  }

  close(): void {
    rmSync(this.dir, { recursive: true, force: true });
  }
}

const mmOf = (px: number): number => px / PX_PER_MM;
const pxOf = (mm: number): number => mm * PX_PER_MM;

/** Groups values (each with a weight) lying within `gap` of their neighbours; returns the weighted means. */
function cluster(values: Array<{ at: number; weight: number }>, gap: number, minCount: number): number[] {
  const sorted = [...values].sort((a, b) => a.at - b.at);
  const groups: Array<Array<{ at: number; weight: number }>> = [];
  for (const value of sorted) {
    const group = groups.at(-1);
    if (group !== undefined && value.at - (group.at(-1)?.at ?? -Infinity) <= gap) group.push(value);
    else groups.push([value]);
  }
  return groups
    .filter((group) => group.length >= minCount)
    .map((group) => group.reduce((sum, value) => sum + value.at * value.weight, 0) / group.reduce((sum, value) => sum + value.weight, 0));
}

/**
 * The centres (mm) of the dark runs along one line of pixels, each weighted by its darkness;
 * `step` walks along the line: horizontally (x varies) or vertically (y varies).
 */
function runsAlong(r: Raster, fixed: number, from: number, to: number, vertical: boolean): Array<{ at: number; weight: number }> {
  const runs: Array<{ at: number; weight: number }> = [];
  let sum = 0;
  let weight = 0;
  for (let i = from; i <= to; i += 1) {
    const x = vertical ? fixed : i;
    const y = vertical ? i : fixed;
    const at = (y * r.width + x) * 4;
    const dark = 255 - ((r.data[at] ?? 255) + (r.data[at + 1] ?? 255) + (r.data[at + 2] ?? 255)) / 3;
    if (dark > 4 && i < to) {
      sum += (i + 0.5) * dark;
      weight += dark;
    } else if (weight > 0) {
      runs.push({ at: mmOf(sum / weight), weight });
      sum = 0;
      weight = 0;
    }
  }
  return runs;
}

export interface FrontCuts {
  xs: number[];
  ys: number[];
}

/**
 * A front page's cut lines as printed: the vertical cuts from their run-outs in the top margin
 * (rows 1.0–5.2 mm from the top), the horizontal cuts from theirs in the left margin (1.0–3.8 mm).
 */
export function measureFrontCuts(r: Raster): FrontCuts {
  const vertical: Array<{ at: number; weight: number }> = [];
  for (let y = Math.ceil(pxOf(1)); y <= pxOf(5.2); y += 1) vertical.push(...runsAlong(r, y, 0, r.width - 1, false));
  const horizontal: Array<{ at: number; weight: number }> = [];
  for (let x = Math.ceil(pxOf(1)); x <= pxOf(3.8); x += 1) horizontal.push(...runsAlong(r, x, 0, r.height - 1, true));
  return { xs: cluster(vertical, 0.6, 20), ys: cluster(horizontal, 0.6, 20) };
}

/** The colour distance of a pixel from the blend line field → stripe. */
function fieldDistance(r: number, g: number, b: number, base: number[], d: number[], dd: number): number {
  const t = Math.min(1, Math.max(0, ((r - (base[0] ?? 0)) * (d[0] ?? 0) + (g - (base[1] ?? 0)) * (d[1] ?? 0) + (b - (base[2] ?? 0)) * (d[2] ?? 0)) / dd));
  return Math.hypot(r - ((base[0] ?? 0) + t * (d[0] ?? 0)), g - ((base[1] ?? 0) + t * (d[1] ?? 0)), b - ((base[2] ?? 0) + t * (d[2] ?? 0)));
}

const rgbOf = (hex: string): number[] => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));

export interface BackRasterResult {
  problems: string[];
  /** The field's edges as printed, mm. */
  field: { left: number; right: number; top: number; bottom: number };
  /** Least distance from the front's outer cuts to the field's edge, after either flip. */
  bleed: number;
  /** Largest distance between a back's seal and where its front card puts it, after either flip. */
  flip: number;
  /** Nearest mark to any cut (its pixel's edge), mm. */
  nearest: number;
  /** Largest offset of the words or divider from their seal's centre line, mm. */
  centring: number;
  judged: { band: number; white: number };
}

/**
 * Finds a back's seal edge by edge (the block is a cinnabar rectangle on the parchment disc, its
 * two characters inside): cinnabar coverage s = (R − G − 15) / 89 per pixel, edges to a fraction of
 * a pixel along rows (left, right) and columns (top, bottom) clear of the rounded corners.
 */
function measureSeal(r: Raster, expected: { x: number; y: number }, half: { w: number; h: number }): { x: number; y: number } | null {
  const s = (x: number, y: number): number => {
    const at = (y * r.width + x) * 4;
    return Math.min(1, Math.max(0, ((r.data[at] ?? 0) - (r.data[at + 1] ?? 0) - 15) / 89));
  };
  const edge = (fixed: number, from: number, step: number, vertical: boolean): number | null => {
    for (let i = from, n = 0; n < pxOf(3); i += step, n += 1) {
      const value = vertical ? s(fixed, i) : s(i, fixed);
      if (value > 0.05) {
        const next = vertical ? s(fixed, i + step) : s(i + step, fixed);
        if (next < 0.9) return null;
        // The pixel at i is covered by `value` from its inner side.
        return step > 0 ? i + 1 - value : i + value;
      }
    }
    return null;
  };
  const margin = 1.5;
  const left: number[] = [];
  const right: number[] = [];
  for (let y = Math.round(pxOf(expected.y - half.h + 1)); y <= pxOf(expected.y + half.h - 1); y += 3) {
    const l = edge(y, Math.round(pxOf(expected.x - half.w - margin)), 1, false);
    const rr = edge(y, Math.round(pxOf(expected.x + half.w + margin)), -1, false);
    if (l !== null) left.push(l);
    if (rr !== null) right.push(rr);
  }
  const top: number[] = [];
  const bottom: number[] = [];
  for (let x = Math.round(pxOf(expected.x - half.w + 1)); x <= pxOf(expected.x + half.w - 1); x += 2) {
    const t = edge(x, Math.round(pxOf(expected.y - half.h - margin)), 1, true);
    const b = edge(x, Math.round(pxOf(expected.y + half.h + margin)), -1, true);
    if (t !== null) top.push(t);
    if (b !== null) bottom.push(b);
  }
  const mean = (list: number[]): number => list.reduce((a, b) => a + b, 0) / list.length;
  if (left.length < 10 || right.length < 10 || top.length < 5 || bottom.length < 5) return null;
  return { x: mmOf((mean(left) + mean(right)) / 2), y: mmOf((mean(top) + mean(bottom)) / 2) };
}

/** The back sheet's cut grid: the front's cuts seen after either flip, merged. */
export function backGrid(cuts: FrontCuts): FrontCuts {
  const merge = (values: number[]): number[] => cluster(values.map((at) => ({ at, weight: 1 })), 0.5, 1);
  return { xs: merge(cuts.xs.map((x) => PAGE_W - x)), ys: merge([...cuts.ys, ...cuts.ys.map((y) => PAGE_H - y)]) };
}

export function checkBackRaster(r: Raster, plan: BackPlan, front: SheetPlan, cuts: FrontCuts, colours: { field: string; stripe: string }, lang: Lang): BackRasterResult {
  const problems: string[] = [];
  const grid = backGrid(cuts);
  if (grid.xs.length !== COLUMNS + 1 || grid.ys.length !== ROWS + 1) {
    problems.push(`the back's grid from the front's cuts has ${grid.xs.length} × ${grid.ys.length} lines (expected ${COLUMNS + 1} × ${ROWS + 1})`);
    return { problems, field: { left: 0, right: 0, top: 0, bottom: 0 }, bleed: 0, flip: Infinity, nearest: 0, centring: Infinity, judged: { band: 0, white: 0 } };
  }

  // The field's edges, along three rows and three columns (sub-pixel from the edge pixel's coverage).
  const lum = (x: number, y: number): number => {
    const at = (y * r.width + x) * 4;
    return ((r.data[at] ?? 0) + (r.data[at + 1] ?? 0) + (r.data[at + 2] ?? 0)) / 3;
  };
  const edgeAlong = (fixed: number, vertical: boolean, fromEnd: boolean): number => {
    const length = vertical ? r.height : r.width;
    const at = (i: number): number => (vertical ? lum(fixed, i) : lum(i, fixed));
    const step = fromEnd ? -1 : 1;
    let i = fromEnd ? length - 1 : 0;
    while (i + step >= 0 && i + step < length && at(i) >= 254.5) i += step;
    const inner = at(i + 2 * step);
    const coverage = Math.min(1, Math.max(0, (255 - at(i)) / Math.max(1, 255 - inner)));
    return mmOf(fromEnd ? i + coverage : i + 1 - coverage);
  };
  const rows = [30, PAGE_H / 2, PAGE_H - 30].map((mm) => Math.round(pxOf(mm)));
  const columns = [30, PAGE_W / 2, PAGE_W - 30].map((mm) => Math.round(pxOf(mm)));
  const field = {
    left: Math.max(...rows.map((y) => edgeAlong(y, false, false))),
    right: Math.min(...rows.map((y) => edgeAlong(y, false, true))),
    top: Math.max(...columns.map((x) => edgeAlong(x, true, false))),
    bottom: Math.min(...columns.map((x) => edgeAlong(x, true, true))),
  };
  const planned = plan.field;
  const fieldOff = Math.max(Math.abs(field.left - planned.left), Math.abs(field.right - planned.right), Math.abs(field.top - planned.top), Math.abs(field.bottom - planned.bottom));
  if (fieldOff > 0.1) problems.push(`the field prints at x ${field.left.toFixed(3)}–${field.right.toFixed(3)}, y ${field.top.toFixed(3)}–${field.bottom.toFixed(3)} mm, ${fieldOff.toFixed(3)} mm off the plan`);
  // Seen from the front after either flip, the field must reach BACK_MIN_BLEED beyond its outer cuts.
  const frontRows = cuts.ys.length - 1;
  const outer = { left: cuts.xs[0] ?? 0, right: cuts.xs.at(-1) ?? 0, top: cuts.ys[0] ?? 0, bottom: cuts.ys.at(-1) ?? 0 };
  const seen = {
    long: { left: PAGE_W - field.right, right: PAGE_W - field.left, top: field.top, bottom: field.bottom },
    short: { left: field.left, right: field.right, top: PAGE_H - field.bottom, bottom: PAGE_H - field.top },
  };
  let bleed = Infinity;
  for (const view of Object.values(seen)) bleed = Math.min(bleed, outer.left - view.left, view.right - outer.right, outer.top - view.top, view.bottom - outer.bottom);
  bleed = Math.min(bleed, (grid.xs[0] ?? 0) - field.left, field.right - (grid.xs.at(-1) ?? 0), (grid.ys[0] ?? 0) - field.top, field.bottom - (grid.ys.at(-1) ?? 0));
  if (bleed < BACK_MIN_BLEED) problems.push(`the field reaches only ${bleed.toFixed(3)} mm beyond the outer cuts (at least ${BACK_MIN_BLEED})`);

  // Every back's seal, and where each flip puts it on the front.
  const { seal: S } = BACK_LAYOUT;
  const cy = BACK_LAYOUT.lang[lang].cy;
  const half = { w: (S.char + 2 * S.padX) / 2, h: (2 * S.char + S.gap + 2 * S.padY) / 2 };
  let flip = 0;
  const landed = { long: 0, short: 0 };
  const seals: Array<{ column: number; row: number; x: number; y: number }> = [];
  for (let row = 0; row < ROWS; row += 1) {
    for (let column = 0; column < COLUMNS; column += 1) {
      const cellLeft = grid.xs[column] ?? 0;
      const cellTop = grid.ys[row] ?? 0;
      const seal = measureSeal(r, { x: cellLeft + CARD_W / 2, y: cellTop + cy }, half);
      if (seal === null) {
        problems.push(`no seal found on the back at row ${row + 1}, column ${column + 1}`);
        continue;
      }
      seals.push({ column, row, ...seal });
      // Long edge: x → 210 − x, the back's column c lands on the front's column 3 − c, same row.
      const longColumn = COLUMNS - 1 - column;
      if (row < frontRows) {
        const centre = ((cuts.xs[longColumn] ?? 0) + (cuts.xs[longColumn + 1] ?? 0)) / 2;
        const error = Math.max(Math.abs(PAGE_W - seal.x - centre), Math.abs(seal.y - ((cuts.ys[row] ?? 0) + cy)));
        flip = Math.max(flip, error);
        landed.long += 1;
        if (error > FLIP_TOLERANCE_MM) problems.push(`after a long-edge flip the back at row ${row + 1}, column ${column + 1} lands ${error.toFixed(3)} mm off its front card`);
      }
      // Short edge: y → 297 − y, the back's row r lands on the front's row 3 − r, turned round.
      const shortRow = ROWS - 1 - row;
      if (shortRow < frontRows) {
        const centre = ((cuts.xs[column] ?? 0) + (cuts.xs[column + 1] ?? 0)) / 2;
        const error = Math.max(Math.abs(seal.x - centre), Math.abs(PAGE_H - seal.y - ((cuts.ys[shortRow] ?? 0) + CARD_H - cy)));
        flip = Math.max(flip, error);
        landed.short += 1;
        if (error > FLIP_TOLERANCE_MM) problems.push(`after a short-edge flip the back at row ${row + 1}, column ${column + 1} lands ${error.toFixed(3)} mm off its front card`);
      }
    }
  }
  // Every front card has a back on it after either flip (the front's rows are all filled here).
  const cells = frontRows * COLUMNS;
  if (front.ids.length !== cells) problems.push(`the front's cuts frame ${cells} cards, the sheet holds ${front.ids.length}`);
  if (landed.long !== front.ids.length || landed.short !== front.ids.length) problems.push(`backs on the front's ${front.ids.length} cards: ${landed.long} after a long-edge flip, ${landed.short} after a short-edge one`);

  // Pixels: white outside the field; in the bleed and the safe band only the field; nearest mark.
  const base = rgbOf(colours.field);
  const stripe = rgbOf(colours.stripe);
  const d = stripe.map((value, index) => value - (base[index] ?? 0));
  const dd = d.reduce((sum, value) => sum + value * value, 0);
  const onePx = mmOf(1);
  const nearestCut = (list: number[], value: number): number => list.reduce((best, cut) => Math.min(best, Math.abs(cut - value)), Infinity);
  const inside = (list: number[], value: number): boolean => value > (list[0] ?? 0) && value < (list.at(-1) ?? 0);
  const colDist = Array.from({ length: r.width }, (_, x) => {
    const mm = mmOf(x + 0.5);
    return inside(grid.xs, mm) ? nearestCut(grid.xs, mm) : -1;
  });
  const rowDist = Array.from({ length: r.height }, (_, y) => {
    const mm = mmOf(y + 0.5);
    return inside(grid.ys, mm) ? nearestCut(grid.ys, mm) : -1;
  });
  let nearest = Infinity;
  const bad = { white: 0, band: 0, firstWhite: "", firstBand: "" };
  const judged = { band: 0, white: 0 };
  for (let y = 0; y < r.height; y += 1) {
    const ymm = mmOf(y + 0.5);
    const outsideY = ymm < field.top - onePx || ymm > field.bottom + onePx;
    const edgeY = ymm < field.top + onePx || ymm > field.bottom - onePx;
    const dy = rowDist[y] ?? -1;
    for (let x = 0; x < r.width; x += 1) {
      const xmm = mmOf(x + 0.5);
      const at = (y * r.width + x) * 4;
      const red = r.data[at] ?? 0;
      const green = r.data[at + 1] ?? 0;
      const blue = r.data[at + 2] ?? 0;
      if (outsideY || xmm < field.left - onePx || xmm > field.right + onePx) {
        judged.white += 1;
        if (red !== 255 || green !== 255 || blue !== 255) {
          bad.white += 1;
          if (bad.firstWhite === "") bad.firstWhite = `(${xmm.toFixed(2)}, ${ymm.toFixed(2)}) mm rgb(${red}, ${green}, ${blue})`;
        }
        continue;
      }
      if (edgeY || xmm < field.left + onePx || xmm > field.right - onePx) continue;
      const dx = colDist[x] ?? -1;
      // Distance from the nearest cut; outside the grid (the bleed) it is negative.
      const distance = dx < 0 || dy < 0 ? -1 : Math.min(dx, dy);
      const isField = fieldDistance(red, green, blue, base, d, dd) <= FIELD_TOLERANCE;
      if (!isField) nearest = Math.min(nearest, distance - onePx / 2);
      if (distance < BACK_SAFE - onePx) {
        judged.band += 1;
        if (!isField) {
          bad.band += 1;
          if (bad.firstBand === "") bad.firstBand = `(${xmm.toFixed(2)}, ${ymm.toFixed(2)}) mm rgb(${red}, ${green}, ${blue})`;
        }
      }
    }
  }
  if (bad.white > 0) problems.push(`${bad.white} non-white pixels outside the field (first at ${bad.firstWhite})`);
  if (bad.band > 0) problems.push(`${bad.band} pixels of the bleed or the ${BACK_SAFE} mm band are not the field (first at ${bad.firstBand})`);
  if (nearest < BACK_SAFE) problems.push(`a mark comes ${nearest.toFixed(3)} mm from a cut (at least ${BACK_SAFE})`);

  // Centring: every word line and the divider on its seal's centre line.
  let centring = 0;
  const type = BACK_LAYOUT.type[lang];
  const at = BACK_LAYOUT.lang[lang];
  const bands: Array<{ name: string; top: number; bottom: number }> = [{ name: "divider", top: at.divider - 0.3, bottom: at.divider + 2 }];
  for (const kind of ["game", "deck"] as const) {
    if (type[kind].size === 0) continue;
    const em = (type[kind].size * 25.4) / 72;
    bands.push({ name: kind, top: at[kind] - 0.95 * em, bottom: at[kind] + 0.3 * em });
  }
  for (const seal of seals) {
    const cellTop = grid.ys[seal.row] ?? 0;
    const cellLeft = grid.xs[seal.column] ?? 0;
    for (const band of bands) {
      let minX = Infinity;
      let maxX = -Infinity;
      for (let y = Math.round(pxOf(cellTop + band.top)); y <= pxOf(cellTop + band.bottom); y += 1) {
        for (let x = Math.round(pxOf(cellLeft + BACK_SAFE)); x <= pxOf(cellLeft + CARD_W - BACK_SAFE); x += 1) {
          const p = (y * r.width + x) * 4;
          if (fieldDistance(r.data[p] ?? 0, r.data[p + 1] ?? 0, r.data[p + 2] ?? 0, base, d, dd) > 40) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x + 1);
          }
        }
      }
      if (!Number.isFinite(minX)) {
        problems.push(`no ${band.name} on the back at row ${seal.row + 1}, column ${seal.column + 1}`);
        continue;
      }
      const offset = Math.abs(mmOf((minX + maxX) / 2) - seal.x);
      centring = Math.max(centring, offset);
      if (offset > CENTRE_TOLERANCE_MM) problems.push(`the ${band.name} on the back at row ${seal.row + 1}, column ${seal.column + 1} sits ${offset.toFixed(3)} mm off its seal's centre line`);
    }
  }
  return { problems, field, bleed, flip, nearest, centring, judged };
}

/** A part-filled front page: pure white from just below its lowest printed point (plus a pixel). */
export function checkBlankRaster(r: Raster, inkBottom: number): string | null {
  const top = Math.ceil(pxOf(inkBottom) + 1);
  let marked = 0;
  let first = -1;
  for (let y = top; y < r.height; y += 1) {
    for (let x = 0; x < r.width; x += 1) {
      const at = (y * r.width + x) * 4;
      if (r.data[at] !== 255 || r.data[at + 1] !== 255 || r.data[at + 2] !== 255) {
        marked += 1;
        if (first < 0) first = y;
      }
    }
  }
  return marked === 0 ? null : `${marked} non-white pixels below ${inkBottom} mm (first at ${mmOf(first).toFixed(2)} mm)`;
}

/** Mean CIE L* of a striped field (field and stripes half and half, averaged as light). */
export function fieldLightness(colours: { field: string; stripe: string }): number {
  const lin = (c: number): number => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
  const luminance = (hex: string): number => {
    const [r = 0, g = 0, b = 0] = rgbOf(hex).map(lin);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const y = (luminance(colours.field) + luminance(colours.stripe)) / 2;
  return 116 * (y > 0.008856 ? Math.cbrt(y) : 7.787 * y + 16 / 116) - 16;
}

