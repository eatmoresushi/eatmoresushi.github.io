/**
 * The whole local stack in node (UI plan §3.9, §10.2 A2 acceptance): `SessionStore` →
 * `createGameApi({ localEndpoint })` (`TestHttpGameApi`) → HTTP → `tools/localBackendV161.ts`
 * → the authoritative service. One human plays a full game against a computer, choosing
 * the first canonical legal command each time; the store advances the computer.
 */

import { once } from "node:events";
import { createServer } from "node:http";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { decisionPrompt, legalCommands } from "../../../../src/game/index.ts";
import { DEFAULT_LOCAL_ENDPOINT, createGameApi } from "../../../../src/multiplayer/client.ts";
import { SessionStore } from "../../../../src/app/session/sessionStore.ts";
import type { GameSnapshot } from "../../../../src/app/session/gameSource.ts";
import { LOCAL_BACKEND_V161_PATH, LocalBackendV161, localBackendV161Middleware } from "../../../../tools/localBackendV161.ts";
import { MemoryStorage } from "./fakeGameApi.ts";

let server: Server;
let endpoint: string;
const requests: string[] = [];

beforeAll(async () => {
  const backend = new LocalBackendV161({ policy: "canonical", seed: 4242, log: () => undefined });
  const middleware = localBackendV161Middleware(backend);
  server = createServer((request, response) => {
    requests.push(request.url ?? "");
    middleware(request, response, () => undefined);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}${LOCAL_BACKEND_V161_PATH}`;
  const session = new Map<string, string>();
  vi.stubEnv("VITE_E2E_LOCAL_BACKEND", "1");
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => session.get(key) ?? null,
    setItem: (key: string, value: string) => session.set(key, value),
    removeItem: (key: string) => session.delete(key),
  });
});

afterAll(() => {
  server.close();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

async function waitFor(predicate: (snapshot: GameSnapshot) => boolean, store: SessionStore, ms = 15_000): Promise<GameSnapshot> {
  const deadline = Date.now() + ms;
  for (;;) {
    const snapshot = store.getSnapshot();
    if (predicate(snapshot)) return snapshot;
    if (Date.now() > deadline) throw new Error(`Timed out; status ${JSON.stringify(snapshot.status)}, phase ${snapshot.view?.game.phase.type}`);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe("SessionStore over the V1.6.1 local backend", () => {
  it("createGameApi keeps /test-api as its default local endpoint", () => {
    expect(DEFAULT_LOCAL_ENDPOINT).toBe("/test-api");
  });

  it("plays a full game against a computer through the real client", async () => {
    const store = new SessionStore({ api: createGameApi({ localEndpoint: endpoint }), storage: new MemoryStorage() });
    try {
      expect(await store.create("Lin")).toEqual({ ok: true });
      expect(requests.every((url) => url === LOCAL_BACKEND_V161_PATH)).toBe(true);
      expect(await store.addComputer()).toEqual({ ok: true });
      expect(await store.start()).toEqual({ ok: true });
      const me = store.getSnapshot().seat!.playerId;

      let commands = 0;
      for (;;) {
        const snapshot = await waitFor((s) => {
          if (s.view === null || s.status.sending || s.status.advancingComputers) return false;
          if (s.status.computerFailure !== null) return true;
          return s.view.game.phase.type === "finished" || decisionPrompt(s.view.game).actorIds.includes(me);
        }, store);
        expect(snapshot.status.computerFailure).toBeNull();
        const view = snapshot.view!;
        if (view.game.phase.type === "finished") break;
        const [next] = legalCommands(view, { mode: "canonical", limit: 1 });
        expect(next, `no legal command in ${view.game.phase.type}`).toBeDefined();
        const outcome = await store.submit(next!);
        expect(outcome.kind, JSON.stringify(store.getSnapshot().status.error)).toBe("success");
        commands += 1;
        expect(commands).toBeLessThan(2_000);
      }

      const final = store.getSnapshot();
      expect(final.view?.game.finalResult).not.toBeNull();
      expect(final.view?.game.round).toBe(5);
      // At least one worker placement per round per worker (4 workers × 5 rounds).
      expect(commands).toBeGreaterThanOrEqual(20);
      expect(final.room?.status).toBe("finished");
      // Every public event was logged exactly once, in order.
      expect(final.log.map((entry) => entry.sequence)).toEqual(Array.from({ length: final.view!.game.eventSequence }, (_, i) => i + 1));
      expect(final.log.some((entry) => entry.actorId !== me)).toBe(true);
    } finally {
      store.dispose();
    }
  }, 180_000);
});
