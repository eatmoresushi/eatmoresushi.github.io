// @vitest-environment happy-dom
import { act, useState } from "react";
import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../../../src/app/i18n/I18nProvider.tsx";
import { Button } from "../../../../src/app/kit/Button.tsx";
import { Disclosure } from "../../../../src/app/kit/Disclosure.tsx";
import { LanguageToggle } from "../../../../src/app/kit/LanguageToggle.tsx";
import { MenuButton } from "../../../../src/app/kit/MenuButton.tsx";
import { OptionCard } from "../../../../src/app/kit/OptionCard.tsx";
import { OptionGroup } from "../../../../src/app/kit/OptionGroup.tsx";
import { PieceDetail } from "../../../../src/app/kit/PieceDetail.tsx";
import { ReorderList } from "../../../../src/app/kit/ReorderList.tsx";
import { Sheet } from "../../../../src/app/kit/Sheet.tsx";
import type { SheetState } from "../../../../src/app/kit/Sheet.tsx";
import { Stepper } from "../../../../src/app/kit/Stepper.tsx";
import { Tabs } from "../../../../src/app/kit/Tabs.tsx";

/**
 * Kit interaction tier (UI_V1.6.1_ARCHITECTURE §9.3): keyboard and focus behaviour that static
 * markup cannot show. Driven with react-dom/client and `act`; no testing library.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function mount(element: ReactElement, locale: "en" | "zh-CN" = "en"): void {
  act(() => root.render(<I18nProvider defaultLocale={locale} strict>{element}</I18nProvider>));
}

function key(target: Element, keyName: string): void {
  act(() => {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: keyName, bubbles: true, cancelable: true }));
  });
}

function click(target: Element): void {
  act(() => {
    (target as HTMLElement).click();
  });
}

const $ = <E extends Element = HTMLElement>(selector: string): E => {
  const found = container.querySelector<E>(selector);
  if (found === null) throw new Error(`no ${selector}`);
  return found;
};

describe("Button", () => {
  it("ignores activation while disabled or busy, and never submits", () => {
    const onClick = vi.fn();
    const onSubmit = vi.fn((event: Event) => event.preventDefault());
    mount(
      <form onSubmit={(event) => onSubmit(event.nativeEvent)}>
        <Button type="submit" disabled onClick={onClick}>Confirm</Button>
        <Button busy onClick={onClick}>Busy</Button>
        <Button onClick={onClick}>Go</Button>
      </form>,
    );
    const [confirm, busy, go] = Array.from(container.querySelectorAll("button"));
    click(confirm!);
    click(busy!);
    expect(onClick).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
    confirm!.focus();
    expect(document.activeElement).toBe(confirm);
    click(go!);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("OptionGroup", () => {
  function Group({ onChange }: { onChange: (value: string) => void }) {
    const [value, setValue] = useState<string | null>(null);
    return (
      <OptionGroup legend="Worker" name="workerId" value={value} onChange={(next) => { onChange(next); setValue(next); }}>
        <OptionCard value="shifu" title="Shifu" />
        <OptionCard value="apprentice" title="Apprentice" disabled reason="None left" />
      </OptionGroup>
    );
  }

  it("selects with native radios and ignores an unavailable option", () => {
    const onChange = vi.fn();
    mount(<Group onChange={onChange} />);
    const shifu = $<HTMLInputElement>('input[value="shifu"]');
    const apprentice = $<HTMLInputElement>('input[value="apprentice"]');
    click(apprentice);
    expect(onChange).not.toHaveBeenCalled();
    expect(apprentice.checked).toBe(false);
    click(shifu);
    expect(onChange).toHaveBeenCalledWith("shifu");
    expect(shifu.checked).toBe(true);
    expect(container.querySelector('[data-checked="true"] input')).toBe(shifu);
  });
});

describe("Tabs", () => {
  function Board() {
    const [selected, setSelected] = useState("home");
    return (
      <Tabs label="Boards" selected={selected} onSelect={setSelected} tabs={[{ id: "home", label: "Yours" }, { id: "p2", label: "Zhao" }, { id: "p3", label: "Su" }]}>
        <p data-board={selected}>{selected}</p>
      </Tabs>
    );
  }

  it("moves focus and selection with the arrow keys, Home and End (roving tabindex)", () => {
    mount(<Board />);
    const tabs = () => Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
    tabs()[0]!.focus();
    key(tabs()[0]!, "ArrowRight");
    expect(document.activeElement).toBe(tabs()[1]);
    expect(tabs()[1]!.getAttribute("aria-selected")).toBe("true");
    expect(tabs().map((tab) => tab.tabIndex)).toEqual([-1, 0, -1]);
    expect($('[role="tabpanel"]').textContent).toBe("p2");
    key(tabs()[1]!, "End");
    expect(document.activeElement).toBe(tabs()[2]);
    key(tabs()[2]!, "ArrowRight");
    expect(document.activeElement).toBe(tabs()[0]);
    key(tabs()[0]!, "ArrowLeft");
    expect(document.activeElement).toBe(tabs()[2]);
    key(tabs()[2]!, "Home");
    expect($('[role="tabpanel"]').textContent).toBe("home");
  });
});

describe("Disclosure", () => {
  it("closes on Escape and returns focus to its summary", () => {
    mount(<Disclosure summary="Full rules" defaultOpen><button type="button">inside</button></Disclosure>);
    const details = $<HTMLDetailsElement>("details");
    const inside = $<HTMLButtonElement>("details button");
    inside.focus();
    expect(details.open).toBe(true);
    key(inside, "Escape");
    expect(details.open).toBe(false);
    expect(document.activeElement).toBe($("summary"));
  });
});

describe("Sheet", () => {
  function Pane() {
    const [state, setState] = useState<SheetState>("peek");
    return (
      <Sheet state={state} onStateChange={setState} strip="Your turn">
        <h2>Place a worker</h2>
        <button type="button">field</button>
      </Sheet>
    );
  }

  it("focuses its heading when opened and returns focus to the strip on Escape", () => {
    mount(<Pane />);
    const strip = $<HTMLButtonElement>(".kit-sheet-strip");
    click(strip);
    expect(strip.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe($("h2"));
    key($("h2"), "Escape");
    expect($(".kit-sheet").getAttribute("data-sheet")).toBe("peek");
    expect(document.activeElement).toBe(strip);
  });
});

describe("MenuButton", () => {
  it("opens on its first item, moves with the arrows and returns focus on Escape", () => {
    const leave = vi.fn();
    mount(
      <MenuButton
        label="Menu"
        items={[
          { id: "light", label: "Light", onSelect: vi.fn(), checked: true, group: "Theme", keepOpen: true },
          { id: "copy", label: "Copy room code", onSelect: vi.fn(), disabled: true },
          { id: "leave", label: "Leave view", onSelect: leave },
        ]}
      />,
    );
    const button = $<HTMLButtonElement>(".kit-menu-button");
    click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    const items = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="menuitem"], [role="menuitemradio"]'));
    expect(document.activeElement).toBe(items[0]);
    key(items[0]!, "ArrowDown");
    expect(document.activeElement).toBe(items[2]);
    key(items[2]!, "Escape");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(button);
    click(button);
    click(container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')[1]!);
    expect(leave).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(button);
  });
});

describe("PieceDetail", () => {
  it("opens on click, closes on Escape (focus returns) and on an outside click", () => {
    mount(<div><PieceDetail label="Your Celadon Vase, Carved" trigger={<span>art</span>}>Glaze: Celadon</PieceDetail><p id="outside">x</p></div>);
    const trigger = $<HTMLButtonElement>(".kit-detail-trigger");
    const panel = $(".kit-detail-panel");
    expect(panel.hidden).toBe(true);
    click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(panel.hidden).toBe(false);
    $<HTMLButtonElement>(".kit-detail-close").focus();
    key($(".kit-detail-close"), "Escape");
    expect(panel.hidden).toBe(true);
    expect(document.activeElement).toBe(trigger);
    click(trigger);
    act(() => {
      $("#outside").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
    expect(panel.hidden).toBe(true);
  });
});

describe("PieceDetail on keyboard focus (D10: click, tap or focus)", () => {
  function focus(target: HTMLElement): void {
    act(() => target.focus());
  }

  it("opens unpinned on keyboard focus and closes when focus leaves", () => {
    mount(<div><PieceDetail label="Your Celadon Vase, Carved" trigger={<span>Your Celadon Vase, Carved</span>}>Glaze: Celadon</PieceDetail><button id="next">next</button></div>);
    const trigger = $<HTMLButtonElement>(".kit-detail-trigger");
    const panel = $(".kit-detail-panel");
    focus(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(panel.hidden).toBe(false);
    focus($<HTMLButtonElement>("#next"));
    expect(panel.hidden).toBe(true);
  });

  it("stays open while focus moves into its panel, and pins on Enter/click", () => {
    mount(<div><PieceDetail label="Kiln Furniture" trigger={<span>Kiln Furniture</span>}>details</PieceDetail><button id="next">next</button></div>);
    const trigger = $<HTMLButtonElement>(".kit-detail-trigger");
    focus(trigger);
    focus($<HTMLButtonElement>(".kit-detail-close"));
    expect($(".kit-detail-panel").hidden).toBe(false);
    focus(trigger);
    click(trigger);
    focus($<HTMLButtonElement>("#next"));
    expect($(".kit-detail-panel").hidden).toBe(false);
  });

  it("does not reopen when Escape or Close returns focus to the button", () => {
    mount(<PieceDetail label="Kiln Furniture" trigger={<span>Kiln Furniture</span>}>details</PieceDetail>);
    const trigger = $<HTMLButtonElement>(".kit-detail-trigger");
    focus(trigger);
    key(trigger, "Escape");
    expect(document.activeElement).toBe(trigger);
    expect($(".kit-detail-panel").hidden).toBe(true);
    click(trigger);
    click($(".kit-detail-close"));
    expect(document.activeElement).toBe(trigger);
    expect($(".kit-detail-panel").hidden).toBe(true);
  });

  it("does not open on the focus that a pointer press gives; the click then pins it", () => {
    mount(<PieceDetail label="Kiln Furniture" trigger={<span>Kiln Furniture</span>}>details</PieceDetail>);
    const trigger = $<HTMLButtonElement>(".kit-detail-trigger");
    act(() => {
      trigger.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
    focus(trigger);
    expect($(".kit-detail-panel").hidden).toBe(true);
    click(trigger);
    expect($(".kit-detail-panel").hidden).toBe(false);
  });
});

describe("ReorderList", () => {
  function Order() {
    const [ids, setIds] = useState(["T10", "T15", "T22"]);
    const names: Record<string, string> = { T10: "Colour Samples", T15: "Kiln Furniture", T22: "Setter's Mark" };
    return <ReorderList label="Bottom order" items={ids.map((id) => ({ id, label: names[id] ?? id }))} onReorder={setIds} />;
  }

  it("moves items with buttons, keeps focus on the moved item and announces the move", () => {
    mount(<Order />);
    const up = $<HTMLButtonElement>('[aria-label="Move Kiln Furniture up"]');
    up.focus();
    click(up);
    const order = Array.from(container.querySelectorAll("li")).map((item) => item.getAttribute("data-id"));
    expect(order).toEqual(["T15", "T10", "T22"]);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Move Kiln Furniture down");
    expect($('[aria-live="polite"]').textContent).toBe("Kiln Furniture moved to position 1");
    click($('[aria-label="Move Kiln Furniture up"]'));
    expect(Array.from(container.querySelectorAll("li")).map((item) => item.getAttribute("data-id"))).toEqual(["T15", "T10", "T22"]);
  });
});

describe("Stepper", () => {
  function Count() {
    const [value, setValue] = useState(1);
    return <Stepper label="Clay" value={value} min={0} max={2} onChange={setValue} />;
  }

  it("stays within its bounds", () => {
    mount(<Count />);
    const more = $<HTMLButtonElement>('[aria-label="One more Clay"]');
    click(more);
    click(more);
    expect($("output").textContent).toBe("2");
    expect(more.getAttribute("aria-disabled")).toBe("true");
    click($('[aria-label="One fewer Clay"]'));
    expect($("output").textContent).toBe("1");
  });
});

describe("LanguageToggle", () => {
  it("switches the language, sets <html lang> and stores the choice", () => {
    const stored = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (name: string) => stored.get(name) ?? null,
      setItem: (name: string, value: string) => void stored.set(name, value),
      removeItem: (name: string) => void stored.delete(name),
    });
    function Probe() {
      return <><LanguageToggle /><Stepper label="x" value={0} min={0} max={1} onChange={() => undefined} /></>;
    }
    mount(<Probe />);
    expect(document.documentElement.lang).toBe("en");
    click($('[lang="zh-Hans"]'));
    expect(document.documentElement.lang).toBe("zh-Hans");
    expect($('[lang="zh-Hans"]').getAttribute("aria-pressed")).toBe("true");
    expect(container.textContent).toContain("中文");
    expect(container.querySelector('[aria-label="增加x"]')).not.toBeNull();
    expect(stored.get("kiln-opening:language")).toBe("zh-CN");
    vi.unstubAllGlobals();
  });
});
