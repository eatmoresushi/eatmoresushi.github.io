import type { ReactNode } from "react";
import type { LocationId } from "../game";

const ACTION_ICONS = {
  materials_yard: <>
    <path d="M8 31.5 12 21l8-4 8 5 3 10Z" fill="currentColor" fillOpacity=".08" />
    <path d="m12 21 6 3 2-7m-2 7-3 7m3-7 10-2M7 32h25" />
    <path d="m25 33 11-6c3-1.5 6 4.5 3 6l-11 6m-2-6 11 6c3 1.5 6-4.5 3-6l-6-3" />
    <ellipse cx="27" cy="36" rx="3" ry="3.5" />
    <path d="m30 12 3-3m2 8 4-1" />
  </>,
  forming_studio: <>
    <path d="M17 11h14l-2 5c6 5 5 12-5 12s-11-7-5-12Z" fill="currentColor" fillOpacity=".08" />
    <path d="M18 15h12m-13 7h14" />
    <ellipse cx="24" cy="29" rx="17" ry="4" />
    <path d="M24 33v6m-8 2 8-2 8 2M7 29v3m34-3v3" />
  </>,
  glaze_workshop: <>
    <path d="M8 27h26c-1 9-5 13-13 13S9 36 8 27Z" fill="currentColor" fillOpacity=".08" />
    <path d="M7 27h28M13 36h16m-10 4v2h5v-2" />
    <path d="m26 21 11-14 4 3-11 14Zm0 0c-4 0-8 3-8 8 4 0 9-1 12-5M34 11l4 3" />
    <path d="M11 16c0-2 3-5 3-5s3 3 3 5a3 3 0 0 1-6 0Z" />
  </>,
  market_imperial_office: <>
    <path d="M14 8h21v27H14Z" fill="currentColor" fillOpacity=".08" />
    <path d="M14 8c-6 0-6 8 0 8h2V8m19 27h-4v5h6c6 0 6-8 0-8h-2M14 16v24h17M21 16h9m-9 6h9m-9 6h5" />
    <circle cx="26" cy="34" r="3" />
    <path d="m24 36-1 5 3-2 3 2-1-5" />
  </>,
  guild_academy: <>
    <path d="M24 14c-5-4-10-5-17-4v27c7-1 12 0 17 4 5-4 10-5 17-4V10c-7-1-12 0-17 4Z" fill="currentColor" fillOpacity=".08" />
    <path d="M24 14v27M12 18c3 0 5 1 8 2m-8 5c3 0 5 1 8 2m-8 5c3 0 5 1 8 2m8-14c3-1 5-2 8-2m-8 9c3-1 5-2 8-2m-8 9c3-1 5-2 8-2" />
  </>,
  labour: <>
    <path d="m11 7 10 8-7 9-10-8Z" fill="currentColor" fillOpacity=".08" />
    <path d="m16 22 16 18 4-4-17-18M7 12l10 8" />
    <path d="m36 6 6 6-4 5-6-6Zm-4 5L12 34m3-3-8 4c-2 6 1 9 7 7l4-8Z" fill="currentColor" fillOpacity=".08" />
  </>,
  court_patronage: <>
    <path d="M11 23h26v16H11Z" fill="currentColor" fillOpacity=".08" />
    <path d="M24 6v4M7 15c7 0 12-3 17-6 5 3 10 6 17 6M12 15v4m24-4v4M5 23c9-1 14-4 19-8 5 4 10 7 19 8M8 24h32M15 25v13m18-13v13m-13 0V28h8v10M8 39h32M5 42h38" />
  </>,
  kiln_yard: <>
    <path d="M8 41V23a16 16 0 0 1 32 0v18Z" fill="currentColor" fillOpacity=".08" />
    <path d="M6 41h36M15 41V26a9 9 0 0 1 18 0v15M12 13l5 5m7-11v10m12-4-5 5M8 25h7m18 0h7M8 33h7m18 0h7" />
    <path d="M24 25c1 4 6 6 6 10a6 6 0 0 1-12 0c0-3 3-5 3-8 2 2 2 4 2 4s3-2 1-6Z" />
  </>,
} satisfies Record<LocationId, ReactNode>;

/** Engraved workshop symbols; the action's adjacent label supplies its name. */
export function BoardActionIcon({ locationId, className }: {
  locationId: LocationId;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ACTION_ICONS[locationId]}
    </svg>
  );
}
