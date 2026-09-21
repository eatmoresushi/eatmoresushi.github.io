import cylinderSprite from "../../assets/current_v04/illustrated-board/recognition-cylinders-v2.webp";

const SPRITE_X = { cinnabar: 80, river: 524, ochre: 968, plum: 1412 } as const;
export type RecognitionMarkerAccent = keyof typeof SPRITE_X;

/** Each viewport shows one image-generated wooden cylinder from the transparent sheet. */
export function RecognitionMarker({ label, className, accent }: {
  label: string;
  className?: string;
  accent: RecognitionMarkerAccent;
}) {
  return (
    <svg
      className={className}
      viewBox={`${SPRITE_X[accent]} 155 350 590`}
      width="30"
      height="44"
      preserveAspectRatio="xMidYMid meet"
      style={{ overflow: "hidden" }}
      role="img"
      aria-label={label}
      focusable="false"
    >
      <title>{label}</title>
      <image href={cylinderSprite} x="0" y="0" width="1774" height="887" aria-hidden="true" />
    </svg>
  );
}
