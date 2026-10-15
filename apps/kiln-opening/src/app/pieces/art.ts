/**
 * Piece art (UI_V1.6.1_ARCHITECTURE §7.4): the approved `assets/current_v04/` images as Vite
 * asset imports, and the `ArtResolver` context.
 *
 * - The 20 neutral ceramic cutouts (`ceramic-<shape>-<decoration>-v1.webp`) are tinted per Glaze
 *   by CSS (mask + multiply with `--glz-*`), so one image serves every Glaze in both themes.
 * - `ceramic-crackle-overlay-v1.webp` is masked over a Crackle ceramic.
 * - The wooden worker silhouettes are masked by the seat colour (`WorkerPiece` full variant).
 *
 * `ArtResolver` is phase 6's hook: a WebGL build may supply baked glaze images. The default
 * resolver returns the static cutouts. Missing art (8 Tech illustrations, the Kiln Player Boards,
 * central scenery) is not resolved here: those render as text-only cards (§7.4, AGENTS.md).
 */
import { createContext, useContext } from "react";
import type { Decoration, Shape, WorkerKind } from "../../game/index.ts";
import bowl_plain from "../../../assets/current_v04/ceramics/ceramic-bowl-plain-v1.webp";
import bowl_carved from "../../../assets/current_v04/ceramics/ceramic-bowl-carved-v1.webp";
import bowl_impressed from "../../../assets/current_v04/ceramics/ceramic-bowl-impressed-v1.webp";
import bowl_painted from "../../../assets/current_v04/ceramics/ceramic-bowl-painted-v1.webp";
import plate_plain from "../../../assets/current_v04/ceramics/ceramic-plate-plain-v1.webp";
import plate_carved from "../../../assets/current_v04/ceramics/ceramic-plate-carved-v1.webp";
import plate_impressed from "../../../assets/current_v04/ceramics/ceramic-plate-impressed-v1.webp";
import plate_painted from "../../../assets/current_v04/ceramics/ceramic-plate-painted-v1.webp";
import washer_plain from "../../../assets/current_v04/ceramics/ceramic-washer-plain-v1.webp";
import washer_carved from "../../../assets/current_v04/ceramics/ceramic-washer-carved-v1.webp";
import washer_impressed from "../../../assets/current_v04/ceramics/ceramic-washer-impressed-v1.webp";
import washer_painted from "../../../assets/current_v04/ceramics/ceramic-washer-painted-v1.webp";
import vase_plain from "../../../assets/current_v04/ceramics/ceramic-vase-plain-v1.webp";
import vase_carved from "../../../assets/current_v04/ceramics/ceramic-vase-carved-v1.webp";
import vase_impressed from "../../../assets/current_v04/ceramics/ceramic-vase-impressed-v1.webp";
import vase_painted from "../../../assets/current_v04/ceramics/ceramic-vase-painted-v1.webp";
import censer_plain from "../../../assets/current_v04/ceramics/ceramic-censer-plain-v1.webp";
import censer_carved from "../../../assets/current_v04/ceramics/ceramic-censer-carved-v1.webp";
import censer_impressed from "../../../assets/current_v04/ceramics/ceramic-censer-impressed-v1.webp";
import censer_painted from "../../../assets/current_v04/ceramics/ceramic-censer-painted-v1.webp";
import crackleOverlay from "../../../assets/current_v04/ceramics/ceramic-crackle-overlay-v1.webp";
import apprenticeWood from "../../../assets/current_v04/workers/apprentice-wood-v1.webp";
import shifuWood from "../../../assets/current_v04/workers/shifu-wood-v1.webp";

/** The neutral cutout for each Shape and Decoration. */
export const CERAMIC_CUTOUTS: { readonly [S in Shape]: { readonly [D in Decoration]: string } } = {
  bowl: { plain: bowl_plain, carved: bowl_carved, impressed: bowl_impressed, painted: bowl_painted },
  plate: { plain: plate_plain, carved: plate_carved, impressed: plate_impressed, painted: plate_painted },
  washer: { plain: washer_plain, carved: washer_carved, impressed: washer_impressed, painted: washer_painted },
  vase: { plain: vase_plain, carved: vase_carved, impressed: vase_impressed, painted: vase_painted },
  censer: { plain: censer_plain, carved: censer_carved, impressed: censer_impressed, painted: censer_painted },
};

export const CRACKLE_OVERLAY: string = crackleOverlay;

export const WORKER_ART: { readonly [K in WorkerKind]: string } = {
  shifu: shifuWood,
  apprentice: apprenticeWood,
};

export interface ArtResolver {
  /** Image URL of the neutral ceramic for a Shape and Decoration. */
  ceramic(shape: Shape, decoration: Decoration): string;
  /** Image URL of the Crackle overlay. */
  crackle(): string;
  /** Image URL of a worker silhouette. */
  worker(kind: WorkerKind): string;
}

export const STATIC_ART: ArtResolver = {
  ceramic: (shape, decoration) => CERAMIC_CUTOUTS[shape][decoration],
  crackle: () => CRACKLE_OVERLAY,
  worker: (kind) => WORKER_ART[kind],
};

/** Provide a different resolver with `<ArtResolverContext.Provider value={…}>`. */
export const ArtResolverContext = createContext<ArtResolver>(STATIC_ART);

export function useArt(): ArtResolver {
  return useContext(ArtResolverContext);
}

/** A CSS `url()` value for a custom property. */
export function cssUrl(url: string): string {
  return `url("${url.replace(/["\\]/g, "\\$&")}")`;
}
