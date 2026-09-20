import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { activeKilnSpaceIds } from "../../src/game/index.ts";
import type { GameState, LocationId, WorkerKind } from "../../src/game/index.ts";
import { projectPublicGameState } from "../../src/multiplayer/index.ts";
import { ActionPanel } from "../../src/ui/ActionPanel.tsx";
import { LanguageProvider } from "../../src/ui/i18n.tsx";
import { addGlazed, addLoaded, addShaped, addTechnique, startedGame, workerId } from "./helpers.ts";

const ACTION_LOCATIONS: readonly LocationId[] = [
  "materials_yard",
  "forming_studio",
  "glaze_workshop",
  "kiln_yard",
  "market_imperial_office",
  "guild_academy",
  "labour",
];

const CAPPED_LOCATIONS: readonly LocationId[] = [
  "materials_yard",
  "forming_studio",
  "glaze_workshop",
  "market_imperial_office",
  "guild_academy",
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buttonWithAttribute(markup: string, attribute: string, value: string): string {
  return markup.match(new RegExp(`<button[^>]*${attribute}="${escapeRegExp(value)}"[^>]*>`))?.[0] ?? "";
}

function availableWorkerIds(state: GameState, kind?: WorkerKind): string[] {
  return Object.values(state.players["P1"]!.workers)
    .filter((worker) => worker.status === "available" && (kind === undefined || worker.kind === kind))
    .map((worker) => worker.id);
}

function expectUnavailable(markup: string, explanation: string | RegExp): void {
  const message = markup.match(/<p[^>]*class="kiln-action-unavailable"[^>]*>[\s\S]*?<\/p>/)?.[0] ?? "";
  expect(message).toContain('role="status"');
  if (typeof explanation === "string") expect(message).toContain(explanation);
  else expect(message).toMatch(explanation);
  expect(markup).not.toContain("<form");
  expect(markup).not.toContain("<fieldset");
  expect(markup).not.toContain("data-worker-choice=");
  expect(markup).not.toContain("data-choice-group=");
  expect(markup.match(/<button\b/g) ?? []).toHaveLength(0);
  expect(markup).not.toContain("Pass for this round");
}

function useShifu(state: GameState): void {
  const shifu = state.players["P1"]!.workers[workerId(state, "P1", "shifu")]!;
  shifu.status = "placed";
  shifu.locationId = "labour";
}

function fillSharedKiln(state: GameState): void {
  for (const spaceId of activeKilnSpaceIds(state.playerCount)) {
    addLoaded(state, "P2", "bowl", "white", "plain", spaceId);
  }
}

function prepareLocation(state: GameState, locationId: LocationId): void {
  state.players["P1"]!.resources = { clay: 10, wood: 10, coins: 10 };
  if (locationId === "glaze_workshop") {
    addShaped(state, "P1", "bowl");
    addShaped(state, "P1", "plate");
  }
  if (locationId === "kiln_yard") {
    addGlazed(state, "P1", "bowl", "white", "plain");
    addGlazed(state, "P1", "plate", "celadon", "carved");
  }
}

function renderAction(
  locationId: LocationId,
  kind: WorkerKind,
  configure?: (state: GameState) => void,
): { markup: string; selectedWorkerId: string; state: GameState } {
  const state = structuredClone(startedGame(2, 13_800 + ACTION_LOCATIONS.indexOf(locationId)).state);
  prepareLocation(state, locationId);
  configure?.(state);
  const selectedWorkerId = workerId(state, "P1", kind);
  const markup = renderToStaticMarkup(createElement(LanguageProvider, {
    initialLocale: "en",
    children: createElement(ActionPanel, {
      game: projectPublicGameState(state),
      ownPlayerId: "P1",
      ownPendingContribution: null,
      selectedLocation: locationId,
      selectedWorkerId,
      busy: false,
      send: async () => true,
    }),
  }));
  return { markup, selectedWorkerId, state };
}

describe("V1.2.7 smart worker-action choices", () => {
  it("offers Kiln Tending as an optional choice of one Clay or one Wood", () => {
    const { markup } = renderAction("kiln_yard", "apprentice", (state) => {
      state.players["P1"]!.startingTechniqueId = "ST04";
    });
    const choice = markup.match(/<fieldset[^>]*data-choice-group="kiln-tending"[\s\S]*?<\/fieldset>/)?.[0] ?? "";
    expect(choice).toContain("Do not use");
    expect(choice).toContain("1 Clay");
    expect(choice).toContain("1 Wood");
    expect(buttonWithAttribute(choice, "data-choice-value", "")).toContain('aria-pressed="true"');
    expect(buttonWithAttribute(choice, "data-choice-value", "clay")).toContain('aria-pressed="false"');
    expect(buttonWithAttribute(choice, "data-choice-value", "wood")).toContain('aria-pressed="false"');
  });

  it("does not offer Kiln Tending to another Starting Tech", () => {
    const { markup } = renderAction("kiln_yard", "apprentice", (state) => {
      state.players["P1"]!.startingTechniqueId = "ST01";
    });
    expect(markup).not.toContain('data-choice-group="kiln-tending"');
  });

  it("renders eligible forming rewards unchecked and cannot spend their unselected income on White Slip", () => {
    const { markup } = renderAction("forming_studio", "apprentice", (state) => {
      state.players["P1"]!.startingTechniqueId = "ST02";
      state.players["P1"]!.resources.coins = 0;
      addTechnique(state, "P1", "T02"); addTechnique(state, "P1", "T03");
      addShaped(state, "P1", "bowl"); addShaped(state, "P1", "plate");
    });
    for (const id of ["T02", "T03"]) {
      const input = markup.match(new RegExp(`<input[^>]*value="${id}"[^>]*>`))?.[0] ?? "";
      expect(input).toContain('type="checkbox"');
      expect(input).not.toContain("checked=");
    }
    const whiteSlip = markup.match(/<fieldset[^>]*data-choice-group="white-slip"[\s\S]*?<\/fieldset>/)?.[0] ?? "";
    expect(buttonWithAttribute(whiteSlip, "data-choice-value", "0")).toContain('disabled=""');
    expect(whiteSlip).toContain("Not enough Coins");
  });

  it.each(ACTION_LOCATIONS)("uses the shared physical meeple buttons at %s", (locationId) => {
    const { markup, selectedWorkerId } = renderAction(locationId, "apprentice");
    const selected = buttonWithAttribute(markup, "data-worker-choice", selectedWorkerId);

    expect(markup.match(/data-worker-choice=/g)).toHaveLength(4);
    expect(selected).toContain('type="button"');
    expect(selected).toContain('aria-pressed="true"');
    expect(markup).toContain('class="kiln-tabletop-worker');
    expect(markup).toContain('data-player-id="P1" data-worker-kind="shifu"');
    expect(markup).toContain('data-player-id="P1" data-worker-kind="apprentice"');
    expect(markup).toContain('class="kiln-tabletop-worker-hat"');
    expect(markup).not.toContain('<select name="worker"');
    expect(markup).toContain('<header class="action-card-heading"><h3>');
    expect(markup).not.toContain("<details");
    expect(markup).not.toContain("<summary");
  });

  it("keeps Labour gain copy concise and its submit button consistent", () => {
    const apprentice = renderAction("labour", "apprentice").markup;
    const shifu = renderAction("labour", "shifu").markup;
    const largeBalance = renderAction("labour", "shifu", (state) => {
      state.players["P1"]!.resources.coins = 1_000;
    }).markup;

    expect(apprentice).toContain("Gain 2 Coins.");
    expect(shifu).toContain("Gain 4 Coins.");
    expect(largeBalance).toContain("Gain 4 Coins.");
    expect(apprentice).not.toContain("Labour has no worker limit");
    expect(apprentice).toMatch(/<button[^>]*class="primary-button"[^>]*>Send to Labour<\/button>/);
  });

  it("hides Apprentice-inapplicable controls and reveals them for a Shifu", () => {
    const apprenticeMaterials = renderAction("materials_yard", "apprentice").markup;
    const shifuMaterials = renderAction("materials_yard", "shifu").markup;
    expect(apprenticeMaterials).not.toContain("Shifu bonus");
    expect(shifuMaterials).toContain("Shifu bonus");

    const apprenticeForming = renderAction("forming_studio", "apprentice").markup;
    const shifuForming = renderAction("forming_studio", "shifu").markup;
    expect(apprenticeForming).not.toContain('data-choice-group="shape2"');
    expect(shifuForming).toContain('data-choice-group="shape2"');

    const apprenticeGlazing = renderAction("glaze_workshop", "apprentice").markup;
    const shifuGlazing = renderAction("glaze_workshop", "shifu").markup;
    expect(apprenticeGlazing).not.toContain('data-choice-group="ceramic2"');
    expect(apprenticeGlazing).not.toContain('data-choice-group="shifu-free-decoration"');
    expect(shifuGlazing).toContain('data-choice-group="ceramic2"');
    expect(shifuGlazing).toContain('data-choice-group="shifu-free-decoration"');

    const kilnSetup = (state: GameState): void => {
      addLoaded(state, "P1", "washer", "grey_green", "plain", "high_1");
    };
    const apprenticeKiln = renderAction("kiln_yard", "apprentice", kilnSetup).markup;
    const shifuKiln = renderAction("kiln_yard", "shifu", kilnSetup).markup;
    expect(apprenticeKiln).not.toContain('data-choice-group="ceramic2"');
    expect(apprenticeKiln).not.toContain('data-choice-group="shifu-ceramic"');
    expect(shifuKiln).toContain('data-choice-group="ceramic2"');
    expect(shifuKiln).toContain('data-choice-group="shifu-ceramic"');
  });

  it.each(CAPPED_LOCATIONS)("disables only Apprentices when %s is full", (locationId) => {
    const { markup, state } = renderAction(locationId, "apprentice", (draft) => {
      draft.actionBoard.placements[locationId] = ["occupied-1", "occupied-2"];
    });
    const shifuId = workerId(state, "P1", "shifu");
    const apprenticeIds = Object.values(state.players["P1"]!.workers)
      .filter((worker) => worker.kind === "apprentice" && worker.status === "available")
      .map((worker) => worker.id);

    expect(buttonWithAttribute(markup, "data-worker-choice", shifuId)).not.toContain("disabled");
    for (const apprenticeId of apprenticeIds) {
      const button = buttonWithAttribute(markup, "data-worker-choice", apprenticeId);
      expect(button).toContain('disabled=""');
      expect(button).toContain("Printed spaces are full; only the Shifu may overfill.");
    }
  });

  it.each(["kiln_yard", "labour"] as const)("keeps both worker kinds available at uncapped %s", (locationId) => {
    const { markup, state } = renderAction(locationId, "apprentice", (draft) => {
      draft.actionBoard.placements[locationId] = Array.from({ length: 8 }, (_, index) => `occupied-${index}`);
    });
    const shifuId = workerId(state, "P1", "shifu");
    const apprenticeId = workerId(state, "P1", "apprentice");

    expect(buttonWithAttribute(markup, "data-worker-choice", shifuId)).not.toContain("disabled");
    expect(buttonWithAttribute(markup, "data-worker-choice", apprenticeId)).not.toContain("disabled");
  });

  it("offers Labour when the workshop has no Coins", () => {
    const { markup } = renderAction("labour", "apprentice", (draft) => {
      draft.players["P1"]!.resources.coins = 0;
    });

    expect(markup).toContain("Gain 2 Coins.");
    expect(markup).toContain("Send to Labour");
  });

  it("replaces Kiln Yard controls without a Glazed ceramic and restores them when one is available", () => {
    const empty = renderAction("kiln_yard", "apprentice", (state) => {
      for (const ceramic of Object.values(state.ceramics)) {
        if (ceramic.ownerId === "P1" && ceramic.stage === "glazed") delete state.ceramics[ceramic.id];
      }
    });
    expectUnavailable(empty.markup, "You have no Glazed ceramic to load.");

    const prepared = renderAction("kiln_yard", "apprentice");
    for (const id of availableWorkerIds(prepared.state)) {
      expect(buttonWithAttribute(prepared.markup, "data-worker-choice", id)).not.toContain("disabled");
    }
  });

  it("replaces Glaze controls with the requested explanation when there is no Shaped vessel", () => {
    const { markup } = renderAction("glaze_workshop", "apprentice", (draft) => {
      for (const ceramic of Object.values(draft.ceramics)) {
        if (ceramic.ownerId === "P1" && ceramic.stage === "shaped") delete draft.ceramics[ceramic.id];
      }
    });

    expectUnavailable(markup, "You have no Shaped vessel to glaze.");
  });

  it("keeps the Glaze Shifu legal when no Apprentice can afford a Decoration", () => {
    const { markup, state } = renderAction("glaze_workshop", "apprentice", (draft) => {
      draft.players["P1"]!.resources.coins = 0;
      draft.players["P1"]!.techniques = [];
    });
    const shifuId = workerId(state, "P1", "shifu");

    expect(buttonWithAttribute(markup, "data-worker-choice", shifuId)).not.toContain("disabled");
    for (const id of availableWorkerIds(state, "apprentice")) {
      const button = buttonWithAttribute(markup, "data-worker-choice", id);
      expect(button).toContain('disabled=""');
      expect(button).toContain("No affordable Decoration; a Shifu can apply one for free");
    }
  });

  it("applies the Guild Shifu discount when the printed cost is unaffordable to Apprentices", () => {
    const { markup, state } = renderAction("guild_academy", "apprentice", (draft) => {
      draft.players["P1"]!.resources.coins = 1;
      draft.players["P1"]!.techniques = [];
      draft.techniqueDisplay = { forming: ["T01"], glazing: [], firing: [] };
    });
    const shifuId = workerId(state, "P1", "shifu");

    expect(buttonWithAttribute(markup, "data-worker-choice", shifuId)).not.toContain("disabled");
    for (const id of availableWorkerIds(state, "apprentice")) {
      const button = buttonWithAttribute(markup, "data-worker-choice", id);
      expect(button).toContain('disabled=""');
      expect(button).toContain("No face-up Advanced Tech is affordable");
    }
    expect(markup).toContain("1 affordable face-up Technique.");
  });

  it.each(["marketDisplay", "marketDeck", "marketDiscard"] as const)(
    "keeps Commission workers legal when %s is the only remaining Order source",
    (source) => {
      const { markup, state } = renderAction("market_imperial_office", "apprentice", (draft) => {
        const orderId = [...draft.marketDisplay, ...draft.marketDeck, ...draft.marketDiscard][0];
        if (orderId === undefined) throw new Error("Expected a Main Order fixture");
        draft.marketDisplay = [];
        draft.marketDeck = [];
        draft.marketDiscard = [];
        draft[source] = [orderId];
      });

      for (const id of availableWorkerIds(state)) {
        expect(buttonWithAttribute(markup, "data-worker-choice", id)).not.toContain("disabled");
      }
    },
  );

  it("replaces Commission controls only when all Order sources are empty", () => {
    const { markup } = renderAction("market_imperial_office", "apprentice", (draft) => {
      draft.marketDisplay = [];
      draft.marketDeck = [];
      draft.marketDiscard = [];
    });

    expectUnavailable(markup, "No Order source is available.");
  });

  it.each(CAPPED_LOCATIONS)("replaces %s controls when it is full and no Shifu remains", (locationId) => {
    const { markup } = renderAction(locationId, "apprentice", (draft) => {
      draft.actionBoard.placements[locationId] = ["occupied-1", "occupied-2"];
      useShifu(draft);
    });

    expectUnavailable(markup, /full/i);
  });

  it("offers Materials when the workshop has no Clay or Wood", () => {
    const { markup } = renderAction("materials_yard", "apprentice", (draft) => {
      draft.players["P1"]!.resources.clay = 0;
      draft.players["P1"]!.resources.wood = 0;
    });

    expect(markup).toContain("Gather materials");
  });

  it.each(["clay", "wood"] as const)("keeps Materials usable above the physical %s stock", (resource) => {
    const { markup, selectedWorkerId } = renderAction("materials_yard", "apprentice", (draft) => {
      draft.players["P1"]!.resources[resource] = 1_000;
    });

    expect(markup).toContain("<form");
    expect(buttonWithAttribute(markup, "data-worker-choice", selectedWorkerId)).not.toContain("disabled");
  });

  it("keeps Labour usable above the physical Coin stock", () => {
    const { markup, selectedWorkerId } = renderAction("labour", "shifu", (draft) => {
      draft.players["P1"]!.resources.coins = 1_000;
    });

    expect(markup).toContain("<form");
    expect(buttonWithAttribute(markup, "data-worker-choice", selectedWorkerId)).not.toContain("disabled");
  });

  it("replaces Potter controls when no shape is affordable", () => {
    const { markup } = renderAction("forming_studio", "apprentice", (draft) => {
      draft.players["P1"]!.resources.clay = 0;
    });

    expectUnavailable(markup, /Clay/i);
  });

  it.each([false, true])("hides unaffordable Apprentice glazing with exhausted waiver %s", (exhausted) => {
    const { markup } = renderAction("glaze_workshop", "apprentice", (draft) => {
      useShifu(draft);
      draft.players["P1"]!.resources.coins = 0;
      draft.players["P1"]!.techniques = exhausted ? [{ id: "T07", exhausted: true }] : [];
    });

    expectUnavailable(markup, /Coin|Decoration/i);
  });

  it.each(["T07", "T08", "T09"] as const)("keeps zero-Coin Apprentice glazing usable with %s", (techniqueId) => {
    const { markup, selectedWorkerId } = renderAction("glaze_workshop", "apprentice", (draft) => {
      useShifu(draft);
      draft.players["P1"]!.resources.coins = 0;
      draft.players["P1"]!.techniques = [{ id: techniqueId, exhausted: false }];
    });

    expect(markup).toContain("<form");
    expect(buttonWithAttribute(markup, "data-worker-choice", selectedWorkerId)).not.toContain("disabled");
  });

  it.each([false, true])("hides Kiln controls when Shared Kiln is full and own Imperial is occupied %s", (unlocked) => {
    const { markup } = renderAction("kiln_yard", "apprentice", (draft) => {
      fillSharedKiln(draft);
      draft.players["P1"]!.imperialKilnUnlocked = unlocked;
      if (unlocked) addLoaded(draft, "P1", "plate", "white", "plain", "imperial");
    });

    expectUnavailable(markup, "No Shared or Imperial kiln destination is empty.");
  });

  it("keeps loading available into an empty unlocked own Imperial Kiln when Shared Kiln is full", () => {
    const { markup, selectedWorkerId } = renderAction("kiln_yard", "apprentice", (draft) => {
      fillSharedKiln(draft);
      draft.players["P1"]!.imperialKilnUnlocked = true;
      addLoaded(draft, "P2", "plate", "white", "plain", "imperial");
    });

    expect(markup).toContain("<form");
    expect(buttonWithAttribute(markup, "data-worker-choice", selectedWorkerId)).not.toContain("disabled");
    expect(markup).toContain('data-choice-value="imperial"');
  });

  it("keeps Commission usable at the three-Order hand limit", () => {
    const { markup, selectedWorkerId } = renderAction("market_imperial_office", "apprentice", (draft) => {
      const nextOrder = draft.marketDeck.shift();
      if (nextOrder === undefined) throw new Error("Expected an Order fixture");
      draft.players["P1"]!.orderHand.push(nextOrder);
    });

    expect(markup).toContain("<form");
    expect(buttonWithAttribute(markup, "data-worker-choice", selectedWorkerId)).not.toContain("disabled");
  });

  it("replaces Guild controls at the two-Advanced-Tech limit", () => {
    const { markup } = renderAction("guild_academy", "shifu", (draft) => {
      draft.players["P1"]!.techniques = [{ id: "T07", exhausted: false }, { id: "T08", exhausted: false }];
    });

    expectUnavailable(markup, /maximum.*2/i);
  });

  it("replaces Guild controls when no face-up Tech remains", () => {
    const { markup } = renderAction("guild_academy", "shifu", (draft) => {
      draft.techniqueDisplay = { forming: [], glazing: [], firing: [] };
    });

    expectUnavailable(markup, /No face-up.*available/i);
  });

  it("replaces Guild controls when no Tech is affordable even with the Shifu discount", () => {
    const { markup } = renderAction("guild_academy", "shifu", (draft) => {
      draft.players["P1"]!.resources.coins = 0;
      draft.techniqueDisplay = { forming: ["T01"], glazing: [], firing: [] };
    });

    expectUnavailable(markup, /No face-up.*affordable/i);
  });

  it("does not count the discount of an already-used Shifu when checking Guild affordability", () => {
    const { markup } = renderAction("guild_academy", "apprentice", (draft) => {
      useShifu(draft);
      draft.players["P1"]!.resources.coins = 1;
      draft.techniqueDisplay = { forming: ["T01"], glazing: [], firing: [] };
    });

    expectUnavailable(markup, /No face-up.*affordable/i);
  });

  it("renders Potter Shapes as choices and disables only those the player cannot afford", () => {
    const { markup } = renderAction("forming_studio", "apprentice", (state) => {
      state.players["P1"]!.resources.clay = 1;
    });

    expect(markup).toContain('data-choice-group="shape1"');
    expect(markup).not.toContain('<select name="shape1"');
    for (const affordable of ["bowl", "plate", "washer"]) {
      expect(buttonWithAttribute(markup, "data-choice-value", affordable)).not.toContain("disabled");
    }
    for (const unaffordable of ["vase", "censer"]) {
      const button = buttonWithAttribute(markup, "data-choice-value", unaffordable);
      expect(button).toContain('disabled=""');
      expect(button).toContain("Current combination requires 2 Clay");
    }
  });
});
