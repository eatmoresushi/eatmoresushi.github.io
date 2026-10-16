/**
 * The phone section bar (UI_V1.6.1_ARCHITECTURE §4.1, §8.1, §9.2; D5; B1).
 *
 * - a `<nav aria-label="Sections">` of four buttons (not a tablist), `aria-current="page"` on
 *   the current one, which follows the window's default section (wireframe `resetApp`) unless
 *   the player chose another;
 * - badges from the model and the table selection, each said in the button's name.
 */
import { describe, expect, it } from "vitest";
import type { LocationId, PlacementWorkerOption } from "../../../../src/game/index.ts";
import { PhoneNav, navBadges } from "../../../../src/app/shell/PhoneNav.tsx";
import { createTranslator } from "../../../../src/app/i18n/translator.ts";
import { INERT_SELECTION } from "../../../../src/app/state/tableSelection.ts";
import { PHONE_SECTIONS, windowUiDefaults } from "../../../../src/app/state/uiStore.ts";
import { fixtureSource } from "../support/fixtures.ts";
import { renderComponent } from "../support/render.tsx";
import { attr, modelOf } from "./support.tsx";

const t = createTranslator("en", { strict: true });
const text = (value: Parameters<typeof t.message>[0] | string): string => (typeof value === "string" ? value : t.message(value));

function buttons(html: string): string[] {
  return [...html.matchAll(/<button[^>]*class="phone-nav-button"[^>]*>/g)].map((match) => match[0]);
}

describe("phone nav", () => {
  it("is a nav of buttons with the current section marked", () => {
    const model = modelOf("m1_work_phase_r2_3p");
    const html = renderComponent(fixtureSource("m1_work_phase_r2_3p"), <PhoneNav />);
    expect(html).toMatch(/^<nav class="phone-nav" aria-label="Sections">/);
    expect(html).not.toContain('role="tab');
    const current = windowUiDefaults(model.window, model.roundPhase).section;
    const all = buttons(html);
    expect(all.map((button) => attr(button, "data-tab"))).toEqual([...PHONE_SECTIONS]);
    expect(all.filter((button) => button.includes('aria-current="page"')).map((button) => attr(button, "data-tab"))).toEqual([current]);
  });

  it.each([
    ["m1_work_phase_r2_3p", "workshop"],
    ["m4_after_quality_3p", "kiln"],
    ["m6_order_phase_crackle_3p", "orders"],
    ["m7_cleanup_hand_limit_3p", "orders"],
    ["m8_final_results_3p", "table"],
  ] as const)("%s opens on the %s section", (id, section) => {
    const html = renderComponent(fixtureSource(id), <PhoneNav />);
    expect(html).toMatch(new RegExp(`data-tab="${section}" aria-current="page"`));
  });

  it("follows the section the player chose", () => {
    const html = renderComponent(fixtureSource("m1_work_phase_r2_3p"), <PhoneNav />, { ui: { section: "kiln" } });
    expect(html).toMatch(/data-tab="kiln" aria-current="page"/);
  });

  it("badges the work turn from the Place targets and the shaped vessels", () => {
    const model = modelOf("m1_work_phase_r2_3p");
    // Every entry, legal or not (CR B2-3): only locations with a legal entry count as open.
    const entry = (legal: boolean) => ({ legal }) as unknown as PlacementWorkerOption;
    const placeTargets = new Map<LocationId, PlacementWorkerOption[]>([
      ["materials_yard", [entry(true)]],
      ["canal_wharf", [entry(false), entry(true)]],
      ["magistrates_hall", [entry(false)]],
    ]);
    const badges = navBadges(model, { ...INERT_SELECTION, placeTargets });
    expect(text(badges.table!.shown)).toBe("2");
    expect(text(badges.table!.meaning)).toBe("2 locations open");
    const shaped = model.me!.shapedCeramicIds.length;
    if (shaped > 0) expect(text(badges.workshop!.meaning)).toBe(`${shaped} shaped ${shaped === 1 ? "vessel" : "vessels"}`);
    expect(text(badges.orders!.meaning)).toBe(`${model.hand.length} ${model.hand.length === 1 ? "Order" : "Orders"} in hand`);
    expect(badges.kiln).toBeUndefined();
  });

  it("points at the kiln in a firing decision", () => {
    const badges = navBadges(modelOf("m3_heat_marker_step_3p"), INERT_SELECTION);
    expect(text(badges.kiln!.shown)).toBe("!");
    expect(badges.kiln!.soft).toBe(false);
    expect(text(badges.kiln!.meaning)).toBe("your decision is here");
  });

  it("counts completable Orders and the Orders to discard", () => {
    const orders = navBadges(modelOf("m6_order_phase_crackle_3p"), {
      ...INERT_SELECTION,
      orderTargets: new Map([
        ["O01", { state: "completable", disabled: false }],
        ["O02", { state: "blocked", disabled: true }],
        ["O03", { state: "chosen", disabled: false }],
      ]),
    });
    expect(text(orders.orders!.meaning)).toBe("2 Orders can be completed");
    const model = modelOf("m7_cleanup_hand_limit_3p");
    const trim = navBadges(model, INERT_SELECTION);
    const must = model.handLimits[model.viewerId!]!.mustDiscard;
    expect(text(trim.orders!.shown)).toBe(`−${must}`);
    expect(trim.orders!.soft).toBe(false);
  });

  it("badges a private look with its Orders", () => {
    const model = modelOf("m2_commission_market_look_r3_4p");
    const badges = navBadges(model, INERT_SELECTION);
    expect(text(badges.orders!.meaning)).toBe(`${model.look!.orderIds.length} Orders to look at`);
  });

  it("says the badge in the button's name, never by colour alone", () => {
    const html = renderComponent(fixtureSource("m3_heat_marker_step_3p"), <PhoneNav />);
    const kiln = buttons(html).find((button) => attr(button, "data-tab") === "kiln") ?? "";
    expect(attr(kiln, "aria-label")).toBe("Kiln, your decision is here");
    expect(html).toMatch(/<span class="phone-nav-badge num" aria-hidden="true">!<\/span>/);
    const zh = renderComponent(fixtureSource("m3_heat_marker_step_3p"), <PhoneNav />, { locale: "zh-CN" });
    expect(zh).toContain('aria-label="窑，需你决断"');
  });
});
