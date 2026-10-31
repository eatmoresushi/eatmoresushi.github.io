/**
 * The V1.6.1 local in-memory backend for `npm run dev:local` and the Playwright specs
 * (UI plan §3.9, K11). A port of the V1.4 `tools/localBackend.ts`, which is no longer mounted
 * since the cutover (§10.4 C2.1) and goes in the deletion commit (C2.2); that commit also
 * renames this file and moves it from `/test-api-v161` to `/test-api`. Until then the file and
 * path names stay; the service it runs is the current engine (rules 1.6.2, schema 10, `r33-`;
 * ENGINE_V1.6.2_DELTA.md §9, §15.16, §16.18), and the app at `/kiln-opening/` talks to it.
 *
 * It runs the real `AuthoritativeGameService` over `InMemoryMultiplayerStore`, with:
 * - every operation of `TestHttpGameApi` in `src/multiplayer/client.ts`, including
 *   `list_private_events` (the V1.4 backend lacks it);
 * - `e2e_reset { seed?, policy?: "strategic" | "canonical" }`: a fresh store and service.
 *   `seed` is the game seed (default 720); `policy` the computer policy (default strategic);
 * - `e2e_secret_ids { roomCode, viewerSeat }` (UI plan §3.9, phase B): the Order and Tech IDs
 *   the seat at `viewerSeat` must not see right now — other seats' hands and private looks, the
 *   Main deck and its face-down discard, the Starting box and the Tech decks — minus the IDs a
 *   public event revealed or this seat was shown privately (`tools/fixturePrivacy.ts`'s
 *   `secretIdsFor`, the same definition as the fixtures' secrets oracle; an ID this seat saw
 *   once and that moved unseen since may still show in a past event on the page, so only the
 *   authoritative payload check flags it). A leak-test oracle for `e2e/full_game.spec.ts`
 *   and `e2e/two_humans.spec.ts`: it reads the authoritative state, so it exists only in this
 *   dev backend;
 * - `checkInvariants: true` on the service;
 * - a deterministic `BrowserTestSecurity`: room codes `T00001…`, ids, and every seed come
 *   from the reset. Seat tokens also carry a per-reset nonce, so a credential saved in a
 *   browser before a reset never authenticates into a new room with the same code.
 *
 * Mounted through both `configureServer` and `configurePreviewServer`, so `vite preview` of
 * an e2e build (`npm run build:e2e`) works too. Only when `VITE_E2E_LOCAL_BACKEND=1`
 * (`vite.config.ts`). Dev-only: never part of a production bundle.
 */

import { createHash, randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Connect, Plugin } from "vite";
import {
  AuthoritativeGameService,
  CANONICAL_COMPUTER_POLICY,
  InMemoryMultiplayerStore,
  STRATEGIC_COMPUTER_POLICY,
} from "../src/multiplayer/index.ts";
import type { CommandRequest, MultiplayerResult, RoomConnection, SecurityProvider } from "../src/multiplayer/index.ts";
import { secretIdsFor } from "./fixturePrivacy.ts";

export const LOCAL_BACKEND_V161_PATH = "/test-api-v161";
export const DEFAULT_E2E_SEED = 720;
const MAX_BODY_BYTES = 1_000_000;

export type LocalComputerPolicy = "strategic" | "canonical";

export class BrowserTestSecurity implements SecurityProvider {
  private idSequence = 0;
  private roomSequence = 0;
  private tokenSequence = 0;
  private readonly nonce: string;

  constructor(private readonly seed: number, nonce: string = randomUUID()) {
    this.nonce = nonce.replace(/-/g, "");
  }

  randomId(): string {
    this.idSequence += 1;
    const seedHex = (this.seed >>> 0).toString(16).padStart(8, "0");
    return `${seedHex}-0000-4000-8000-${String(this.idSequence).padStart(12, "0")}`;
  }

  /** `T00001`, `T00002`, … per reset, as in the V1.4 backend. */
  randomRoomCode(): string {
    this.roomSequence += 1;
    return `T${String(this.roomSequence).padStart(5, "0")}`;
  }

