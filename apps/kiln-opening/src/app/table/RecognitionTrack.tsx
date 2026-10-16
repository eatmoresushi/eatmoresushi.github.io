/**
 * RecognitionTrack (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B2 (table and boards).
 * Source: wireframe `recognitionTrack`: `players[].recognition` and the milestones, rewards kept on phones.
 *
 * The Imperial Recognition track 0–4 with each milestone's title and reward (from
 * `IMPERIAL_TRACK` through `i18n/content`) and each player's Recognition marker. Rewards are never
 * hidden by width (§7.3): on narrow screens the track scrolls inside itself. Each milestone opens
 * its rules details (D10); Recognition 4 also carries the Crowns-beyond-4 clarifications.
 */
import type { CSSProperties } from "react";
import { useT } from "../i18n/I18nProvider.tsx";
import { RULE_NUMBERS, recognitionMilestones } from "../i18n/content.ts";
import { list, num } from "../i18n/format.ts";
import { useGame } from "../state/hooks.ts";
import { RulesDetail } from "../rules/RulesDetail.tsx";
import "./RecognitionTrack.css";

/** Milestones from this space on are Imperial rewards (wireframe `.rs.imp`). */
const IMPERIAL_FROM = 2;

export function RecognitionTrack() {
  const t = useT();
  const model = useGame();
  const milestones = recognitionMilestones(t.locale);
  return (
    <div className="recog-block">
      <div className="recog-h">
        <h3>{t("table.recognition.title")}</h3>
        <span className="recog-meta">{t("table.recognition.range", { from: 0, to: RULE_NUMBERS.recognitionMax })}</span>
      </div>
      <ol className="recog">
        {milestones.map((milestone) => {
          const here = model.players.filter((summary) => summary.recognition === milestone.space);
          const names = here.map((summary) => summary.displayName);
          const face = (
            <span className="rs-face">
              <span className="rs-n num" aria-hidden="true">{num(milestone.space)}</span>
              <span className="sr-only">{t("table.recognition.space", { n: milestone.space })}</span>
              <span className="rs-title">{milestone.title}</span>
              {milestone.reward === null ? null : <span className="rs-reward">{milestone.reward}</span>}
            </span>
          );
          return (
            <li key={milestone.space} className={milestone.space >= IMPERIAL_FROM ? "rs rs--imperial" : "rs"} data-recognition={milestone.space}>
              <RulesDetail subject={{ kind: "recognition", space: milestone.space }} trigger={face} className="rs-detail" />
              <p className="rs-who">
                {names.length === 0 ? null : <span className="sr-only">{t("table.recognition.here", { names: list(names, t.locale) })}</span>}
                {here.map((summary) => (
                  <span key={summary.playerId} className="rs-marker" style={{ "--pc": `var(--seat-${summary.seatIndex})` } as CSSProperties} aria-hidden="true">
                    {Array.from(summary.displayName)[0] ?? ""}
                  </span>
                ))}
              </p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
