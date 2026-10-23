import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { I18nProvider } from "../../../../src/app/i18n/I18nProvider.tsx";
import type { Locale } from "../../../../src/app/i18n/translator.ts";
import { Button } from "../../../../src/app/kit/Button.tsx";
import { Chip } from "../../../../src/app/kit/Chip.tsx";
import { Disclosure } from "../../../../src/app/kit/Disclosure.tsx";
import { LanguageToggle } from "../../../../src/app/kit/LanguageToggle.tsx";
import { MenuButton } from "../../../../src/app/kit/MenuButton.tsx";
import { OptionCard } from "../../../../src/app/kit/OptionCard.tsx";
import { OptionGroup } from "../../../../src/app/kit/OptionGroup.tsx";
import { PieceDetail } from "../../../../src/app/kit/PieceDetail.tsx";
import { ReorderList } from "../../../../src/app/kit/ReorderList.tsx";
import { Sheet } from "../../../../src/app/kit/Sheet.tsx";
import { Stepper } from "../../../../src/app/kit/Stepper.tsx";
import { Tabs } from "../../../../src/app/kit/Tabs.tsx";
import { ThemeToggle } from "../../../../src/app/kit/ThemeToggle.tsx";
import { CeramicChip } from "../../../../src/app/pieces/CeramicChip.tsx";
import { accessibleText } from "../pieces/a11y_text.ts";

/** Kit controls in static markup (SSR): native semantics, ARIA states, test-driver hooks. */
function render(element: ReactElement, locale: Locale = "en"): string {
  return renderToStaticMarkup(<I18nProvider locale={locale} strict>{element}</I18nProvider>);
}

const noop = () => undefined;

describe("Button", () => {
  it("is a type=button by default and exposes the test-driver action", () => {
    const html = render(<Button variant="primary" type="submit" action="confirm">Confirm</Button>);
    expect(html).toContain('type="submit"');
    expect(html).toContain('data-action="confirm"');
    expect(render(<Button>Go</Button>)).toContain('type="button"');
  });

  it("keeps a caller's data-action unless action is given (CR B1-4)", () => {
    const passed = { "data-action": "create-room" } as Record<string, string>;
    expect(render(<Button {...passed}>Create room</Button>)).toContain('data-action="create-room"');
    expect(render(<Button action="confirm" {...{ "data-action": "x" }}>Confirm</Button>)).toContain('data-action="confirm"');
    expect(render(<Button>Go</Button>)).not.toContain("data-action");
  });

  it("stays focusable when disabled or busy", () => {
    const html = render(<Button disabled busy pressed={false}>Go</Button>);
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).not.toMatch(/\sdisabled(=|\s|>)/);
  });
});

describe("OptionGroup and OptionCard", () => {
  const group = (
    <OptionGroup legend="Location" step={2} aside="2 of 3 open" name="locationId" value="guild_hall" onChange={noop}>
      <OptionCard value="materials_yard" title="Materials Yard" meta="2/4" />
      <OptionCard value="guild_hall" title="Guild Hall" controls="sub-guild">
        <div id="sub-guild" role="group" aria-label="Guild Hall choices">sub-editor</div>
      </OptionCard>
      <OptionCard value="magistrates_hall" title="Magistrate's Hall" disabled reason="Not enough Coins." />
    </OptionGroup>
  );

  it("renders a fieldset of native radios named by engine IDs", () => {
    const html = render(group);
    expect(html).toContain("<fieldset");
    expect(html).toContain("<legend");
    expect(html.match(/type="radio"/g)).toHaveLength(3);
    expect(html).toContain('name="locationId" value="materials_yard"');
    const checked = /<input[^>]*value="guild_hall"[^>]*>/.exec(html)?.[0] ?? "";
    expect(checked).toContain('checked=""');
  });

  it("keeps an unavailable option focusable with its reason linked", () => {
    const html = render(group);
    const input = /<input[^>]*value="magistrates_hall"[^>]*>/.exec(html)?.[0] ?? "";
    expect(input).toContain('aria-disabled="true"');
    expect(input).not.toMatch(/\sdisabled=/);
    const describedBy = /aria-describedby="([^"]+)"/.exec(input)?.[1] ?? "";
    expect(html).toContain(`id="${describedBy}"`);
    expect(html).toContain("Not enough Coins.");
  });

  it("renders the sub-editor after the label, never inside it, named by aria-controls", () => {
    const html = render(group);
    expect(html).toMatch(/aria-controls="sub-guild"/);
    const label = /<label[^>]*>(?:(?!<\/label>)[\s\S])*value="guild_hall"[\s\S]*?<\/label>/.exec(html)?.[0] ?? "";
    expect(label).not.toContain("sub-editor");
    expect(html.indexOf("sub-editor")).toBeGreaterThan(html.indexOf(label) + label.length - 1);
  });

  it("supports checkbox groups", () => {
    const html = render(
      <OptionGroup legend="Discard" name="orderIds" type="checkbox" values={["S01", "O33"]} onChange={noop} layout="grid">
        <OptionCard value="S01" title="S01" />
        <OptionCard value="O12" title="O12" />
        <OptionCard value="O33" title="O33" />
      </OptionGroup>,
    );
    expect(html.match(/type="checkbox"/g)).toHaveLength(3);
    expect(html.match(/checked=""/g)).toHaveLength(2);
  });
});

