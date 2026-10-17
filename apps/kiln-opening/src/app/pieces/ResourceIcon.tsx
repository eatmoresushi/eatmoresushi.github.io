/**
 * ResourceIcon (pieces): a small mark for Clay, Wood or Coins, drawn beside a count the way the
 * card backs mark an Order hand (owner review, 2026-10-17). Clay is a lump of terracotta, Wood a
 * log lying on its side with its pale ringed cut end (like 🪵; a log-end ring read too much like the
 * coin), Coins a Song cash coin with its square hole. Decorative only: the count
 * beside it, or its owner's accessible name, says what it is.
 */
import type { ResourceKind } from "../../game/index.ts";
import "./ResourceIcon.css";

export function ResourceIcon({ kind }: { kind: ResourceKind }) {
  return (
    <svg className="ri" data-resource={kind} viewBox="0 0 16 16" width="15" height="15" aria-hidden="true" focusable="false">
      {kind === "clay" ? (
        <>
          <path className="ri-body" d="M2.5 11.2C2.5 7.6 4.9 4 8 4s5.5 3.6 5.5 7.2c0 1.8-2.5 2.8-5.5 2.8s-5.5-1-5.5-2.8z" />
          <path className="ri-cut" d="M5.2 8.4c.6-1.5 1.6-2.4 2.8-2.6" fill="none" strokeWidth="1.1" strokeLinecap="round" />
        </>
      ) : kind === "wood" ? (
        <>
          <rect className="ri-body" x="0.8" y="4.6" width="12.4" height="6.8" rx="3.4" />
          <path className="ri-cut" d="M3.2 7.1h5.2M4.4 9.1h4" fill="none" strokeWidth="0.9" strokeLinecap="round" />
          <ellipse className="ri-end" cx="12.4" cy="8" rx="2.6" ry="3.4" />
          <ellipse className="ri-ring" cx="12.4" cy="8" rx="1.2" ry="1.6" fill="none" strokeWidth="0.8" />
        </>
      ) : (
        <>
          <circle className="ri-body" cx="8" cy="8" r="6.3" />
          <circle className="ri-cut" cx="8" cy="8" r="4.6" fill="none" strokeWidth="0.9" />
          <rect className="ri-cut ri-fill" x="6.3" y="6.3" width="3.4" height="3.4" />
        </>
      )}
    </svg>
  );
}
