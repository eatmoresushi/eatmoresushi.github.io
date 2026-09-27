/** Decorative reward artwork; the surrounding reward supplies its localized label. */
export function CrownIcon() {
  return <svg className="kiln-piece-crown-icon" viewBox="0 0 40 32" aria-hidden="true" focusable="false">
    <path d="m5 10 8 6 7-12 7 12 8-6-4 16H9Z" fill="#bd913d" stroke="#755026" strokeWidth="1.7" strokeLinejoin="round" />
    <path d="m9 14 4 4 7-10 7 10 4-4-2 8H11Z" fill="#e1bd69" />
    <path d="M9 25h22v4H9Z" fill="#bd913d" stroke="#755026" strokeWidth="1.7" strokeLinejoin="round" />
    <path d="M11 26.5h18" stroke="#f0d890" strokeWidth="1.2" />
    <g fill="#dfbb66" stroke="#755026" strokeWidth="1.4">
      <circle cx="5" cy="9" r="2.5" /><circle cx="20" cy="4" r="2.5" /><circle cx="35" cy="9" r="2.5" />
    </g>
    <path d="m20 17 2 3-2 3-2-3Z" fill="#8a5832" />
  </svg>;
}
