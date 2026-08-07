import { createHash, randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import {
  AuthoritativeGameService,
  InMemoryMultiplayerStore,
} from "../../src/multiplayer";
import type { SecurityProvider } from "../../src/multiplayer";

class BrowserTestSecurity implements SecurityProvider {
  private sequence = 0;

  randomId(): string {
    return randomUUID();
  }

  randomRoomCode(): string {
    this.sequence += 1;
    return `T${String(this.sequence).padStart(5, "0")}`;
  }

  randomSeatToken(): string {
    return `e2e-seat-${randomUUID()}-${randomUUID()}`;
  }

  randomSeed(): number {
    return 720;
  }

  async hashSecret(value: string): Promise<string> {
    return createHash("sha256").update(value).digest("hex");
  }

  async hashJson(value: unknown): Promise<string> {
    return createHash("sha256").update(JSON.stringify(value)).digest("hex");
  }
}

class LocalBackend {
  private service = this.makeService();

  async handle(body: Record<string, unknown>, authUserId: string): Promise<unknown> {
    switch (body["operation"]) {
      case "e2e_reset":
        this.service = this.makeService();
        return { ok: true, value: null };
      case "create_room":
        return this.service.createRoom({ displayName: String(body["displayName"] ?? ""), authUserId });
      case "join_room":
        return this.service.joinRoom({
          roomCode: String(body["roomCode"] ?? ""),
          displayName: String(body["displayName"] ?? ""),
          authUserId,
        });
      case "reconnect":
        return this.service.reconnect({
          roomCode: String(body["roomCode"] ?? ""),
          seatToken: String(body["seatToken"] ?? ""),
        });
      case "start_game":
        return this.service.startGame({
          roomCode: String(body["roomCode"] ?? ""),
          seatToken: String(body["seatToken"] ?? ""),
          commandId: String(body["commandId"] ?? ""),
        });
      case "game_action":
        return this.service.executeCommand({
          roomCode: String(body["roomCode"] ?? ""),
          seatToken: String(body["seatToken"] ?? ""),
          commandId: String(body["commandId"] ?? ""),
          expectedRevision: Number(body["expectedRevision"]),
          command: body["command"] as Parameters<AuthoritativeGameService["executeCommand"]>[0]["command"],
        });
      default:
        return { ok: false, error: { code: "INVALID_REQUEST", message: "Unknown test operation." } };
    }
  }

  private makeService(): AuthoritativeGameService {
    return new AuthoritativeGameService(new InMemoryMultiplayerStore(), new BrowserTestSecurity());
  }
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

export function localBackendPlugin(): Plugin {
  const backend = new LocalBackend();
  return {
    name: "kiln-opening-e2e-backend",
    configureServer(server) {
      server.middlewares.use("/test-api", async (request: IncomingMessage, response: ServerResponse) => {
        if (request.method !== "POST") {
          response.statusCode = 405;
          response.end();
          return;
        }
        try {
          const body = await readJson(request);
          const result = await backend.handle(body, String(request.headers["x-e2e-user"] ?? randomUUID()));
          response.statusCode = 200;
          response.setHeader("content-type", "application/json");
          response.end(JSON.stringify(result));
        } catch {
          response.statusCode = 500;
          response.end(JSON.stringify({ ok: false, error: { code: "TEST_BACKEND_ERROR" } }));
        }
      });
    },
  };
}
