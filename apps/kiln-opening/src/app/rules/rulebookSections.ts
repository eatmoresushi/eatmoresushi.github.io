/**
 * The V1.6.1 rulebook's section headings by line (`docs/KILN_OPENING_v1.6.1_EN_SOURCE.md` and the
 * line-aligned Chinese `docs/KILN_OPENING_v1.6.1_ZH.md`). Owner: B6.
 *
 * A clarification's rulebook source tag (`L140`, `ED L652`) is a line of the Markdown source, which
 * no player can look up: the printed rulebook has no line numbers. The rules-details panel names
 * the section that line sits in instead ("Rulebook “Materials Yard”" / "规则书「泥柴场」"); the
 * line number stays internal data. A heading under an appendix carries the appendix's name, so
 * the Quick Reference's "Firing" never reads as the Firing Phase.
 *
 * Generated from the two headings lists; `test/v161/ui/rules/rulebook_sections.test.ts` derives
 * it again from both files and fails when the rulebook's headings move.
 */
export interface RulebookSection {
  /** First line of the section in the English source. */
  readonly line: number;
  readonly en: string;
  readonly zh: string;
}

export const RULEBOOK_SECTIONS: readonly RulebookSection[] = [
  { line: 7, en: "Changes from v1.2.7", zh: "相对v1.2.7的改动" },
  { line: 34, en: "Game Overview", zh: "游戏概述" },
  { line: 42, en: "Glossary", zh: "术语" },
  { line: 67, en: "Components", zh: "配件" },
  { line: 98, en: "Setup", zh: "游戏准备" },
  { line: 114, en: "Round Structure", zh: "每轮流程" },
  { line: 124, en: "Phase 1 — Start of Round", zh: "第1阶段——开工" },
  { line: 134, en: "Phase 2 — Work Phase", zh: "第2阶段——派工阶段" },
  { line: 146, en: "Capacity by Player Count", zh: "各人数下的容量" },
  { line: 158, en: "Materials Yard", zh: "泥柴场" },
  { line: 165, en: "Form & Decorate (personal)", zh: "制坯饰纹（坊内）" },
  { line: 175, en: "Glaze & Load (personal)", zh: "施釉装窑（坊内）" },
  { line: 187, en: "Commission Market", zh: "瓷牙行" },
  { line: 203, en: "Guild Hall", zh: "陶工行" },
  { line: 216, en: "Canal Wharf", zh: "漕运码头" },
  { line: 223, en: "Magistrate's Hall", zh: "州衙" },
  { line: 235, en: "Phase 3 — Firing Phase", zh: "第3阶段——烧窑阶段" },
  { line: 251, en: "Contribution Cards", zh: "控火牌" },
  { line: 265, en: "Heat Markers", zh: "火标" },
  { line: 272, en: "Quality Table", zh: "品质表" },
  { line: 283, en: "Imperial Kiln", zh: "御窑" },
  { line: 295, en: "Phase 4 — Order Phase", zh: "第4阶段——交货阶段" },
  { line: 301, en: "Phase 5 — Cleanup", zh: "第5阶段——收工" },
  { line: 307, en: "Ceramic Production", zh: "器物制作" },
  { line: 309, en: "Production Stages", zh: "制作步骤" },
  { line: 319, en: "Shapes and Forming Costs", zh: "器型与制坯费用" },
  { line: 331, en: "Decorations", zh: "纹饰" },
  { line: 342, en: "Glazes and Preferred Heat", zh: "釉与适烧火候" },
  { line: 355, en: "Ceramic States", zh: "器物状态" },
  { line: 362, en: "Workshop Development", zh: "作坊发展" },
  { line: 368, en: "Tech Effects and Worker Actions", zh: "技艺效果与工人行动" },
  { line: 372, en: "Advanced Tech Rules", zh: "技艺规则" },
  { line: 383, en: "Orders and Imperial Recognition", zh: "委托与御府声望" },
  { line: 385, en: "Main Order Market", zh: "主委托牌堆与委托榜" },
  { line: 395, en: "Reserving Orders", zh: "承接委托" },
  { line: 406, en: "Completing Orders", zh: "完成委托" },
  { line: 421, en: "Reading Multi-Ceramic Requirements", zh: "多件委托的要求怎么读" },
  { line: 425, en: "Imperial Recognition Track", zh: "御府声望轨" },
  { line: 442, en: "End-game Exhibition", zh: "终局陈列" },
  { line: 454, en: "Kiln Tradition Abilities", zh: "窑口传承能力" },
  { line: 458, en: "Ru Kiln / 汝窑 — Quiet Perfection", zh: "汝窑 · 天青无瑕" },
  { line: 462, en: "Guan Kiln / 官窑 — Imperial Patronage", zh: "官窑 · 内府恩眷" },
  { line: 466, en: "Ge Kiln / 哥窑 — Crackle Mastery", zh: "哥窑 · 金丝铁线" },
  { line: 472, en: "Ding Kiln / 定窑 — Moulded Production", zh: "定窑 · 范制成器" },
  { line: 476, en: "Jun Kiln / 钧窑 — Kiln Transformation", zh: "钧窑 · 窑变天成" },
  { line: 480, en: "Ability Timing", zh: "能力时机" },
  { line: 488, en: "End of the Game and Scoring", zh: "终局与计分" },
  { line: 500, en: "General Clarifications", zh: "通则" },
  { line: 515, en: "Appendix A — Order Decks: 16 Starting + 48 Main", zh: "附录A——委托牌堆：16张起始委托 + 48张主委托" },
  { line: 519, en: "A0. Starting Order Deck — 16 (Appendix A)", zh: "A0. 起始委托牌堆——16张（附录A）" },
  { line: 542, en: "A1. Main Single-Ceramic Orders — 24 (Appendix A)", zh: "A1. 主委托：单件委托——24张（附录A）" },
  { line: 571, en: "A2. Main Two-Ceramic Orders — 18 (Appendix A)", zh: "A2. 主委托：两件委托——18张（附录A）" },
  { line: 596, en: "A3. Main Three-Ceramic Orders — 6 (Appendix A)", zh: "A3. 主委托：三件委托——6张（附录A）" },
  { line: 607, en: "Appendix B — Advanced Tech: 18 tiles", zh: "附录B——技艺：18张" },
  { line: 611, en: "B1. Form & Decorate — 6 (Appendix B)", zh: "B1. 坯作——6张（附录B）" },
  { line: 622, en: "B2. Glazing & Loading — 6 (Appendix B)", zh: "B2. 釉作——6张（附录B）" },
  { line: 633, en: "B3. Firing — 6 (Appendix B)", zh: "B3. 火作——6张（附录B）" },
  { line: 644, en: "Tech Clarifications (Appendix B)", zh: "技艺通则（附录B）" },
  { line: 656, en: "Appendix C — Fire Deck", zh: "附录C——窑火牌堆" },
  { line: 668, en: "Appendix D — Full Firing Sequence", zh: "附录D——完整烧窑流程" },
  { line: 685, en: "Timing Vocabulary (Appendix D)", zh: "时机用语（附录D）" },
  { line: 695, en: "Appendix E — Quick Reference", zh: "附录E——速查" },
  { line: 697, en: "Round Sequence (Appendix E)", zh: "一轮流程（附录E）" },
  { line: 705, en: "Action Summary (Appendix E)", zh: "行动一览（附录E）" },
  { line: 723, en: "Imperial Recognition (Appendix E)", zh: "御府声望（附录E）" },
  { line: 731, en: "Tech Rule (Appendix E)", zh: "技艺规则（附录E）" },
  { line: 735, en: "Firing (Appendix E)", zh: "烧窑（附录E）" },
  { line: 750, en: "Scoring (Appendix E)", zh: "计分（附录E）" },
];

/** The section a rulebook line belongs to, or null for the title block above the first section. */
export function rulebookSection(line: number): RulebookSection | null {
  let found: RulebookSection | null = null;
  for (const section of RULEBOOK_SECTIONS) {
    if (section.line > line) break;
    found = section;
  }
  return found;
}