  randomSeatToken(): string {
    this.tokenSequence += 1;
    return `e2e-v161-seat-${this.nonce}-${String(this.tokenSequence).padStart(12, "0")}`;
  }

  /** The reset's seed for the game and every computer seat, as in the V1.4 backend. */
  randomSeed(): number {
    return this.seed;
  }

  async hashSecret(value: string): Promise<string> {
    return createHash("sha256").update(value).digest("hex");
  }

  /** Key-order independent, like the service's own canonical hashing. */
  async hashJson(value: unknown): Promise<string> {
    return createHash("sha256").update(canonicalJson(value)).digest("hex");
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function text(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  return typeof value === "string" ? value : value === undefined || value === null ? "" : String(value);
}

function integer(body: Record<string, unknown>, key: string, fallback: number): number {
  const value = body[key];
  return typeof value === "number" && Number.isInteger(value) ? value : fallback;
}

function invalid(message: string): unknown {
  return { ok: false, error: { code: "INVALID_REQUEST", message, details: {}, currentRevision: null } };
}

export interface LocalBackendOptions {
  seed?: number;
  policy?: LocalComputerPolicy;
  /** Server-side diagnostics; default `console.error`. */
  log?: (message: string, context: Record<string, string | number | boolean>) => void;
}

export class LocalBackendV161 {
  private store = new InMemoryMultiplayerStore();
  private service: AuthoritativeGameService;
  /** Room IDs by room code, remembered from `create_room` (the store keeps its own index private). */
  private roomIds = new Map<string, string>();
  private readonly log: NonNullable<LocalBackendOptions["log"]>;

  constructor(options: LocalBackendOptions = {}) {
    this.log = options.log ?? ((message, context) => console.error(message, context));
    this.service = this.makeService(options.seed ?? DEFAULT_E2E_SEED, options.policy ?? "strategic");
  }

  /** One request body, as `TestHttpGameApi` posts it; `authUserId` from `x-e2e-user`. */
  async handle(body: Record<string, unknown>, authUserId: string): Promise<unknown> {
    switch (body["operation"]) {
      case "e2e_reset": {
        const policy = body["policy"];
        if (policy !== undefined && policy !== "strategic" && policy !== "canonical") {
          return invalid("policy must be \"strategic\" or \"canonical\".");
        }
        this.store = new InMemoryMultiplayerStore();
        this.roomIds = new Map();
        this.service = this.makeService(integer(body, "seed", DEFAULT_E2E_SEED), policy ?? "strategic");
        return { ok: true, value: null };
      }
      case "e2e_secret_ids":
        return this.secretIds(text(body, "roomCode"), integer(body, "viewerSeat", -1));
      case "list_public_events":
        return {
          ok: true,
          value: await this.store.listPublicEvents(text(body, "roomId"), Math.max(0, integer(body, "afterSequence", 0))),
        };
      case "list_private_events":
        return this.service.listPrivateEvents({
          roomCode: text(body, "roomCode"),
          seatToken: text(body, "seatToken"),
          afterSequence: integer(body, "afterSequence", 0),
        });
      case "create_room": {
        const created: MultiplayerResult<RoomConnection> = await this.service.createRoom({ displayName: text(body, "displayName"), authUserId });
        if (created.ok) this.roomIds.set(created.value.room.code.toUpperCase(), created.value.room.id);
        return created;
      }
      case "join_room":
        return this.service.joinRoom({ roomCode: text(body, "roomCode"), displayName: text(body, "displayName"), authUserId });
      case "reconnect":
        return this.service.reconnect({ roomCode: text(body, "roomCode"), seatToken: text(body, "seatToken") });
      case "start_game":
        return this.service.startGame({ roomCode: text(body, "roomCode"), seatToken: text(body, "seatToken"), commandId: text(body, "commandId") });
      case "add_computer":
        return this.service.addComputerSeat({ roomCode: text(body, "roomCode"), seatToken: text(body, "seatToken"), commandId: text(body, "commandId") });
      case "remove_computer":
        return this.service.removeComputerSeat({
          roomCode: text(body, "roomCode"),
          seatToken: text(body, "seatToken"),
          computerSeatId: text(body, "computerSeatId"),
        });
      case "advance_computers":
        return this.service.advanceComputerTurns({
          roomCode: text(body, "roomCode"),
          seatToken: text(body, "seatToken"),
          expectedRevision: integer(body, "expectedRevision", -1),
        });
      case "end_session":
        return this.service.endSession({ roomCode: text(body, "roomCode"), seatToken: text(body, "seatToken"), commandId: text(body, "commandId") });
      case "game_action": {
        const request: CommandRequest = {
          roomCode: text(body, "roomCode"),
          seatToken: text(body, "seatToken"),
          commandId: text(body, "commandId"),
          expectedRevision: integer(body, "expectedRevision", -1),
          // Untrusted: the service shape-checks it with `parseCommand`.
          command: body["command"],
        };
        return this.service.executeCommand(request);
      }
      default:
        return invalid("Unknown test operation.");
    }
  }

  /** `e2e_secret_ids`: the secret Order and Tech IDs of one seat, sorted (see the header). */
  private async secretIds(roomCode: string, viewerSeat: number): Promise<unknown> {
    const roomId = this.roomIds.get(roomCode.trim().toUpperCase());
    if (roomId === undefined) return invalid("Unknown room code.");
    const seat = (await this.store.getSeats(roomId)).find((candidate) => candidate.seatIndex === viewerSeat);
    if (seat === undefined) return invalid("No seat at that index.");
    const head = await this.store.loadHead(roomId);
    if (head === null) return { ok: true, value: { revision: null, ids: [] } };
    const events = this.store
      .audit()
      .fullEvents.filter((record) => record.roomId === roomId)
      .sort((a, b) => a.sequence - b.sequence)
      .map((record) => record.event);
    return { ok: true, value: { revision: head.revision, ids: secretIdsFor(head.state, seat.playerId, events) } };
  }

  private makeService(seed: number, policy: LocalComputerPolicy): AuthoritativeGameService {
    const primary = policy === "canonical" ? CANONICAL_COMPUTER_POLICY : STRATEGIC_COMPUTER_POLICY;
    const other = policy === "canonical" ? STRATEGIC_COMPUTER_POLICY : CANONICAL_COMPUTER_POLICY;
    return new AuthoritativeGameService(this.store, new BrowserTestSecurity(seed), {
      computerPolicy: primary,
      additionalComputerPolicies: [other],
      checkInvariants: true,
      logger: { error: this.log },
    });
  }
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown> | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = typeof chunk === "string" ? Buffer.from(chunk) : Buffer.from(chunk as Uint8Array);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) return null;
    chunks.push(buffer);
  }
  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function send(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader("content-type", "application/json");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify(body));
}

