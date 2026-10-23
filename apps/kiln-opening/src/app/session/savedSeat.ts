/**
 * The seat credential saved on this device (UI plan §3.2, §3.9).
 *
 * `localStorage` holds only:
 * - `kiln-opening:v161:seat:<roomCode>` → `{ roomCode, seatToken }`;
 * - `kiln-opening:v161:last-room` → the room code to resume on load.
 *
 * Nothing about the game (hand, looks, peeks, own secrets) is ever written here. Every
 * storage call is wrapped in try/catch: storage may be missing or throw in a private window,
 * with blocked site data or during SSR, and the app then simply has no saved seat.
 *
 * The V1.4 app shares this origin during phase 4 and still uses `kiln-opening:last-seat`,
 * so its keys are removed only by the cutover commit C2.1, which flips
 * `REMOVE_LEGACY_V14_KEYS` (§10.4).
 */

export interface SavedSeat {
  roomCode: string;
  seatToken: string;
}

/** The subset of `Storage` the session uses; tests pass a map-backed fake. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const SEAT_KEY_PREFIX = "kiln-opening:v161:seat:";
export const LAST_ROOM_KEY = "kiln-opening:v161:last-room";
export const LEGACY_V14_KEYS = ["kiln-opening:last-seat", "kiln-opening:playtest-draft-v2"] as const;
/** Flipped to true by cutover commit C2.1, never before (the V1.4 app still uses the keys). */
export const REMOVE_LEGACY_V14_KEYS = false;

export function seatKey(roomCode: string): string {
  return `${SEAT_KEY_PREFIX}${roomCode.toUpperCase()}`;
}

/** `window.localStorage`, or null when it is unavailable or throws on access. */
export function browserStorage(): KeyValueStorage | null {
  try {
    if (typeof window === "undefined") return null;
    const storage = window.localStorage;
    return storage ?? null;
  } catch {
    return null;
  }
}

function parseSeat(raw: string | null): SavedSeat | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const record = value as Record<string, unknown>;
    const roomCode = record["roomCode"];
    const seatToken = record["seatToken"];
    if (typeof roomCode !== "string" || roomCode.length === 0) return null;
    if (typeof seatToken !== "string" || seatToken.length === 0) return null;
    return { roomCode, seatToken };
  } catch {
    return null;
  }
}

export class SavedSeatStore {
  constructor(private readonly storage: KeyValueStorage | null) {}

  /** The seat of the last room, or null. */
  last(): SavedSeat | null {
    const roomCode = this.read(LAST_ROOM_KEY);
    return roomCode === null || roomCode.length === 0 ? null : this.forRoom(roomCode);
  }

  forRoom(roomCode: string): SavedSeat | null {
    return parseSeat(this.read(seatKey(roomCode)));
  }

  /** Saves the credential and makes its room the one resumed on load. */
  save(seat: SavedSeat): void {
    const roomCode = seat.roomCode.toUpperCase();
    this.write(seatKey(roomCode), JSON.stringify({ roomCode, seatToken: seat.seatToken }));
    this.write(LAST_ROOM_KEY, roomCode);
  }

  /** Forgets one room's credential, and the last-room pointer if it named that room. */
  forget(roomCode: string): void {
    const code = roomCode.toUpperCase();
    this.remove(seatKey(code));
    if (this.read(LAST_ROOM_KEY)?.toUpperCase() === code) this.remove(LAST_ROOM_KEY);
  }

  /** One-time cleanup of the V1.4 keys; a no-op until cutover enables it. */
  removeLegacyKeys(enabled: boolean = REMOVE_LEGACY_V14_KEYS): void {
    if (!enabled) return;
    for (const key of LEGACY_V14_KEYS) this.remove(key);
  }

  private read(key: string): string | null {
    try {
      return this.storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  private write(key: string, value: string): void {
    try {
      this.storage?.setItem(key, value);
    } catch {
      // Storage full or blocked: the seat is simply not remembered on this device.
    }
  }

  private remove(key: string): void {
    try {
      this.storage?.removeItem(key);
    } catch {
      // Ignore: nothing to forget if storage is unavailable.
    }
  }
}
