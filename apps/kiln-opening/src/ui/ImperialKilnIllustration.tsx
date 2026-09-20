import { useId } from "react";

/** Decorative stonework; the containing tile supplies all live kiln information. */
export function ImperialKilnIllustration({ className }: { className?: string }) {
  const id = `imperial-kiln-${useId().replace(/:/g, "")}`;

  return (
    <svg
      className={className}
      viewBox="0 0 240 180"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={`${id}-stone`} x1="69" y1="36" x2="174" y2="152" gradientUnits="userSpaceOnUse">
          <stop stopColor="#ddc8a0" />
          <stop offset=".42" stopColor="#b29a73" />
          <stop offset="1" stopColor="#776248" />
        </linearGradient>
        <linearGradient id={`${id}-arch`} x1="87" y1="63" x2="152" y2="139" gradientUnits="userSpaceOnUse">
          <stop stopColor="#e2cba0" />
          <stop offset="1" stopColor="#9c8056" />
        </linearGradient>
        <linearGradient id={`${id}-chamber`} x1="120" y1="57" x2="120" y2="143" gradientUnits="userSpaceOnUse">
          <stop stopColor="#252c29" />
          <stop offset=".7" stopColor="#35382d" />
          <stop offset="1" stopColor="#59402b" />
        </linearGradient>
        <radialGradient id={`${id}-embers`} cx=".5" cy="1" r=".9">
          <stop stopColor="#ef9a42" stopOpacity=".74" />
          <stop offset="1" stopColor="#bf5627" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}-flame`} x1="120" y1="141" x2="120" y2="166" gradientUnits="userSpaceOnUse">
          <stop stopColor="#e69038" />
          <stop offset=".6" stopColor="#f2b552" />
          <stop offset="1" stopColor="#cc5c2d" />
        </linearGradient>
        <linearGradient id={`${id}-wood`} x1="25" y1="144" x2="40" y2="164" gradientUnits="userSpaceOnUse">
          <stop stopColor="#927049" />
          <stop offset="1" stopColor="#523e2b" />
        </linearGradient>
        <clipPath id={`${id}-dome`}>
          <path d="M47 148 49 107C51 60 78 27 119 26c42-1 71 35 74 81l2 41Z" />
        </clipPath>
      </defs>

      <ellipse cx="121" cy="167" rx="99" ry="9" fill="#5c4935" opacity=".12" />
      <ellipse cx="120" cy="165" rx="76" ry="5" fill="#4f3e2c" opacity=".13" />

      {/* A slight irregularity in each course keeps the masonry hand built. */}
      <path d="m109 17 10-3 12 3-1 15h-22Z" fill="#b49b73" stroke="#725e42" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="m109 17 10 3 12-3m-12 3v9" stroke="#796444" strokeWidth="1.3" />
      <path d="m113 17 6-1 7 1-7 1.5Z" fill="#574b37" />
      <path d="M47 148 49 107C51 60 78 27 119 26c42-1 71 35 74 81l2 41Z" fill={`url(#${id}-stone)`} stroke="#756247" strokeWidth="2" strokeLinejoin="round" />
      <g clipPath={`url(#${id}-dome)`}>
        <path d="m66 47 19 4 34 2 34-2 23-5M55 68l28 5 37 2 39-3 29-6M47 91l35 5 37 1 39-1 39-6M45 117l37 4 41 1 42-1 34-4M45 142l36 3 44 1 41-1 33-3" stroke="#766447" strokeWidth="2.4" strokeLinejoin="round" />
        <path d="m68 45 20 4 30 2 35-2 21-5M57 66l26 5 37 2 39-3 27-6M49 89l33 5 37 1 39-1 37-6M47 115l35 4 41 1 42-1 32-4M47 140l34 3 44 1 41-1 31-3" stroke="#ecdbb9" strokeOpacity=".45" strokeWidth="1" />
        <path d="m100 29-4 23m45-20 4 19M80 51l-7 20m44-18-1 21m40-23 10 20M58 72l-4 20m42-18-2 22m47-22 3 22m42-24 5 20M74 96l-3 24m93-24 6 25M51 120l-1 23m139-24 2 24" stroke="#7c6749" strokeWidth="2.1" />
        <path d="m95 33-8 4m-5 24 8 1m65-20 5 3M60 83l6 1m104 1 8-1M58 105l7 1m110 1 8-1m-124 26 7 1m109 2 8-1" stroke="#ead6ae" strokeOpacity=".48" strokeWidth="2" strokeLinecap="round" />
        <path d="m67 109 4 1m99-45 3 2m-62-25 4 1m43 91 7-1m-98 3 4 1" stroke="#6f5b41" strokeOpacity=".4" strokeWidth="1" strokeLinecap="round" />
        <path d="M177 70c9 28 8 50 8 77h16V61Z" fill="#554832" opacity=".14" />
      </g>

      {/* The wide chamber leaves clear space for the live ceramic above it. */}
      <path d="M72 145V102c0-30 18-49 48-49s48 19 48 49v43Z" fill={`url(#${id}-arch)`} stroke="#69563c" strokeWidth="2" />
      <path d="M83 141V102c0-23 13-37 37-37s37 14 37 37v39Z" fill={`url(#${id}-chamber)`} stroke="#685438" strokeWidth="1.8" />
      <path d="M87 119h66v22H87Z" fill={`url(#${id}-embers)`} opacity=".33" />
      <path d="M74 102h9m-9 18h9m-9 17h9m74-35h9m-9 18h9m-9 17h9M77 79l10 6m6-24 7 11m20-18v11m27-4-7 11m23 7-10 6" stroke="#806849" strokeWidth="1.8" />
      <path d="M76 99c1-28 17-43 43-43" stroke="#f2dfb7" strokeOpacity=".55" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M85 103c0-24 12-35 34-36" stroke="#171f1c" strokeOpacity=".6" strokeWidth="2" strokeLinecap="round" />
      <path d="M81 140h78v7H81Z" fill="#85704e" stroke="#68553b" strokeWidth="1.4" />
      <path d="M84 141h72" stroke="#d4b987" strokeOpacity=".65" />

      <path d="m43 147 34-2 43 2 42-2 37 2 3 15-41 3-40-1-42 2-39-4Z" fill="#a58a60" stroke="#705c3f" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="m45 150 32-1 42 2 43-2 34 1m-116-2 1 16m78-16 1 15m-103-9 11 1m105 1 11-1" stroke="#d9bd8b" strokeOpacity=".65" strokeWidth="1.4" />
      <path d="M102 164v-9c0-10 7-17 18-17s18 7 18 17v9Z" fill="#382b22" stroke="#82623f" strokeWidth="3" />
      <path d="M105 165v-10c0-8 6-15 15-15s15 7 15 15v10Z" fill={`url(#${id}-embers)`} />
      <path d="M113 163c-8-7 2-10 3-18 4 5 3 8 3 8 5-3 3-9 5-13 5 7 3 10 7 16 3 6-3 9-10 9Z" fill={`url(#${id}-flame)`} />
      <path d="M117 164c-4-4 1-6 2-11 3 3 1 5 3 7 3-1 3-4 3-4 3 5 1 8-3 9Z" fill="#f7d886" />
      <path d="m107 164 21-4m-16 0 20 4" stroke="#543827" strokeWidth="3.5" strokeLinecap="round" />
      <path d="m109 164 13-3m0 2 7 1" stroke="#c78040" strokeWidth=".9" strokeLinecap="round" />

      {/* Short stacked billets are outside the loading space. */}
      <g stroke="#55422e" strokeWidth="1.4" strokeLinejoin="round">
        <path d="m20 151 29-10c5-1 8 8 4 10l-29 10Z" fill={`url(#${id}-wood)`} />
        <ellipse cx="23" cy="156" rx="5" ry="6.5" transform="rotate(-20 23 156)" fill="#bb9867" />
        <ellipse cx="23" cy="156" rx="2" ry="3.7" transform="rotate(-20 23 156)" stroke="#80613d" strokeWidth="1" />
        <path d="m29 157 30-9c5-1 8 8 4 10l-30 10Z" fill={`url(#${id}-wood)`} />
        <ellipse cx="32" cy="163" rx="5" ry="6.5" transform="rotate(-20 32 163)" fill="#c19d6c" />
        <ellipse cx="32" cy="163" rx="2" ry="3.7" transform="rotate(-20 32 163)" stroke="#80613d" strokeWidth="1" />
        <path d="m24 141 24-8c4-1 8 8 4 10l-24 8Z" fill={`url(#${id}-wood)`} />
        <ellipse cx="27" cy="146" rx="5" ry="6.5" transform="rotate(-20 27 146)" fill="#c5a675" />
        <ellipse cx="27" cy="146" rx="2" ry="3.7" transform="rotate(-20 27 146)" stroke="#80613d" strokeWidth="1" />
        <path d="m34 143 13-4m-8 22 18-6m-30-1 17-6" stroke="#c8a46d" strokeWidth="1" strokeLinecap="round" />
      </g>
      <path d="m202 152 6-2 8 5-2 7-13 1-4-5Zm-20 14 7-3 7 1 3 4-16 2Z" fill="#b09a73" stroke="#87714f" strokeWidth="1" strokeLinejoin="round" />
      <path d="m204 152 6 3 5-1m-5 1-1 7m-23 4 8 1" stroke="#e1ca9f" strokeOpacity=".65" strokeWidth="1" />
    </svg>
  );
}