/** The connect middleware; exported for tests. */
export function localBackendV161Middleware(backend: LocalBackendV161): Connect.NextHandleFunction {
  return (request: IncomingMessage, response: ServerResponse) => {
    if (request.method !== "POST") {
      send(response, 405, { ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "POST only.", details: {}, currentRevision: null } });
      return;
    }
    void (async () => {
      try {
        const body = await readJson(request);
        if (body === null) {
          send(response, 400, invalid("The request body must be a JSON object."));
          return;
        }
        const header = request.headers["x-e2e-user"];
        const authUserId = typeof header === "string" && header.length > 0 ? header : randomUUID();
        send(response, 200, await backend.handle(body, authUserId));
      } catch (cause) {
        console.error("local V1.6.1 backend failed", cause instanceof Error ? cause.message : String(cause));
        send(response, 500, { ok: false, error: { code: "INTERNAL_SERVER_ERROR", message: "The test backend failed.", details: {}, currentRevision: null } });
      }
    })();
  };
}

/**
 * The Vite plugin. One backend instance serves both the dev and the preview server of a
 * process, at `/test-api-v161`.
 */
export function localBackendV161Plugin(options: LocalBackendOptions = {}): Plugin {
  const backend = new LocalBackendV161(options);
  const middleware = localBackendV161Middleware(backend);
  return {
    name: "kiln-opening-e2e-backend-v161",
    configureServer(server) {
      server.middlewares.use(LOCAL_BACKEND_V161_PATH, middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(LOCAL_BACKEND_V161_PATH, middleware);
    },
  };
}
