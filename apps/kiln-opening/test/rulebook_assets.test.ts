import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const RULEBOOKS = [
  {
    path: "public/rulebooks/Kiln_Opening_v1.0.4_Full_Rulebook.pdf",
    sha256: "71e2d7e2ccf5a9200acc87bd635dd49b64acb1aea0845c5dec40aa930705bc3d",
  },
  {
    path: "public/rulebooks/Kiln_Opening_v1.0.4_Chinese_Full_Rulebook.pdf",
    sha256: "7e1237e6e1d747528734a742af6fbe280342604d3868f4bd77200862df839ebc",
  },
] as const;

describe("public V1.0.4 rulebooks", () => {
  for (const rulebook of RULEBOOKS) {
    it(`publishes the verified source bytes for ${rulebook.path}`, async () => {
      const contents = await readFile(rulebook.path);
      expect(contents.subarray(0, 5).toString("ascii")).toBe("%PDF-");
      expect(createHash("sha256").update(contents).digest("hex")).toBe(rulebook.sha256);
    });
  }
});
