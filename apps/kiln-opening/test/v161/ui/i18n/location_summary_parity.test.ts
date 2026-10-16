import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LOCATION_IDS, LOCATIONS } from "../../../../src/game/index.ts";
import { locationSummary } from "../../../../src/app/i18n/catalog/locationSummary.ts";
import { GLOSSARY_LINES, ROOT, cellsOf } from "../../support/glossary.ts";

/**
 * §5 gap 1: the location summaries match their sources cell by cell — English from the V1.6.1
 * rulebook Appendix E "Action Summary", Chinese from the same table of the Chinese rulebook
 * (行动一览), which the short column (短) of glossary §4.1–4.7 repeats. The Magistrate's Hall Shifu
 * cell ("Pay 3 Coins → same" / 付3铜钱，同上) is spelled out with the Apprentice cell's result; that
 * is the only editorial change.
 */
const RULEBOOK = readFileSync(join(ROOT, "docs/KILN_OPENING_v1.6.1_EN_SOURCE.md"), "utf8").split("\n");
const RULEBOOK_ZH = readFileSync(join(ROOT, "docs/KILN_OPENING_v1.6.1_ZH.md"), "utf8").split("\n");

function tableAfter(lines: readonly string[], heading: string): Array<Record<string, string>> {
  const start = lines.findIndex((line) => line.startsWith(heading));
  if (start < 0) throw new Error(`no heading ${heading}`);
  const rows: Array<Record<string, string>> = [];
  let header: string[] | null = null;
  for (const line of lines.slice(start + 1)) {
    if (line.startsWith("#")) break;
    if (!line.startsWith("|")) {
      if (header !== null && rows.length > 0) break;
      continue;
    }
    const cells = cellsOf(line);
    if (header === null) {
      header = cells;
      continue;
    }
    if (cells.every((cell) => /^-+$/.test(cell))) continue;
    rows.push(Object.fromEntries(header.map((name, index) => [name, cells[index] ?? ""])));
  }
  return rows;
}

function expandSame(cell: string, apprentice: string): string {
  if (!/→ same$/.test(cell)) return cell;
  const result = apprentice.slice(apprentice.indexOf("→"));
  return cell.replace(/→ same$/, result);
}

describe("location summary parity", () => {
  const english = tableAfter(RULEBOOK, "### Action Summary");

  it("covers every location in both sources", () => {
    expect(new Set(english.map((row) => row["Location"]))).toEqual(new Set(LOCATION_IDS.map((id) => LOCATIONS[id].name)));
    expect(Object.keys(locationSummary.en).sort()).toEqual(LOCATION_IDS.flatMap((id) => [`${id}.apprentice`, `${id}.shifu`]).sort());
  });

  it.each(LOCATION_IDS)("%s matches rulebook Appendix E", (id) => {
    const row = english.find((candidate) => candidate["Location"] === LOCATIONS[id].name);
    expect(row, id).toBeDefined();
    const apprentice = row?.["Apprentice"] ?? "";
    expect(locationSummary.en[`${id}.apprentice`]).toBe(apprentice);
    expect(locationSummary.en[`${id}.shifu`]).toBe(expandSame(row?.["Shifu"] ?? "", apprentice));
  });

  it.each(LOCATION_IDS)("%s matches the Chinese rulebook's 行动一览", (id) => {
    const row = tableAfter(RULEBOOK_ZH, "### 行动一览").find((candidate) => candidate["地点"] === LOCATIONS[id].nameZh);
    expect(row, id).toBeDefined();
    const apprentice = row?.["学徒"] ?? "";
    const shifu = (row?.["师傅"] ?? "").replace(/，同上$/, apprentice.slice(apprentice.indexOf("，")));
    expect(locationSummary.zh[`${id}.apprentice`]).toBe(apprentice);
    expect(locationSummary.zh[`${id}.shifu`]).toBe(shifu);
  });

  it.each(LOCATION_IDS)("%s matches the glossary §4 short column", (id) => {
    const index = LOCATION_IDS.indexOf(id) + 1;
    const heading = `### 4.${index} ${LOCATIONS[id].nameZh}`;
    const rows = tableAfter(GLOSSARY_LINES, heading);
    const apprentice = rows.find((row) => row["工人"] === "学徒");
    const shifu = rows.find((row) => row["工人"] === "师傅");
    expect(locationSummary.zh[`${id}.apprentice`]).toBe(apprentice?.["短"]);
    expect(locationSummary.zh[`${id}.shifu`]).toBe(shifu?.["短"]);
  });
});
