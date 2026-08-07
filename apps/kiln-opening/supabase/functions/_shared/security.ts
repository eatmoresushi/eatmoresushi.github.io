import type { SecurityProvider } from "../../../src/multiplayer/index.ts";

const ROOM_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
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

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export class EdgeSecurityProvider implements SecurityProvider {
  randomId(): string {
    return crypto.randomUUID();
  }

  randomRoomCode(): string {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    return [...bytes].map((byte) => ROOM_ALPHABET[byte % ROOM_ALPHABET.length]).join("");
  }

  randomSeatToken(): string {
    return base64Url(crypto.getRandomValues(new Uint8Array(32)));
  }

  randomSeed(): number {
    return crypto.getRandomValues(new Uint32Array(1))[0]!;
  }

  hashSecret(value: string): Promise<string> {
    return sha256(value);
  }

  hashJson(value: unknown): Promise<string> {
    return sha256(canonicalJson(value));
  }
}
