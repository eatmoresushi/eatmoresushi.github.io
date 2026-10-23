/**
 * Shared reader for `docs/GLOSSARY_ZH_V1.6.1.md` (UI_V1.6.1_ARCHITECTURE §4.2, §6.4).
 *
 * Used by the engine's content test (`test/v161/engine/localization_content.test.ts`) and the UI
 * catalogue tests (`test/v161/ui/i18n/*`), so both check Chinese text against the same fixed
 * terms and the same banned list.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const ROOT = join(import.meta.dirname, "../../..");
export const GLOSSARY = readFileSync(join(ROOT, "docs/GLOSSARY_ZH_V1.6.1.md"), "utf8");
export const GLOSSARY_LINES = GLOSSARY.split("\n");

export const cellsOf = (line: string): string[] => line.split("|").slice(1, -1).map((cell) => cell.trim());

/** The first glossary table row whose first cell is exactly `first`, searching from `from`. */
export function glossaryRow(first: string, from = 0): string[] {
  const line = GLOSSARY_LINES.slice(from).find((candidate) => candidate.startsWith("|") && cellsOf(candidate)[0] === first);
  if (line === undefined) throw new Error(`Glossary has no row "${first}"`);
  return cellsOf(line);
}

/** The Chinese term (second column) of the row whose English cell is `english`. */
export const glossaryTerm = (english: string): string => glossaryRow(english)[1] ?? "";

/** Rows of the first glossary table after a heading that starts with `prefix` (header row dropped). */
export function glossaryTableAfter(prefix: string): string[][] {
  const start = GLOSSARY_LINES.findIndex((line) => line.startsWith(prefix));
  if (start < 0) throw new Error(`Glossary has no heading "${prefix}"`);
  const rows: string[][] = [];
  for (const line of GLOSSARY_LINES.slice(start + 1)) {
    if (line.startsWith("#")) break;
    if (line.startsWith("|") && !/^\|\s*-/.test(line)) rows.push(cellsOf(line));
    else if (rows.length > 0 && line.trim() === "") break;
  }
  return rows.slice(1);
}

/** The full-text paragraph under a bold glossary heading such as `**大陶车**（坯作，2铜钱）`. */
export function glossaryParagraph(boldTitle: string): string {
  const start = GLOSSARY_LINES.findIndex((line) => line.startsWith(`**${boldTitle}**`));
  if (start < 0) throw new Error(`Glossary has no paragraph "${boldTitle}"`);
  const body: string[] = [];
  for (const line of GLOSSARY_LINES.slice(start + 1)) {
    if (line.trim() === "") break;
    body.push(line.trim());
  }
  return body.join("");
}

/**
 * Glossary text minus its editorial apparatus: bold markup, ruling citations (`R9，`, `（R12）`,
 * `B1、B3：`) and the sentences pointing at its open-question list (§9). Data text is player-facing
 * and carries none of these.
 */
export function withoutApparatus(text: string): string {
  return text
    .replaceAll("**", "")
    .replace(/[^。（]*见第9节[^。]*。/g, "")
    .replace(/（R\d+）/g, "")
    .replace(/(?:[RB]\d+、)*[RB]\d+[：，]/g, "")
    .replaceAll("（）", "");
}

export const brToNewline = (text: string): string => text.replaceAll("<br>", "\n");

/**
 * Retired or banned Chinese terms (glossary §1.5, §6) and what to use instead. Includes the D7
 * lock/seal words for the second personal space.
 */
export const RETIRED_TERMS: ReadonlyArray<readonly [string, string]> = [
  ["彩绘", "画花"], ["绘花", "画花"], ["开片釉", "开片器"], ["博古架", "清玩斋"], ["多宝格", "清玩斋"],
  ["起始技艺", "技艺"], ["进阶技艺", "技艺"], ["陶车坊", "制坯饰纹"], ["纹饰坊", "制坯饰纹"], ["釉饰坊", "施釉装窑"],
  ["窑坊", "施釉装窑"], ["杂作行", "漕运码头"], ["朝廷赞助", "州衙"], ["超容量", "容量绝对"], ["超放", "容量绝对"],
  ["已施釉", "坯 → 入窑"], ["调位", "—（无此机制）"], ["移窑", "—（无此机制）"], ["胜利点", "分"], ["积分", "分"], ["VP", "分"],
  ["御印", "御令"], ["御玺", "御令"], ["展览", "陈列"], ["公开委托区", "委托榜"], ["展示区", "委托榜"],
  ["暗注", "柴簿加柴"], ["强压火", "压火−2"], ["猛添柴", "添柴+2"], ["装饰", "纹饰"], ["陶瓷件", "器物"],
  ["已成型", "坯"], ["商业委托", "商贾委托"], ["师傅火候标记", "窑工标（修订4起无火标）"], ["公开展示", "委托榜"],
  ["封条", "第二工位（D7）"], ["启封", "添设（D7）"], ["封存", "添设（D7）"], ["锁", "第二工位／添设（D7）"],
  // Owner revision 4 (rulebook changes 28–35, glossary §1.5) and owner ruling R25.
  ["火标", "窑工标（修订4取消了玩家火标）"], ["折卖", "卖出瑕品"], ["纹饰费", "制坯费（泥费外加2铜钱）"], ["纹饰减免", "减免"],
  ["放到主委托牌堆底", "其余弃置（R25）"],
];

/** Retired terms found in `text`, as "term → replacement". */
export function retiredTermsIn(text: string): string[] {
  return RETIRED_TERMS.filter(([term]) => text.includes(term)).map(([term, replacement]) => `"${term}" → ${replacement}`);
}
