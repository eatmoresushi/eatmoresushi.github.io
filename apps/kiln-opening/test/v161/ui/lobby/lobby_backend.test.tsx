// @vitest-environment happy-dom
/**
 * The real lobby screens against the local backend (UI_V1.6.1_ARCHITECTURE §10.3 B1 "lobby flows
 * against the local backend"): the real `App` and browser session store, `TestHttpGameApi` over
 * HTTP to `tools/localBackendV161.ts`, with dev tools **off**, so only the B1 screens are on the
 * page. It drives them the way a player does, by their labels and button names:
 *
 * create a room → add two computers, remove one → start → the game screen (top bar, seat chips,
 * log) → Leave view from the session menu → the home screen offers the saved seat → Resume → the
 * same seat and game → End session for everyone (host) → the ended screen → Return home.
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
import { LocalBackendV161, localBackendV161Middleware } from "../../../../tools/localBackendV161.ts";

let server: Server;

beforeAll(async () => {
  const backend = new LocalBackendV161({ policy: "canonical", seed: 4_242, log: () => undefined });
  const middleware = localBackendV161Middleware(backend);
  server = createServer((request, response) => {
    middleware(request, response, () => {
      response.statusCode = 404;
      response.end();
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  (window as unknown as { happyDOM: { setURL(url: string): void } }).happyDOM.setURL(`${origin}/kiln-opening/`);
  vi.stubEnv("VITE_E2E_LOCAL_BACKEND", "1");
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false;
});

afterAll(() => {
  server.close();
  vi.unstubAllEnvs();
});

async function until(what: string, predicate: () => boolean, ms = 20_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe("the B1 lobby screens against the local backend", () => {
  it("create, add and remove computers, start, leave, resume, end the session", async () => {
    const container = document.createElement("div");
    container.id = "root";
    document.body.appendChild(container);
    // This page's storage (happy-dom has none at this origin): the saved seat lives here.
    const memory = new Map<string, string>();
    const storage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => void memory.set(key, value),
      removeItem: (key: string) => void memory.delete(key),
    };
    const store: SessionStore = createBrowserSessionStore({ storage });
    const root: Root = createRoot(container);
    const errors: unknown[] = [];
    // happy-dom logs a network error for every fetch the app aborts on purpose (Leave view aborts
    // the computer advance in flight, §3.8): the socket closes with ECONNRESET. Anything else
    // logged is a real error.
    const abortedFetch = (args: unknown[]) => args.length === 1 && args[0] instanceof Error && (args[0] as { code?: unknown }).code === "ECONNRESET";
    const consoleError = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      if (!abortedFetch(args)) errors.push(args);
    });
    const buttons = () => [...container.querySelectorAll<HTMLButtonElement>("button")];
    const button = (name: string | RegExp) => buttons().find((candidate) => (typeof name === "string" ? candidate.textContent === name : name.test(candidate.textContent ?? "")));
    const press = async (name: string | RegExp) => {
      await until(`a usable "${String(name)}" button`, () => {
        const found = button(name);
        return found !== undefined && found.getAttribute("aria-disabled") !== "true" && found.getAttribute("aria-busy") !== "true";
      });
      button(name)!.click();
    };
    const seatNames = () => [...container.querySelectorAll(".lobby-seat:not([data-open]) .lobby-seat-name")].map((node) => node.textContent);
    const type = (input: HTMLInputElement, value: string) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    };
    try {
      root.render(<App store={store} locale="en" devTools={false} />);
      await until("the home screen", () => button("Create room") !== undefined);
      expect(container.querySelector(".dev-session")).toBeNull();

      // Home → lobby.
      const name = [...container.querySelectorAll<HTMLLabelElement>("label")].find((label) => label.textContent === "Your name")!;
      type(container.querySelector<HTMLInputElement>(`#${CSS.escape(name.htmlFor)}`)!, "Lin");
      await press("Create room");
      await until("the lobby", () => container.querySelector(".lobby-title")?.textContent?.startsWith("Room ") === true);
      const code = store.getSnapshot().room!.code;
      expect(container.querySelector(".lobby-title")?.textContent).toBe(`Room ${code}`);
      expect(seatNames()).toEqual(["Lin (you)"]);
      expect(button("Start with 1 player")?.getAttribute("aria-disabled")).toBe("true");

      // Two computers, then remove one.
      await press("Add a computer player");
      await until("one computer", () => seatNames().length === 2);
      await press("Add a computer player");
      await until("two computers", () => seatNames().length === 3);
      const remove = buttons().filter((candidate) => candidate.getAttribute("aria-label")?.startsWith("Remove ") === true);
      expect(remove).toHaveLength(2);
      remove[1]!.click();
      await until("one computer left", () => seatNames().length === 2);
      expect(container.querySelector(".lobby-seat[data-computer] .lobby-seat-role")?.textContent).toBe("Computer player");

      // Start → the game screen.
      await press("Start with 2 players");
      await until("the game screen", () => container.querySelector("header.top-bar") !== null && container.querySelector("aside.pane") !== null);
      expect(container.querySelectorAll(".seat-chip")).toHaveLength(2);
      expect(container.querySelector(".seat-chip[data-me]")?.getAttribute("aria-label")).toMatch(/^Your workshop · /);
      expect(container.querySelector(".phase-strip [aria-current='step']")).not.toBeNull();
      const revision = store.getSnapshot().view!.game.revision;
      const playerId = store.getSnapshot().seat!.playerId;

      // Leave view from the session menu → home offers the saved seat.
      await press("Leave view (your seat is kept)");
      await until("home with a saved seat", () => button("Resume") !== undefined);
      expect(container.textContent).toContain(`Room ${code}`);

      // Resume → the same seat and game.
      await press("Resume");
      await until("the game again", () => container.querySelector("header.top-bar") !== null);
      expect(store.getSnapshot().seat!.playerId).toBe(playerId);
      expect(store.getSnapshot().view!.game.revision).toBeGreaterThanOrEqual(revision);

      // End session for everyone → the ended screen → home.
      await press("End session for everyone…");
      await until("the dialog", () => container.querySelector("dialog.end-dialog")?.hasAttribute("open") === true);
      await press("End session for everyone");
      await until("the ended screen", () => container.textContent?.includes("This session has ended.") === true);
      expect(container.textContent).toContain(`ended room ${code} for everyone.`);
      await press("Return home");
      await until("home", () => button("Create room") !== undefined);
      if (errors.length > 0) process.stdout.write(`ERRORS ${errors.length}\n${errors.map((e) => (e as unknown[]).map((x) => (x instanceof Error ? `${x.message}\n${x.stack}` : String(x))).join(" ")).join("\n----\n")}\n`);
      expect(errors).toEqual([]);
    } finally {
      consoleError.mockRestore();
      root.unmount();
      store.dispose();
      container.remove();
    }
  }, 60_000);
});
