import type { StartingTechniqueId, TechniqueId } from "../game";
import artworkST01 from "../../assets/current_v04/pieces/tech-ST01-v1.webp";
import artworkST02 from "../../assets/current_v04/pieces/tech-ST02-v1.webp";
import artworkST03 from "../../assets/current_v04/pieces/tech-ST03-v1.webp";
import artworkST04 from "../../assets/current_v04/pieces/tech-ST04-v1.webp";
import artworkT01 from "../../assets/current_v04/pieces/tech-T01-v1.webp";
import artworkT02 from "../../assets/current_v04/pieces/tech-T02-v1.webp";
import artworkT03 from "../../assets/current_v04/pieces/tech-T03-v1.webp";
import artworkT04 from "../../assets/current_v04/pieces/tech-T04-v1.webp";
import artworkT05 from "../../assets/current_v04/pieces/tech-T05-v1.webp";
import artworkT06 from "../../assets/current_v04/pieces/tech-T06-v1.webp";
import artworkT07 from "../../assets/current_v04/pieces/tech-T07-v1.webp";
import artworkT08 from "../../assets/current_v04/pieces/tech-T08-v1.webp";
import artworkT09 from "../../assets/current_v04/pieces/tech-T09-v1.webp";
import artworkT10 from "../../assets/current_v04/pieces/tech-T10-v1.webp";
import artworkT11 from "../../assets/current_v04/pieces/tech-T11-v1.webp";
import artworkT12 from "../../assets/current_v04/pieces/tech-T12-v1.webp";
import artworkT13 from "../../assets/current_v04/pieces/tech-T13-v1.webp";
import artworkT14 from "../../assets/current_v04/pieces/tech-T14-v1.webp";
import artworkT15 from "../../assets/current_v04/pieces/tech-T15-v1.webp";

/** Each Tech uses its own text-free illustration across every shared face. */
export const TECHNIQUE_ARTWORK: Readonly<Record<TechniqueId | StartingTechniqueId, string>> = {
  ST01: artworkST01,
  ST02: artworkST02,
  ST03: artworkST03,
  ST04: artworkST04,
  T01: artworkT01,
  T02: artworkT02,
  T03: artworkT03,
  T04: artworkT04,
  T05: artworkT05,
  T06: artworkT06,
  T07: artworkT07,
  T08: artworkT08,
  T09: artworkT09,
  T10: artworkT10,
  T11: artworkT11,
  T12: artworkT12,
  T13: artworkT13,
  T14: artworkT14,
  T15: artworkT15,
};
