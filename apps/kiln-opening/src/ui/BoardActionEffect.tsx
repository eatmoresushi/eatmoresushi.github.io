import type { ReactNode } from "react";
import type { LocationId, WorkerKind } from "../game";
import type { Locale } from "./i18n";

type BoardResourceKind = "clay" | "wood" | "coin";

const RESOURCE_NAMES = {
  clay: { en: "Clay", "zh-CN": "泥" },
  wood: { en: "Wood", "zh-CN": "柴" },
  coin: { en: "Coin", "zh-CN": "铜钱" },
} satisfies Record<BoardResourceKind, Record<Locale, string>>;

function BoardResource({ kind, locale }: { kind: BoardResourceKind; locale: Locale }) {
  const label = RESOURCE_NAMES[kind][locale];
  return (
    <span className={`kiln-board-resource is-${kind}`} role="img" aria-label={label} title={label}>
      {kind === "coin" ? <i className="kiln-tabletop-cash-coin" aria-hidden="true" /> : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
          {kind === "clay" ? <>
            <path d="m2 18 3-9 6-3 6 4 5 9-11 2Z" fill="currentColor" fillOpacity=".26" />
            <path d="m5 9 6 4 6-3m-6 3v8m0-15v7M2 18l9-5 11 6" />
          </> : <>
            <path d="M7 4c5 1 9 3 13 7l-4 8C11 14 7 12 3 12Z" fill="currentColor" fillOpacity=".26" />
            <ellipse cx="17.8" cy="15.1" rx="3.5" ry="5" transform="rotate(27 17.8 15.1)" fill="currentColor" fillOpacity=".13" />
            <path d="M18.7 12.9c-2-.8-3.1 2.9-1.4 3.5M7 7l8 5M5 10l7 4m-3-6 1 2 3 1" />
          </>}
        </svg>
      )}
    </span>
  );
}

/** Compact board reminders. The action's full rules remain available in its tooltip. */
export function BoardActionEffect({ id, kind, locale }: {
  id: LocationId;
  kind: WorkerKind;
  locale: Locale;
}) {
  const zh = locale === "zh-CN";
  const shifu = kind === "shifu";
  const clay = <BoardResource kind="clay" locale={locale} />;
  const wood = <BoardResource kind="wood" locale={locale} />;
  const coin = <BoardResource kind="coin" locale={locale} />;
  let copy: ReactNode;

  switch (id) {
    case "materials_yard":
      copy = zh ? <>
        <p>获得共<strong>{shifu ? 4 : 3}</strong>份{clay}和/或{wood}，任意组合。</p>
        {shifu && <p>然后可支付<strong>1</strong>{coin} → <strong>+1</strong>{clay}及<strong>+1</strong>{wood}。</p>}
      </> : <>
        <p>Gain <strong>{shifu ? 4 : 3}</strong> {clay} / {wood} in any mix.</p>
        {shifu && <p>Then may pay <strong>1</strong> {coin} → <strong>+1</strong> {clay} and <strong>+1</strong> {wood}.</p>}
      </>;
      break;
    case "forming_studio":
      copy = zh ? <>
        <p>支付{clay}费用，成型<strong>{shifu ? "至多2" : "1"}</strong>件器物。</p>
        {shifu && <p>若成型<strong>2</strong>件：总费用<strong>−1</strong>{clay}。</p>}
      </> : <>
        <p>Pay {clay} cost → form <strong>{shifu ? "up to 2" : "1"}</strong> {shifu ? "vessels" : "vessel"}.</p>
        {shifu && <p>Form <strong>2</strong>: total cost <strong>−1</strong> {clay}.</p>}
      </>;
      break;
    case "glaze_workshop":
      copy = zh ? <>
        <p>支付纹饰费用，为<strong>{shifu ? "至多2" : "1"}</strong>件已成型器物施釉与纹饰。</p>
        {shifu && <p>若施釉<strong>2</strong>件：总费用<strong>−1</strong>{coin}。</p>}
      </> : <>
        <p>Pay Decoration cost → glaze and decorate <strong>{shifu ? "up to 2" : "1"}</strong> Shaped {shifu ? "vessels" : "vessel"}.</p>
        {shifu && <p>Glaze <strong>2</strong>: total cost <strong>−1</strong> {coin}.</p>}
      </>;
      break;
    case "kiln_yard":
      copy = zh ? <>
        <p>装窑<strong>{shifu ? "至多2" : "1"}</strong>件陶瓷。</p>
        {shifu && <>
          <p>将师傅放在共窑中你的<strong>1</strong>件陶瓷上。</p>
          <p>确定基础火候后、揭示火牌前：可用<strong>+1或−1</strong>火候标记替换师傅，仅用于本次烧成。</p>
        </>}
      </> : <>
        <p>Load <strong>{shifu ? "up to 2" : "1"}</strong>{shifu ? "." : " ceramic."}</p>
        {shifu && <>
          <p>Place your Shifu on <strong>1</strong> of your ceramics in the Shared Kiln.</p>
          <p>After Base Heat is determined, before Fire: you may replace your Shifu with a <strong>+1 or −1 Heat marker</strong> on that ceramic for this firing.</p>
        </>}
      </>;
      break;
    case "market_imperial_office":
      copy = zh ? <>
        <p>承接<strong>{shifu ? "至多2" : "1"}</strong>张主委托{shifu ? "，逐张结算。" : "。"}</p>
        <p>{shifu ? "每张承接后" : "然后"}：获得<strong>1</strong>{clay}、<strong>1</strong>{wood}或<strong>1</strong>{coin}。</p>
      </> : <>
        <p>Reserve <strong>{shifu ? "up to 2" : "1"}</strong> Main {shifu ? "Orders, one at a time." : "Order."}</p>
        <p>{shifu ? "Each reservation" : "Then"}: gain <strong>1</strong> {clay}, <strong>1</strong> {wood} or <strong>1</strong> {coin}.</p>
      </>;
      break;
    case "guild_academy":
      copy = zh ? shifu ? <>
        <p>查看<strong>1</strong>类牌叠顶端<strong>2</strong>个技艺（不足则全看）。</p>
        <p>购买<strong>1</strong>个公开或刚查看的进阶技艺：费用<strong>−1</strong>{coin}，最低0。</p>
        <p>未取得的已查看技艺放回牌叠底。</p>
      </> : <p>支付牌面{coin}费用，购买<strong>1</strong>个公开进阶技艺。</p> : shifu ? <>
        <p>Inspect top <strong>2</strong> Techs of <strong>1</strong> discipline (or remaining).</p>
        <p>Buy <strong>1</strong> face-up or inspected Advanced Tech: cost <strong>−1</strong> {coin} (min 0).</p>
        <p>Unchosen inspected Techs → deck bottom.</p>
      </> : <p>Pay printed {coin} cost → buy <strong>1</strong> face-up Advanced Tech.</p>;
      break;
    case "labour":
      copy = <p>{zh ? "获得" : "Gain "}<strong>{shifu ? 4 : 2}</strong> {coin}{zh ? "。" : "."}</p>;
      break;
    case "court_patronage":
      copy = zh ? <>
        <p>支付<strong>4</strong>{coin} → 御府声望<strong>+1</strong>。</p>
        <p>正常结算里程碑奖励。</p>
      </> : <>
        <p>Pay <strong>4</strong> {coin} → Recognition <strong>+1</strong>.</p>
        <p>Resolve the milestone.</p>
      </>;
      break;
  }

  return <div className="kiln-board-effect-copy">{copy}</div>;
}
