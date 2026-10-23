/**
 * The scenario gallery in a real browser (UI_V1.6.1_ARCHITECTURE §9.5, §9.6 `gallery.spec`).
 * Owner: B6.
 *
 * Every gallery entry — the kit page, the shell states, every scripted scenario (windows and
 * table states) and every played moment — opens in the bare gallery view (`&bare=1`: the entry
 * alone, as the app shows it) at every project size, in English on the light theme and Chinese
 * on the dark theme; at 390 and 1440 also the other two language × theme pairs, and a 200% root
 * font size. Each view checks:
 * - axe: no serious or critical violation;
 * - every visible text is at least 12px, and Chinese text at least 13px;
 * - no horizontal page scroll (`scrollWidth ≤ innerWidth`), also at 200% text (reflow);
 * - no clipped text: no text container with `overflow: hidden | clip` cuts its text off;
 * - no English Tech name broken inside a word, also at 200% text (the price moves under it);
 * - no ConfirmBar button label broken across lines (the alternative never squeezes to one
 *   character's width beside Confirm);
 * - focus is visible after Tab;
 * - on phone projects, every interactive element is at least 44×44 CSS px or has 44px spacing
 *   (WCAG 2.5.8; inline links in running text excepted; spacing is measured to the visible part
 *   of each neighbour, so a chip scrolled out of its row does not count);
 * - at 1440 (one desktop page resized through all eight sizes): no game text is hidden at one size
 *   and shown at another, except inactive phone sections and the collapsed sheet body;
 * - an ARIA snapshot of the decision pane (1440; `npm run test:e2e:update` refreshes them); while
 *   the work turn hides the pane (owner review, 2026-10-17), of the hidden pane's bar above the
 *   world instead (its turn cue, then the openers, if any).
 * A viewport screenshot of each view goes to `output/ui-v1.6.1/screens/` (gitignored) for review;
 * `KILN_E2E_SCREENS=full` takes full-page ones. No pixel baselines are kept.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const fixtureIds = (file: string): string[] =>
  (JSON.parse(readFileSync(fileURLToPath(new URL(`../test/v161/ui/fixtures/${file}`, import.meta.url)), "utf8")) as { entries: { id: string }[] }).entries.map((entry) => entry.id);

const SHELL_IDS = ["shell-home", "shell-home-saved", "shell-lobby-host", "shell-lobby-guest", "shell-reconnecting", "shell-offline", "shell-computer-failure", "shell-unsent", "shell-ended"];
const ENTRIES: readonly string[] = ["kit", ...SHELL_IDS, ...fixtureIds("scenarios.json"), ...fixtureIds("moments.json")];

interface View {
  lang: "en" | "zh-CN";
  theme: "light" | "dark";
  /** Root font size in percent (200: the WCAG 1.4.4 text-resize run). */
  text: 100 | 200;
}

const BASE: readonly View[] = [
  { lang: "en", theme: "light", text: 100 },
  { lang: "zh-CN", theme: "dark", text: 100 },
];
const EXTRA: readonly View[] = [
  { lang: "en", theme: "dark", text: 100 },
  { lang: "zh-CN", theme: "light", text: 100 },
  { lang: "en", theme: "light", text: 200 },
  { lang: "zh-CN", theme: "dark", text: 200 },
];
const SIZES = [
  [320, 568],
  [390, 844],
  [768, 1024],
  [844, 390],
  [932, 430],
  [1024, 768],
  [1440, 900],
  [2560, 1080],
] as const;

const hashOf = (id: string, view: Pick<View, "lang" | "theme">) => `gallery/#${encodeURIComponent(id)}?${view.lang === "en" ? "" : "lang=zh-CN&"}${view.theme === "light" ? "" : "theme=dark&"}bare=1`;

async function open(page: Page, id: string, view: View): Promise<void> {
  if (view.text !== 100) {
    await page.addInitScript((percent) => {
      document.addEventListener("DOMContentLoaded", () => {
        document.documentElement.style.fontSize = `${percent}%`;
      });
    }, view.text);
  }
  await page.goto(hashOf(id, view));
  await page.locator("[data-gallery-ready]").waitFor({ state: "attached", timeout: 30_000 });
  await expect(page.locator("html")).toHaveAttribute("lang", view.lang === "en" ? "en" : "zh-Hans");
  await expect(page.locator("html")).toHaveAttribute("data-theme", view.theme);
  await page.evaluate(() => document.fonts.ready);
}

