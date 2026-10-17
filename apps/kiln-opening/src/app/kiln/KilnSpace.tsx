/**
 * KilnSpace (UI_V1.6.1_ARCHITECTURE §4.2). Owner: B3 (kiln, firing stage, results, playtest).
 * Source: wireframe `sharedKiln` cell: zone and modifier, stacks, Setter's Mark, Kiln Furniture,
 * markers, pending chips, target button.
 *
 * - A covered space (by player count) shows "Covered (2P)" and is never a target (D7: never 封).
 * - An active space shows its name and the modifier its ceramics use (Kiln Furniture's, else
 *   the zone's, from `effectiveModifier`), its ceramics with their markers and this firing's
 *   Quality, an Inverted Firing stack, and the Setter's Mark and Kiln Furniture tiles. Each tile
 *   opens its Tech's rules details (D10).
 * - When the open decision offers this space (`useTableSelection().kilnTargets`: a Glaze & Load
 *   destination or a Setter's Mark space), the whole cell is a toggle button; a click becomes a
 *   draft action of that window (§3.5). Ceramics the draft would load here show as dashed
 *   "pending" chips.
 *
 * No heat value is shown on a ceramic or a space (D3).
 */
import type { ReactNode } from "react";
import type { CeramicId, FireModifier, Glaze, KilnSpaceId, KilnSpaceView, PlayerId } from "../../game/index.ts";
import { useT } from "../i18n/I18nProvider.tsx";
import { KILN_TECHS } from "../i18n/catalog/kiln.ts";
import { ceramicLabel, kilnSpaceName } from "../i18n/ceramicLabel.ts";
import { glazeName, techName } from "../i18n/content.ts";
import { list, signed } from "../i18n/format.ts";
import type { Translator } from "../i18n/translator.ts";
import { CeramicChip } from "../pieces/CeramicChip.tsx";
import { useGame, useTableSelection } from "../state/hooks.ts";
import type { GameModel } from "../state/model.ts";
import type { TableSelection } from "../state/tableSelection.ts";
import { KilnCeramic, kilnCeramicLabel } from "./KilnCeramic.tsx";
import { RulesDetail } from "../rules/RulesDetail.tsx";
import { playerLabel, seatOf } from "./names.ts";
import { useTableCeramics } from "./tableCeramics.ts";
import type { TableCeramics } from "./tableCeramics.ts";
import { cssVars, seatVar } from "./cssVars.ts";
import "./KilnSpace.css";

export interface KilnSpaceProps {
  /** The Shared Kiln space. */
  spaceId: KilnSpaceId;
}

/** Second Firing's extra Fire card for a ceramic: the open R7 card, else the recorded one. */
export function extraFireFor(model: GameModel, ceramicId: CeramicId): FireModifier | null {
  const stage = model.firingStage;
  if (stage === null) return null;
  if (stage.extraFire !== null && stage.extraFire.ceramicId === ceramicId) return stage.extraFire.modifier;
  return stage.ceramics.find((record) => record.id === ceramicId)?.secondFireModifier ?? null;
}

/** A ceramic the open decision would load (dashed): its picture when the model has it, else its Glaze. */
export function PendingChip({ ceramicId, glaze, ceramics, t }: { ceramicId: CeramicId; glaze: Glaze; ceramics: TableCeramics; t: Translator }) {
  const facts = ceramics.facts(ceramicId);
  const seat = ceramics.view.viewerId === null ? 0 : ceramics.seat(ceramics.view.viewerId);
  if (facts !== null) {
    const glazed = { ...facts, glaze, quality: null, crackle: false };
    const label = t("kiln.pendingChip", { ceramic: ceramicLabel(glazed, ceramics.view, { locale: t, withPlace: false, among: ceramics.all }) });
    return (
      <span className="kpend">
        <CeramicChip ceramic={glazed} seat={seat} label={label} size={30} pending showQuality={false} motionKey={`pending:${ceramicId}`} />
        <span className="kpend-tag" aria-hidden="true">{t("kiln.pending")}</span>
      </span>
    );
  }
  const label = t("kiln.pendingChip", { ceramic: t("kiln.pendingVessel", { glaze: glazeName(glaze, t.locale) }) });
  return (
    <span className="kpend" style={cssVars({ "--pc": `var(--seat-${String(seat)})`, "--glz": `var(--glz-${glaze})` })}>
      <span className="sr-only">{label}</span>
      <span className="kpend-swatch" aria-hidden="true" />
      <span className="kpend-tag" aria-hidden="true">{t("kiln.pending")}</span>
    </span>
  );
}

