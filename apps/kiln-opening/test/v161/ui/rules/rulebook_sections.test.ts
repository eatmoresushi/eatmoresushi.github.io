/**
 * Rulebook sections (`src/app/rules/rulebookSections.ts`): the rules-details panel names a
 * clarification's rulebook source by the section a player can find in the printed rulebook, not
 * by a line of the Markdown source. The table is derived again here from the English source and
 * the line-aligned Chinese rulebook, so it fails when a heading moves or is renamed.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { RULEBOOK_SECTIONS, rulebookSection } from "../../../../src/app/rules/rulebookSections.ts";
import { ROOT } from "../../support/glossary.ts";

interface Heading {
  line: number;
  text: string;
  /** The appendix a sub-heading sits under ("Appendix B" / "附录B"), else null. */
  appendix: string | null;
}

function headings(file: string, appendix: RegExp): Heading[] {
  const found: Heading[] = [];
  let h2 = "";
  readFileSync(join(ROOT, file), "utf8")
    .split("\n")
    .forEach((line, index) => {
      const match = /^(#{2,4}) (.+)$/.exec(line);
      if (match === null) return;
      const text = match[2]!.trim();
      if (match[1] === "##") {
        h2 = text;
        found.push({ line: index + 1, text, appendix: null });
        return;
      }
      found.push({ line: index + 1, text, appendix: appendix.exec(h2)?.[0] ?? null });
    });
  return found;
}

describe("rulebook sections", () => {
  it("match the headings of the English source and the Chinese rulebook", () => {
    const en = headings("docs/KILN_OPENING_v1.6.1_EN_SOURCE.md", /^Appendix [A-Z]/);
    const zh = headings("docs/KILN_OPENING_v1.6.1_ZH.md", /^附录[A-Z]/);
    expect(zh).toHaveLength(en.length);
    const derived = en.map((heading, index) => {
      const chinese = zh[index]!;
      return {
        line: heading.line,
        en: heading.appendix === null ? heading.text : `${heading.text} (${heading.appendix})`,
        zh: chinese.appendix === null ? chinese.text : `${chinese.text}（${chinese.appendix}）`,
      };
    });
    expect(RULEBOOK_SECTIONS).toEqual(derived);
  });

  it("finds the section of a line", () => {
    expect(rulebookSection(140)?.en).toBe("Phase 2 — Work Phase");
    expect(rulebookSection(158)?.en).toBe("Materials Yard");
    expect(rulebookSection(164)?.zh).toBe("泥柴场");
    expect(rulebookSection(649)?.en).toBe("Tech Clarifications (Appendix B)");
    expect(rulebookSection(740)?.en).toBe("Firing (Appendix E)");
    expect(rulebookSection(3)).toBeNull();
  });
});