/** Text smaller than the floor (12px; 13px for Chinese). */
async function smallText(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const found: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const text = (node.textContent ?? "").trim();
      const parent = node.parentElement;
      if (text === "" || parent === null) continue;
      if (parent.closest("[hidden], [aria-hidden='true'], .sr-only, script, style") !== null) continue;
      if (parent.getClientRects().length === 0) continue;
      const box = parent.getBoundingClientRect();
      if (box.width <= 1 || box.height <= 1) continue;
      const style = getComputedStyle(parent);
      if (style.visibility === "hidden" || Number(style.opacity) === 0) continue;
      const size = Number.parseFloat(style.fontSize);
      const han = /[一-鿿]/.test(text);
      const floor = han ? 13 : 12;
      // A size within half a pixel of the floor is the floor (rem rounding).
      if (size < floor - 0.5) found.push(`${size}px < ${floor}px ${parent.tagName.toLowerCase()}.${String(parent.className)}: ${text.slice(0, 40)}`);
    }
    return [...new Set(found)].slice(0, 20);
  });
}

async function horizontalScroll(page: Page): Promise<number> {
  return page.evaluate(() => (document.scrollingElement?.scrollWidth ?? 0) - window.innerWidth);
}

/** Text containers that cut their text off (`overflow: hidden | clip`, not a scroller). */
async function clippedText(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const found: string[] = [];
    for (const element of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
      if (element.closest("[hidden], .sr-only") !== null || element.getClientRects().length === 0) continue;
      // Visually hidden on purpose (the sr-only pattern: 1px, clipped), still read aloud.
      const box = element.getBoundingClientRect();
      if (box.width <= 1 || box.height <= 1) continue;
      const hasText = Array.from(element.childNodes).some((child) => child.nodeType === Node.TEXT_NODE && (child.textContent ?? "").trim() !== "");
      if (!hasText) continue;
      const style = getComputedStyle(element);
      const clips = style.overflowX === "hidden" || style.overflowX === "clip" || style.textOverflow === "ellipsis";
      if (!clips) continue;
      if (element.scrollWidth > element.clientWidth + 1) found.push(`${element.tagName.toLowerCase()}.${element.className}: ${(element.textContent ?? "").trim().slice(0, 40)}`);
    }
    return found.slice(0, 20);
  });
}

/**
 * Tech names broken inside a word (review of owner items 4–5, 2026-10-17): a word of an English
 * Tech name on two lines ("Con/nois/seu/r's" beside a long price at 200% text). The tile's title
 * row moves the price under the name instead. Chinese names may break between characters.
 */
async function brokenTechNames(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const found: string[] = [];
    for (const name of Array.from(document.querySelectorAll<HTMLElement>(".tech-name"))) {
      if (name.closest("[hidden], [inert]") !== null || name.getClientRects().length === 0) continue;
      const walker = document.createTreeWalker(name, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        const text = node.textContent ?? "";
        for (const word of text.matchAll(/[A-Za-z'’]+/g)) {
          const range = document.createRange();
          range.setStart(node, word.index ?? 0);
          range.setEnd(node, (word.index ?? 0) + word[0].length);
          const tops = new Set(
            Array.from(range.getClientRects())
              .filter((rect) => rect.width > 0 && rect.height > 0)
              .map((rect) => Math.round(rect.top)),
          );
          if (tops.size > 1) found.push(`${Math.round(name.getBoundingClientRect().width)}px "${text}": "${word[0]}" on ${tops.size} lines`);
        }
      }
    }
    return found.slice(0, 20);
  });
}

/** ConfirmBar buttons whose label breaks onto a second line (取/消, 结束回/合, End/turn). */
async function wrappedConfirmLabels(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const found: string[] = [];
    for (const button of Array.from(document.querySelectorAll<HTMLElement>(".confirm-buttons > .kit-btn"))) {
      if (button.closest("[hidden], [inert]") !== null || button.getClientRects().length === 0) continue;
      // Each text node of the label must sit on one line (an icon beside it is not a line).
      const walker = document.createTreeWalker(button, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        if ((node.textContent ?? "").trim() === "") continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        const tops = new Set(
          Array.from(range.getClientRects())
            .filter((rect) => rect.width > 0 && rect.height > 0)
            .map((rect) => Math.round(rect.top)),
        );
        if (tops.size > 1) found.push(`${Math.round(button.getBoundingClientRect().width)}px "${(button.textContent ?? "").trim()}" on ${tops.size} lines`);
      }
    }
    return found;
  });
}