function tiles(space: KilnSpaceView, model: GameModel, t: Translator, interactive: boolean): ReactNode[] {
  const out: ReactNode[] = [];
  const tile = (key: string, techId: (typeof KILN_TECHS)[keyof typeof KILN_TECHS], ownerId: PlayerId | null, text: string, className: string, seat: number | null) => {
    const body = (
      <span className={`ktile ${className}`} style={seat === null ? undefined : seatVar(seat)}>
        {text}
      </span>
    );
    out.push(
      interactive ? (
        <RulesDetail key={key} subject={{ kind: "tech", id: techId }} trigger={body} className="ktile-detail" />
      ) : (
        <span key={key}>{body}</span>
      ),
    );
  };
  if (space.ceramics.length > 1) {
    const ownerId = space.ceramics[0]?.ownerId ?? null;
    tile("stack", KILN_TECHS.invertedFiring, ownerId, techName(KILN_TECHS.invertedFiring, t.locale), "ktile--stack", null);
  }
  if (space.setterMarkOwnerId !== null) {
    const owner = space.setterMarkOwnerId;
    tile(
      "setter",
      KILN_TECHS.settersMark,
      owner,
      t("kiln.tileOwned", { tile: techName(KILN_TECHS.settersMark, t.locale), owner: playerLabel(model, t, owner) }),
      "ktile--setter",
      seatOf(model, owner),
    );
  }
  if (space.kilnFurniture !== null) {
    const owner = space.kilnFurniture.ownerId;
    tile(
      "furniture",
      KILN_TECHS.kilnFurniture,
      owner,
      t("kiln.tileOwned", {
        tile: t("kiln.tileFurniture", { tech: techName(KILN_TECHS.kilnFurniture, t.locale), modifier: signed(space.kilnFurniture.modifier) }),
        owner: playerLabel(model, t, owner),
      }),
      "ktile--furniture",
      seatOf(model, owner),
    );
  }
  return out;
}

function targetLabel(model: GameModel, t: Translator, space: KilnSpaceView, name: string, ceramics: TableCeramics): string {
  const action = model.window.kind === "setters_mark"
    ? t("kiln.targetSetter", { tech: techName(KILN_TECHS.settersMark, t.locale), space: name })
    : t("kiln.targetLoad", { space: name });
  if (space.ceramics.length === 0) return action;
  const held = space.ceramics.map((ceramic) => kilnCeramicLabel(ceramics, ceramic.id, ceramic.ownerId, t));
  return t("kiln.targetHolds", { action, ceramics: list(held, t.locale) });
}

export function KilnSpace({ spaceId }: KilnSpaceProps) {
  const t = useT();
  const model = useGame();
  const selection: TableSelection = useTableSelection();
  const ceramics = useTableCeramics();
  const space = model.board.kilnSpaces.find((candidate) => candidate.spaceId === spaceId);
  if (space === undefined) return null;
  const name = kilnSpaceName(spaceId, t);
  const playerCount = model.players.length;

  if (!space.active) {
    return (
      <div className="ksp ksp--covered" role="group" aria-label={t("kiln.coveredLabel", { space: name, n: playerCount })} data-space={spaceId} data-covered="">
        <div className="ksp-head" aria-hidden="true">
          <span className="ksp-name">{name}</span>
        </div>
        <div className="ksp-body ksp-covered" aria-hidden="true">{t("kiln.covered", { n: playerCount })}</div>
      </div>
    );
  }

  const target = selection.kilnTargets.get(spaceId);
  const interactive = target === undefined;
  const modifier = signed(space.effectiveModifier);
  const pending = selection.pendingCeramics.filter((entry) => entry.at === spaceId);
  const chips = space.ceramics.map((ceramic) => (
    <KilnCeramic
      key={ceramic.id}
      id={ceramic.id}
      ownerId={ceramic.ownerId}
      marker={ceramic.heatMarker}
      extraFire={extraFireFor(model, ceramic.id)}
      compactQuality
      interactive={interactive}
    />
  ));
  const stacked = space.ceramics.length > 1;
  const body: ReactNode[] = [];
  if (stacked) {
    body.push(
      <span key="stack" className="kstack">
        <span className="kstack-pieces">{chips}</span>
        <span className="kstack-label">{t("kiln.stackN", { n: space.ceramics.length })}</span>
      </span>,
    );
  } else body.push(...chips);
  for (const entry of pending) body.push(<PendingChip key={`pending:${entry.ceramicId}`} ceramicId={entry.ceramicId} glaze={entry.glaze} ceramics={ceramics} t={t} />);
  if (body.length === 0) body.push(<span key="empty" className="ksp-empty">{t("kiln.emptySpace")}</span>);
  const tileNodes = tiles(space, model, t, interactive);
  const labelText = space.kilnFurniture === null
    ? t("kiln.spaceLabel", { space: name, modifier })
    : t("kiln.spaceFurnitureLabel", { space: name, tech: techName(KILN_TECHS.kilnFurniture, t.locale), modifier });

  const inner = (
    <>
      <span className="ksp-head" aria-hidden="true">
        <span className="ksp-name">{name}</span>
        <span className="ksp-mod num">{modifier}</span>
      </span>
      <span className="ksp-body">{body}</span>
      {tileNodes.length === 0 ? null : <span className="ksp-tiles">{tileNodes}</span>}
    </>
  );

  if (target !== undefined) {
    return (
      <button
        type="button"
        className={["ksp", "ksp--target", target.pressed ? "ksp--chosen" : ""].filter((part) => part !== "").join(" ")}
        aria-pressed={target.pressed}
        aria-label={targetLabel(model, t, space, name, ceramics)}
        data-space={spaceId}
        data-act="kiln-space"
        onClick={() => selection.act({ type: "kilnSpace", spaceId })}
      >
        {inner}
      </button>
    );
  }
  return (
    <div className="ksp" role="group" aria-label={labelText} data-space={spaceId}>
      {inner}
    </div>
  );
}
