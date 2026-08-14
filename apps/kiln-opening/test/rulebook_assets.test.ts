import { access } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const RETIRED_RULEBOOKS = [
  "public/rulebooks/Kiln_Opening_v1.0.4_Full_Rulebook.pdf",
  "public/rulebooks/Kiln_Opening_v1.0.4_Chinese_Full_Rulebook.pdf",
] as const;

describe("retired public rulebooks", () => {
  for (const rulebook of RETIRED_RULEBOOKS) {
    it(`does not publish ${rulebook}`, async () => {
      await expect(access(rulebook)).rejects.toMatchObject({ code: "ENOENT" });
    });
  }
});
