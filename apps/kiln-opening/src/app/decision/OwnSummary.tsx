/**
 * OwnSummary (UI_V1.6.1_ARCHITECTURE §4.1, §4.2; wireframe `ownSummary`). Frozen after phase A;
 * changes go through B6.
 *
 * The viewer's own line at the top of the decision pane: name, resources, available workers,
 * Orders in hand (a private count: only you see the hand itself), Imperial Recognition (n/4, which
 * the Magistrate's Hall "Recognition 0–2 only" choice reads) and recorded VP. Nothing for a
 * spectator. Every value comes from `playerSummary` / `handLimitStatus`; nothing is computed.
 */
import type { CSSProperties } from "react";
import { useId } from "react";
import { useT } from "../i18n/I18nProvider.tsx";
import { RULE_NUMBERS } from "../i18n/content.ts";
import { CardBack } from "../pieces/CardBack.tsx";
import { ResourceRow } from "../pieces/ResourceRow.tsx";
import { WorkerPiece } from "../pieces/WorkerPiece.tsx";
import { useEngineView, useGame } from "../state/hooks.ts";
import "./OwnSummary.css";

export function OwnSummary() {
  const t = useT();
  const model = useGame();
  const { view } = useEngineView();
  const headingId = useId();
  const me = model.me;
  if (me === null) return null;
  const hand = model.handLimits[me.playerId];
  const workers = view.game.players[me.playerId]?.workers ?? {};
  const style = { "--pc": `var(--seat-${me.seatIndex})` } as CSSProperties;
  return (
    <section className="own" style={style} aria-labelledby={headingId} data-player-id={me.playerId}>
      <h3 className="own-name" id={headingId}>
        {t("common.nameYou", { name: me.displayName })}
      </h3>
      <div className="own-line">
        <ResourceRow resources={me.resources} />
        <span className="own-workers">
          {me.availableWorkerIds.map((workerId) => {
            const kind = workers[workerId]?.kind;
            return kind === undefined ? null : <WorkerPiece key={workerId} kind={kind} seat={me.seatIndex} own />;
          })}
        </span>
        <CardBack count={hand?.held ?? me.orderHandCount} label={t("common.piece.ordersInHand", { n: hand?.held ?? me.orderHandCount })} showCount maxDrawn={1} />
        <span className="own-recognition num" data-recognition={me.recognition}>
          {t("common.recognitionN", { n: me.recognition, max: RULE_NUMBERS.recognitionMax })}
        </span>
        <span className="own-vp num">{t.rich("common.vpN", { n: me.recordedVp })}</span>
      </div>
    </section>
  );
}
