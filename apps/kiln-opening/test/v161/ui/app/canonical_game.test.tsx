// @vitest-environment happy-dom
/**
 * The phase A acceptance in `npm test` (UI_V1.6.1_ARCHITECTURE §10.2 A2): the real `App`, with
 * the real browser session store (`createBrowserSessionStore`: `TestHttpGameApi` → HTTP →
 * `tools/localBackendV161.ts` → the authoritative service), one human creates a room, adds a
 * computer, starts, watches live revisions in the stub panes, and finishes a full game by
 * pressing the dev canonical-move button whenever it is their decision.
 *
 * The page's URL is the backend server's origin, so `/test-api-v161` is same-origin, exactly as
 * under `npm run dev:local`. `e2e/smoke.spec.ts` runs the same flow in a real browser.
 */
import { once } from "node:events";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { App } from "../../../../src/app/App.tsx";
import { createBrowserSessionStore } from "../../../../src/app/session/sessionStore.ts";
import type { SessionStore } from "../../../../src/app/session/sessionStore.ts";
import { LOCAL_BACKEND_V161_PATH, LocalBackendV161, localBackendV161Middleware } from "../../../../tools/localBackendV161.ts";

let server: Server;
let origin: string;
let calls = 0;

beforeAll(async () => {
  const backend = new LocalBackendV161({ policy: "canonical", seed: 1_610, log: () => undefined });
  const middleware = localBackendV161Middleware(backend);
  server = createServer((request, response) => {
    if (request.url === LOCAL_BACKEND_V161_PATH) calls += 1;
    middleware(request, response, () => {
      response.statusCode = 404;
      response.end();
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL(`${origin}/kiln-opening/`);
  vi.stubEnv("VITE_E2E_LOCAL_BACKEND", "1");
  // A real asynchronous app: React renders on its own schedule, not inside act().
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
});

afterAll(() => {
  server.close();
  vi.unstubAllEnvs();
});

async function until(what: string, predicate: () => boolean, ms = 30_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe("the V1.6.1 app against the local backend", () => {
  it("plays a full game: create, add a computer, start, canonical moves to the final window", async () => {
    const container = document.createElement("div");
    container.id = "root";
    document.body.appendChild(container);
    const store: SessionStore = createBrowserSessionStore();
    const root: Root = createRoot(container);
    const $ = (selector: string) => container.querySelector<HTMLElement>(selector);
    const errors: unknown[] = [];
    const consoleError = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      errors.push(args);
    });
    try {
      root.render(<App store={store} locale="en" devTools />);
      await until("the home screen", () => $('[data-action="create-room"]') !== null);
      // The real home screen (CR-B1-3) asks for a name first, as the smoke spec types it.
      const nameInput = container.querySelector<HTMLInputElement>('input[name="displayName"]')!;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(nameInput, "Lin");
      nameInput.dispatchEvent(new Event("input", { bubbles: true }));
      $('[data-action="create-room"]')!.click();
      await until("the lobby", () => $("[data-room-code]") !== null);
      expect(store.getSnapshot().room?.status).toBe("lobby");
      $('[data-action="add-computer"]')!.click();
      await until("the computer seat", () => container.querySelectorAll("[data-seat-index]").length === 2);
      $('[data-action="start-game"]')!.click();
      await until("the game screen", () => $("aside.pane") !== null);

      const revisions: number[] = [Number($("aside.pane")!.getAttribute("data-revision"))];
      const windows = new Set<string>();
      let moves = 0;
      for (;;) {
        await until(
          "my decision or the end",
          () => $('form[data-window="final"]') !== null || $('[data-dev="canonical-move"]:not([aria-disabled]):not([aria-busy])') !== null,
          60_000,
        );
        if ($('form[data-window="final"]') !== null) break;
        revisions.push(Number($("aside.pane")!.getAttribute("data-revision")));
        windows.add($("form.pane-form")!.getAttribute("data-window") ?? "");
        $('[data-dev="canonical-move"]')!.click();
        moves += 1;
        expect(moves).toBeLessThan(1_500);
        await until("the answer", () => $('[data-dev="canonical-move"][aria-busy]') === null, 60_000);
      }

      const snapshot = store.getSnapshot();
      expect(snapshot.view?.game.phase.type).toBe("finished");
      expect(snapshot.view?.game.finalResult?.winnerIds.length).toBeGreaterThan(0);
      expect(snapshot.room?.status).toBe("finished");
      expect(moves).toBeGreaterThan(20);
      expect([...windows]).toEqual(expect.arrayContaining(["kiln_selection", "work"]));
      for (let index = 1; index < revisions.length; index += 1) expect(revisions[index]).toBeGreaterThanOrEqual(revisions[index - 1]!);
      expect(revisions.at(-1)).toBeGreaterThan(revisions[0]!);
      expect(calls).toBeGreaterThan(moves);
      expect(errors).toEqual([]);
    } finally {
      consoleError.mockRestore();
      root.unmount();
      store.dispose();
      container.remove();
    }
  }, 120_000);
});
