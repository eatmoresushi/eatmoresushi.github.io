/**
 * LiveAnnouncer (UI_V1.6.1_ARCHITECTURE §8.3). Owner: B1 (shell, log, lobby).
 * Source: wireframe `announcement` and its `#ko-live` region.
 *
 * One polite live region (coalesced) and one alert region.
 * - Each new `lastBatch` of any origin, someone else's private look and becoming an actor are
 *   turned into messages by `announcementFor` (announce.ts). Batches are deduplicated by event
 *   sequence, so nothing is announced twice; the batch present when the game screen mounts is
 *   history, not news, and is skipped.
 * - Messages are coalesced into one update per revision gap, at least `ANNOUNCE_INTERVAL_MS`
 *   apart. "Your turn" is always said last, and only the latest one is kept.
 * - The alert region says the last rejection (`status.error`) in words. A command whose outcome
 *   is unknown is the ConnectionBanner's alert instead, so nothing is said twice.
 * - Everything is stored as `RichMessage`s and formatted at render time: a language switch
 *   re-renders the regions in the new language. A control that formats its own sentence (kit
 *   `ReorderList`) may pass plain text through `announcePolite`.
 * - The other players' turn toasts (`TurnToasts`) show the same moves on screen but are not a
 *   live region: this polite region is the one that says them, so nothing is said twice.
 */
import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n/I18nProvider.tsx";
import { errorTextOptions, storedErrorText } from "../i18n/errors.ts";
import { useGame, useLog, useSession } from "../state/hooks.ts";
import type { GameModel } from "../state/model.ts";
import { ANNOUNCE_INTERVAL_MS, announcementFor, onPoliteAnnouncement } from "./announce.ts";
import type { PoliteMessage } from "./announce.ts";
import { logCeramicView } from "./logCeramics.ts";

const isTurn = (message: PoliteMessage): boolean => typeof message !== "string" && message.key.startsWith("shell.announce.turn.");

interface Coalescer {
  previous: GameModel | null;
  lastSequence: number;
  mounted: boolean;
  pending: PoliteMessage[];
  turn: PoliteMessage | null;
  lastFlush: number;
  timer: ReturnType<typeof setTimeout> | null;
}

export function LiveAnnouncer() {
  const t = useT();
  const model = useGame();
  const { log, lastBatch } = useLog();
  const { status } = useSession();
  const [spoken, setSpoken] = useState<readonly PoliteMessage[]>([]);
  const state = useRef<Coalescer>({ previous: null, lastSequence: -1, mounted: false, pending: [], turn: null, lastFlush: 0, timer: null });

  const flush = useRef(() => {
    const coalescer = state.current;
    coalescer.timer = null;
    const messages: PoliteMessage[] = coalescer.pending.slice();
    if (coalescer.turn !== null) messages.push(coalescer.turn);
    coalescer.pending = [];
    coalescer.turn = null;
    coalescer.lastFlush = Date.now();
    if (messages.length > 0) setSpoken(messages);
  });

  const enqueue = useRef((messages: readonly PoliteMessage[]) => {
    const coalescer = state.current;
    for (const message of messages) {
      if (isTurn(message)) coalescer.turn = message;
      else coalescer.pending.push(message);
    }
    if (coalescer.timer !== null) return;
    const wait = Math.max(0, coalescer.lastFlush + ANNOUNCE_INTERVAL_MS - Date.now());
    coalescer.timer = setTimeout(() => flush.current(), wait);
  });

  useEffect(() => {
    const coalescer = state.current;
    let batch = lastBatch;
    if (batch !== null) {
      const last = batch.firstSequence + batch.events.length - 1;
      if (!coalescer.mounted || last <= coalescer.lastSequence) batch = null;
      coalescer.lastSequence = Math.max(coalescer.lastSequence, last);
    }
    coalescer.mounted = true;
    const announcement = announcementFor(model, batch, coalescer.previous, log);
    coalescer.previous = model;
    if (announcement !== null) enqueue.current(announcement.polite);
  }, [model, lastBatch, log]);

  useEffect(() => onPoliteAnnouncement((message) => enqueue.current([message])), []);

  useEffect(
    () => () => {
      const timer = state.current.timer;
      if (timer !== null) clearTimeout(timer);
    },
    [],
  );

  const error = status.unsent === null ? status.error : null;
  const alert = error === null ? "" : storedErrorText(error, t, errorTextOptions(logCeramicView(model, log), t));

  return (
    <>
      <div className="sr-only" aria-live="polite" aria-atomic="true" data-live="polite">
        {spoken.map((message, index) => (
          <span key={index}>
            {typeof message === "string" ? message : t.message(message)}{" "}
          </span>
        ))}
      </div>
      <div className="sr-only" role="alert" data-live="alert">
        {alert}
      </div>
    </>
  );
}
