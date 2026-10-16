// @vitest-environment happy-dom
/**
 * Playtest Form V3 interaction (B3; §9.3): a failed check lists the issues in an alert that takes
 * focus; a valid record goes through the submit function (`submitPlaytest` in production), shows
 * its reference and clears the saved draft; a failed submission explains itself and keeps the
 * draft; switching the language keeps every entry; edits are saved as they are made.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPlaytestDraft } from "../../../../src/playtest/model.ts";
import type { PlaytestSubmission, PlaytestSubmitResult } from "../../../../src/playtest/types.ts";
import { I18nProvider } from "../../../../src/app/i18n/I18nProvider.tsx";
import { PLAYTEST_DRAFT_KEY, PlaytestFormPage } from "../../../../src/app/playtest/PlaytestFormPage.tsx";
import { MemoryStorage, validDraft } from "./support.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let storage: MemoryStorage;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  storage = new MemoryStorage();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function submitForm(): Promise<void> {
  const form = container.querySelector("form")!;
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
}

function mount(props: Parameters<typeof PlaytestFormPage>[0], locale: "en" | "zh-CN" = "en"): void {
  act(() =>
    root.render(
      <I18nProvider defaultLocale={locale} strict>
        <PlaytestFormPage {...props} />
      </I18nProvider>,
    ),
  );
}

describe("submitting", () => {
  it("lists issues in a focused alert, each linking to its field", async () => {
    const submit = vi.fn<(payload: PlaytestSubmission) => Promise<PlaytestSubmitResult>>();
    mount({ initialDraft: createPlaytestDraft(2), storage: storage, submit });
    await submitForm();
    expect(submit).not.toHaveBeenCalled();
    const alert = container.querySelector<HTMLElement>('[role="alert"][data-issues]')!;
    expect(alert).toBeTruthy();
    expect(document.activeElement).toBe(alert);
    expect(alert.textContent).toContain("Please check these fields.");
    const link = alert.querySelector("a")!;
    const target = document.getElementById(link.getAttribute("href")!.slice(1));
    expect(target).toBeTruthy();
  });

  it("sends a valid record, shows its reference and clears the saved draft", async () => {
    const submit = vi.fn(async (_payload: PlaytestSubmission): Promise<PlaytestSubmitResult> => ({ ok: true, gameId: "PT-0042" }));
    mount({ initialDraft: validDraft(2), storage: storage, submit });
    expect(storage.getItem(PLAYTEST_DRAFT_KEY)).not.toBeNull();
    await submitForm();
    expect(submit).toHaveBeenCalledTimes(1);
    const payload = submit.mock.calls[0]![0];
    expect(payload.formVersion).toBe(3);
    expect(payload.players.map((player) => player.kilnId)).toEqual(["RU", "GU"]);
    expect(container.querySelector("[data-submitted]")?.textContent).toContain("PT-0042");
    expect(storage.getItem(PLAYTEST_DRAFT_KEY)).toBeNull();
  });

  it("explains a failed submission and keeps the draft", async () => {
    const submit = vi.fn(async (): Promise<PlaytestSubmitResult> => ({ ok: false, code: "NOT_CONFIGURED", message: "x" }));
    mount({ initialDraft: validDraft(3), storage: storage, submit }, "zh-CN");
    await submitForm();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("本站尚未接入试玩记录数据库。");
    expect(storage.getItem(PLAYTEST_DRAFT_KEY)).not.toBeNull();
  });
});

describe("editing", () => {
  it("saves edits as they are made and keeps them across a language switch", () => {
    mount({ initialDraft: createPlaytestDraft(2), storage: storage });
    const name = container.querySelector<HTMLInputElement>('input[name="players.0.name"]')!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(name, "Lin");
      name.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(JSON.parse(storage.getItem(PLAYTEST_DRAFT_KEY)!).players[0].name).toBe("Lin");
    const chinese = container.querySelector<HTMLButtonElement>('.kit-seg-btn[lang="zh-Hans"]')!;
    act(() => chinese.click());
    expect(container.textContent).toContain("说说这一局的经过。");
    expect(container.querySelector<HTMLInputElement>('input[name="players.0.name"]')!.value).toBe("Lin");
  });
});