async function focusVisibleAfterTab(page: Page): Promise<string | null> {
  await page.locator("body").click({ position: { x: 1, y: 1 } }).catch(() => undefined);
  // Safari (WebKit) moves Tab only between form fields unless "Press Tab to highlight each item"
  // is on; its keyboard users reach links and buttons with Option-Tab.
  const webkit = page.context().browser()?.browserType().name() === "webkit";
  await page.keyboard.press(webkit ? "Alt+Tab" : "Tab");
  return page.evaluate(() => {
    const active = document.activeElement as HTMLElement | null;
    if (active === null || active === document.body) return "Tab did not move focus";
    const ring = (element: Element | null): boolean => {
      if (element === null) return false;
      const style = getComputedStyle(element);
      return (style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) > 0) || (style.boxShadow !== "none" && style.boxShadow !== "");
    };
    // A native radio or checkbox shows its ring on its label (kit OptionCard).
    if (ring(active) || ring(active.closest("label"))) return null;
    return `no visible focus on ${active.tagName.toLowerCase()}.${active.className}`;
  });
}

/** Interactive elements under 44×44 without 44px spacing (WCAG 2.5.8). */
async function smallTargets(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const selector = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [tabindex]:not([tabindex="-1"])';
    const visible = (element: Element) => element.closest("[hidden], [inert]") === null && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== "hidden";
    const targets = Array.from(document.querySelectorAll<HTMLElement>(selector))
      .filter(visible)
      // A native input covering its label: the label is the target.
      .map((element) => (element instanceof HTMLInputElement && element.closest("label") !== null ? element.closest("label")! : element))
      .filter((element, index, all) => all.indexOf(element) === index);
    // The part of each target that can be seen across: clipped horizontally by every ancestor
    // that clips or scrolls (a seat chip scrolled under the top bar's tools is not a neighbour
    // there). Vertical scrolling is left alone, so a form option below the fold is still checked.
    const visibleRect = (element: HTMLElement): DOMRect => {
      const box = element.getBoundingClientRect();
      let left = box.left;
      let right = box.right;
      for (let parent = element.parentElement; parent !== null && parent !== document.body; parent = parent.parentElement) {
        if (getComputedStyle(parent).overflowX === "visible") continue;
        const clip = parent.getBoundingClientRect();
        left = Math.max(left, clip.left);
        right = Math.min(right, clip.right);
      }
      return new DOMRect(left, box.top, Math.max(0, right - left), box.height);
    };
    const all = targets.map((element) => ({ element, rect: visibleRect(element) }));
    const shown = all.filter(({ rect }) => rect.width > 0 && rect.height > 0);
    const visibleTargets = shown.map(({ element }) => element);
    const rects = shown.map(({ rect }) => rect);
    const found: string[] = [];
    visibleTargets.forEach((element, index) => {
      // Its own size is judged unclipped (a target scrolled half out of view is not too small).
      const rect = element.getBoundingClientRect();
      if (rect.width >= 43.5 && rect.height >= 43.5) return;
      // Inline links in running text are excepted.
      if (element.tagName === "A" && getComputedStyle(element).display === "inline") return;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const spaced = rects.every((other, otherIndex) => {
        if (otherIndex === index || visibleTargets[otherIndex]!.contains(element) || element.contains(visibleTargets[otherIndex]!)) return true;
        const dx = Math.max(other.left - cx, 0, cx - other.right);
        const dy = Math.max(other.top - cy, 0, cy - other.bottom);
        return Math.hypot(dx, dy) >= 22;
      });
      if (!spaced) found.push(`${Math.round(rect.width)}×${Math.round(rect.height)} ${element.tagName.toLowerCase()} ${element.getAttribute("aria-label") ?? (element.textContent ?? "").trim().slice(0, 30)}`);
    });
    return found.slice(0, 20);
  });
}

async function screenshot(page: Page, project: string, id: string, view: View): Promise<void> {
  const name = `${project}/${id}-${view.lang}-${view.theme}${view.text === 100 ? "" : `-${view.text}`}.png`;
  await page.screenshot({ path: `output/ui-v1.6.1/screens/${name}`, fullPage: process.env["KILN_E2E_SCREENS"] === "full" });
}

const isPhone = (width: number | undefined, height: number | undefined) => width !== undefined && height !== undefined && (width < 900 || height <= 500);

