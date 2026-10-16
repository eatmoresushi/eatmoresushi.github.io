/**
 * The idle firing recap (B3; UI_V1.6.1_ARCHITECTURE §4.2, §5 gap 18, §9.2): between firings the
 * Kiln section keeps the last firing visible from `firingRecapView` (no heat ledger, D3), with
 * this round's Kiln Die and the open Fire discard (D4); a round with nothing loaded (the
 * empty-kiln recap) is noted; an Imperial-only firing recaps with no Contributions (Base Heat =
 * Kiln Die); before the first firing it says so.
 */
import { describe, expect, it } from "vitest";
import { firingRecapView } from "../../../../src/game/index.ts";
import { IdleFiringRecap } from "../../../../src/app/kiln/IdleFiringRecap.tsx";
import { FixtureGameSource } from "../../../../src/app/session/fixtureSource.ts";
import { openFiringTable } from "../../engine/support/firing.ts";
import { fixture, fixtureSource } from "../support/fixtures.ts";
import { renderComponent, renderScreen } from "../support/render.tsx";
import { perceivable, withoutRulesPanels } from "./support.ts";

const render = (id: string, locale: "en" | "zh-CN" = "en") => renderComponent(fixtureSource(id), <IdleFiringRecap />, { locale });

describe("idle firing recap", () => {
  it("m1: the Round 1 firing — Kiln Die + Contributions = Base Heat; Fire → Global Heat; each Quality", () => {
    const recap = firingRecapView(fixture("m1_work_phase_r2_3p").playerView);
    expect(recap?.round).toBe(1);
    const html = render("m1_work_phase_r2_3p");
    const text = perceivable(withoutRulesPanels(html));
    expect(text).toContain("Last firing · Round 1");
    expect(text).toMatch(new RegExp(`Kiln Die\\s+${String(recap!.kilnDie)}\\s+\\+`));
    expect(text).toMatch(new RegExp(`= Base Heat\\s+${String(recap!.baseHeat)}`));
    expect(text).toMatch(new RegExp(`Global Heat\\s+${String(recap!.globalHeat)}`));
    expect(text).toContain("Kiln Die this round");
    expect(text).toContain("Fire discard (open)");
    expect(html.match(/data-quality="\w+"/g)?.length).toBe(recap!.ceramics.filter((ceramic) => !ceramic.salvaged).length);
    expect(text).not.toMatch(/\bc\d+\b/);
    const zh = perceivable(withoutRulesPanels(render("m1_work_phase_r2_3p", "zh-CN")));
    expect(zh).toContain("上次烧窑 · 第1轮");
    expect(zh).toMatch(/= 基础火候/);
    expect(zh).toContain("全窑火候");
  });

  it("notes a round with nothing loaded and keeps the earlier recap", () => {
    const text = perceivable(render("t-firing-skipped"));
    expect(text).toContain("Round 2: nothing was loaded, so there was no firing.");
    expect(text).toContain("Last firing · Round 1");
    expect(perceivable(render("t-firing-skipped", "zh-CN"))).toContain("第2轮：没有器物装窑，所以这一轮不烧窑。");
  });

  it("recaps an Imperial-only firing: no Contributions, so Base Heat is the Kiln Die", () => {
    // The t-imperial-only-firing table, played to the end of its firing (no decision is open:
    // nobody has a ceramic in the Shared Kiln and the Imperial ceramic carries no marker).
    const table = openFiringTable({
      kilnDie: 3,
      players: [{ recognition: 2, displayName: "Lin" }, { displayName: "Zhao" }],
      ceramics: [{ owner: "p1", stage: "loaded", shape: "vase", glaze: "moon_white", decoration: "painted", at: "imperial", imperialModifier: 1 }],
    });
    const view = table.view("p2");
    const recap = firingRecapView(view);
    expect(recap?.contributions).toEqual([]);
    expect(recap?.baseHeat).toBe(3);
    const source = () => new FixtureGameSource({ id: "imperial-only-recap", viewerId: "p2", playerView: structuredClone(view) });
    const text = perceivable(withoutRulesPanels(renderComponent(source(), <IdleFiringRecap />)));
    expect(text).toMatch(/Kiln Die\s+3\s+\+ no Contributions = Base Heat\s+3/);
    expect(text).toMatch(new RegExp(`Global Heat\\s+${String(recap!.globalHeat)}`));
    expect(text).toContain("Lin’s Moon White Vase, Painted · Standard");
    expect(text).not.toMatch(/\bc\d+\b/);
    const zh = perceivable(withoutRulesPanels(renderComponent(source(), <IdleFiringRecap />, { locale: "zh-CN" })));
    expect(zh).toMatch(/窑骰\s*3\s*\+ 无控火 = 基础火候\s*3/);
  });

  it("says no firing yet before the first one", () => {
    expect(firingRecapView(fixture("m15_kiln_selection").playerView)).toBeNull();
    expect(perceivable(render("m12_guild_shifu_inspection"))).toContain("No firing yet");
    expect(perceivable(render("m12_guild_shifu_inspection", "zh-CN"))).toContain("尚未烧窑");
  });

  it("sits in the Kiln section outside the Firing Phase, above the kiln", () => {
    const html = renderScreen(fixtureSource("m1_work_phase_r2_3p"));
    const section = html.slice(html.indexOf('id="sec-kiln"'));
    expect(section.indexOf('class="recap"')).toBeGreaterThan(-1);
    expect(section.indexOf('class="recap"')).toBeLessThan(section.indexOf('class="kilnbox"'));
  });
});