describe("other kit controls", () => {
  it("Tabs: one tabpanel, roving tabindex", () => {
    const html = render(
      <Tabs label="Kiln Player Boards" selected="p2" onSelect={noop} tabs={[{ id: "home", label: "Your workshop", home: true }, { id: "p2", label: "Zhao", seat: 1 }]}>
        <p>board</p>
      </Tabs>,
    );
    expect(html).toContain('role="tablist"');
    expect(html.match(/role="tab"/g)).toHaveLength(2);
    expect(html).toMatch(/aria-selected="true"[^>]*tabindex="0"|tabindex="0"[^>]*aria-selected="true"/);
    expect(html.match(/tabindex="-1"/g)).toHaveLength(1);
    expect(html.match(/role="tabpanel"/g)).toHaveLength(1);
  });

  it("Disclosure: native details", () => {
    expect(render(<Disclosure summary="Full rules">text</Disclosure>)).toMatch(/<details[^>]*><summary[^>]*>Full rules<\/summary>/);
  });

  it("Stepper: labelled buttons and an output", () => {
    const html = render(<Stepper label="Clay" value={2} min={0} max={3} onChange={noop} />);
    expect(html).toContain('aria-label="One fewer Clay"');
    expect(html).toContain('aria-label="One more Clay"');
    expect(html).toContain("<output");
    const zh = render(<Stepper label="泥" value={3} min={0} max={3} onChange={noop} />, "zh-CN");
    expect(/<button[^>]*aria-label="增加泥"[^>]*>/.exec(zh)?.[0]).toContain('aria-disabled="true"');
  });

  it("Sheet: strip with aria-expanded", () => {
    const html = render(<Sheet state="peek" onStateChange={noop} strip="Your turn: place a worker" stripAction="Decide"><h2>Place a worker</h2></Sheet>);
    expect(html).toContain('data-sheet="peek"');
    expect(html).toContain('aria-expanded="false"');
  });

  it("MenuButton: a closed menu", () => {
    const html = render(<MenuButton label="⋯" ariaLabel="Menu" items={[{ id: "leave", label: "Leave view", onSelect: noop }, { id: "end", label: "End session", onSelect: noop, danger: true }]} />);
    expect(html).toContain('aria-haspopup="menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toMatch(/role="menu"[^>]*hidden=""|hidden=""[^>]*role="menu"/);
    expect(html.match(/role="menuitem"/g)).toHaveLength(2);
  });

  it("ReorderList: Move up / Move down per item", () => {
    const html = render(<ReorderList label="Bottom order" items={[{ id: "T10", label: "Colour Samples" }, { id: "T15", label: "Kiln Furniture" }]} onReorder={noop} />);
    expect(html).toContain("<ol");
    expect(html).toContain('aria-label="Move Colour Samples up" aria-disabled="true"');
    expect(html).toContain('aria-label="Move Kiln Furniture down" aria-disabled="true"');
  });

  it("PieceDetail: a collapsed disclosure; name=\"label\" names a wordless trigger", () => {
    const html = render(<PieceDetail label="Zhao’s Celadon Vase, Carved · Fine" name="label" trigger={<span aria-hidden="true">art</span>}>details</PieceDetail>);
    expect(html).toContain('aria-expanded="false"');
    expect(html).toMatch(/<button[^>]*aria-label="Zhao’s Celadon Vase, Carved · Fine"/);
    expect(html).toMatch(/role="group"[^>]*hidden=""|hidden=""[^>]*role="group"/);
  });

  it("PieceDetail: by default the button is named by its piece's own words, Kiln Master marker included", () => {
    const ceramic = { id: "g4", ownerId: "zhao", shape: "plate", decoration: "painted", glaze: "white", quality: null } as const;
    const view = { viewerId: "lin", game: { players: { lin: { displayName: "Lin" }, zhao: { displayName: "Zhao" } }, ceramics: {} } };
    for (const [locale, expected] of [
      ["en", "Zhao’s White Plate, Painted, Kiln Master marker +1"],
      ["zh-CN", "Zhao的白釉盘 · 画花，窑工标+1"],
    ] as const) {
      const html = render(
        <PieceDetail label="ignored for the button" trigger={<CeramicChip ceramic={ceramic} seat={1} view={view} marker={1} />}>
          details
        </PieceDetail>,
        locale,
      );
      const button = /<button[^>]*class="kit-detail-trigger"[^>]*>([\s\S]*?)<\/button><div/.exec(html);
      expect(button, html).not.toBeNull();
      expect(button?.[0]).not.toMatch(/^<button[^>]*aria-label=/);
      expect(accessibleText(button?.[1] ?? "")).toBe(expected);
    }
  });

  it("LanguageToggle and ThemeToggle: pressed state", () => {
    const en = render(<LanguageToggle />, "en");
    expect(en).toMatch(/lang="en" aria-pressed="true"/);
    expect(en).toMatch(/lang="zh-Hans" aria-pressed="false"/);
    expect(en).toContain(">中文<");
    expect(render(<ThemeToggle value="system" onChange={noop} />, "zh-CN")).toMatch(/aria-pressed="true">跟随系统</);
  });

  it("Chip: text, never colour alone", () => {
    expect(render(<Chip tone="private">Only you can see</Chip>)).toContain("Only you can see");
  });
});