for (const id of ENTRIES) {
  test.describe(`gallery ${id}`, () => {
    for (const view of [...BASE, ...EXTRA]) {
      const extra = !BASE.includes(view);
      test(`${view.lang} ${view.theme}${view.text === 100 ? "" : ` ${view.text}% text`}`, async ({ page, viewport }, testInfo) => {
        test.skip(extra && viewport?.width !== 390 && viewport?.width !== 1440, "the other language × theme pairs and 200% text run at 390 and 1440 only");
        test.setTimeout(120_000);
        await open(page, id, view);
        const where = `${id} ${view.lang}-${view.theme} ${String(viewport?.width)}×${String(viewport?.height)}`;
        expect(await horizontalScroll(page), `${where}: horizontal page scroll`).toBeLessThanOrEqual(0);
        expect(await clippedText(page), `${where}: clipped text`).toEqual([]);
        expect(await brokenTechNames(page), `${where}: a Tech name broken inside a word`).toEqual([]);
        if (view.text === 200) return;
        // @axe-core/playwright types its own copy of `Page` (playwright-core); the object is the same.
        const axe = await new AxeBuilder({ page: page as unknown as ConstructorParameters<typeof AxeBuilder>[0]["page"] }).analyze();
        const serious = axe.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
        expect(serious.map((violation) => `${violation.id}: ${violation.nodes.slice(0, 3).map((node) => node.target.join(" ")).join(" | ")}`), `${where}: axe`).toEqual([]);
        expect(await smallText(page), `${where}: text under the floor`).toEqual([]);
        expect(await wrappedConfirmLabels(page), `${where}: a ConfirmBar label broken across lines`).toEqual([]);
        if (isPhone(viewport?.width, viewport?.height)) expect(await smallTargets(page), `${where}: targets under 44px`).toEqual([]);
        await screenshot(page, testInfo.project.name, id, view);
        expect(await focusVisibleAfterTab(page), `${where}: focus after Tab`).toBeNull();
        if (viewport?.width === 1440 && view.theme === BASE.find((base) => base.lang === view.lang)?.theme) {
          const pane = page.locator("aside.pane");
          const openers = page.locator("[data-pane-openers]");
          if ((await pane.count()) > 0 && (await pane.isVisible())) await expect(pane).toMatchAriaSnapshot({ name: `${id}-${view.lang}.aria.yml` });
          else if ((await openers.count()) > 0) await expect(openers).toMatchAriaSnapshot({ name: `${id}-${view.lang}.aria.yml` });
        }
      });
    }

    test("no game text is hidden at one size and shown at another", async ({ page, viewport }) => {
      test.skip(viewport?.width !== 1440 || viewport.height !== 900, "one desktop page, resized through every size");
      test.setTimeout(120_000);
      await open(page, id, BASE[0]!);
      /** Visible text, and the text the allowed differences hide (inactive phone sections, the collapsed sheet body). */
      const visibleTexts = () =>
        page.evaluate(() => {
          const phone = window.matchMedia("(max-width: 899px)").matches || window.matchMedia("(orientation: landscape) and (max-height: 500px)").matches;
          const shown = new Set<string>();
          const allowed = new Set<string>();
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
            const text = (node.textContent ?? "").trim();
            const parent = node.parentElement;
            // Chrome that exists per layout by design (§4.1): the brand (dropped on phones), the
            // desktop jump bar (the phone section bar replaces it), decorative glyphs.
            if (text === "" || parent === null || parent.closest("[hidden], .sr-only, .kit-detail-panel, [aria-hidden='true'], .top-bar-brand, .jump-nav") !== null) continue;
            if (phone && parent.closest('[data-section]:not([data-current]), .kit-sheet[data-sheet="peek"] > .kit-sheet-body') !== null) {
              allowed.add(text);
              continue;
            }
            if (parent.getClientRects().length === 0 || getComputedStyle(parent).visibility === "hidden") continue;
            shown.add(text);
          }
          return { shown: [...shown], allowed: [...allowed] };
        });
      const bySize = new Map<string, Set<string>>();
      for (const [width, height] of SIZES) {
        await page.setViewportSize({ width, height });
        await page.waitForTimeout(50);
        const { shown, allowed } = await visibleTexts();
        bySize.set(`${width}×${height}`, new Set([...shown, ...allowed]));
      }
      // Text the desktop shows must be shown (or hidden only in the allowed ways) at every size.
      const problems: string[] = [];
      const desktop = bySize.get("1440×900")!;
      for (const [size, texts] of bySize) {
        for (const text of desktop) if (!texts.has(text)) problems.push(`${size} hides "${text.slice(0, 40)}"`);
      }
      expect(problems.slice(0, 20)).toEqual([]);
      if (viewport !== null) await page.setViewportSize({ width: viewport.width, height: viewport.height });
    });
  });
}
