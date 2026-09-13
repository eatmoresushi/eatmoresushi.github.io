import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { projectPublicGameState } from "../../src/multiplayer/index.ts";
import { ActionPanel } from "../../src/ui/ActionPanel.tsx";
import { commandNotice } from "../../src/ui/App.tsx";
import {
  TabletopGameExperience,
  computerRecapHighlights,
  keepCommissionControlsOpenAfterCommand,
} from "../../src/ui/TabletopGameExperience.tsx";
import { LanguageProvider } from "../../src/ui/i18n.tsx";
import type { Locale } from "../../src/ui/i18n.tsx";
import type { PublicGameEvent, PublicSeat } from "../../src/multiplayer/index.ts";
import { addFinished, addLoaded, addShaped, startedGame, workerId } from "./helpers.ts";

function localizedMarkup(locale: Locale, child: ReturnType<typeof createElement>): string {
  return renderToStaticMarkup(createElement(LanguageProvider, { initialLocale: locale, children: child }));
}

describe("V1.2.6 functional tabletop", () => {
  it("renders the approved board from live public state with owned pieces and player-count locks", () => {
    const state = structuredClone(startedGame(2, 12_660).state);
    const marked = addLoaded(state, "P1", "plate", "celadon", "carved", "high_1", true);
    const finished = addFinished(state, "P1", "censer", "fine", "grey_green", "crackle");
    state.players["P1"]!.kilnYardShifuCeramicId = marked.id;
    state.players["P1"]!.kilnYardShifuUsedThisRound = true;

    const placedWorkerId = workerId(state, "P2", "apprentice");
    state.players["P2"]!.workers[placedWorkerId]!.status = "placed";
    state.players["P2"]!.workers[placedWorkerId]!.locationId = "materials_yard";
    state.actionBoard.placements.materials_yard.push(placedWorkerId);

    const game = projectPublicGameState(state);
    const seats: PublicSeat[] = game.playerOrder.map((playerId, index) => ({
      seatId: `seat-${index}`,
      roomId: "room-1",
      playerId,
      seatIndex: index,
      displayName: game.players[playerId]!.displayName,
      colour: ["cinnabar", "river", "ochre", "plum"][index]!,
      isHost: index === 0,
      isComputer: playerId === "P2",
      aiPolicyVersion: playerId === "P2" ? "rules-v1.2.6-heuristic-001" : null,
    }));
    const markup = localizedMarkup("en", createElement(TabletopGameExperience, {
      game,
      ownPlayerId: "P1",
      ownPendingContribution: null,
      events: [],
      seats,
      describeEvent: (record) => record.event.type,
      busy: false,
      send: async () => true,
    }));

    expect(markup).toContain('data-testid="tabletop-live-ui"');
    expect(markup).toContain("GAME TABLE");
    expect(markup).not.toContain("SERVER-AUTHORITATIVE");
    expect(markup).not.toContain(`V${game.rulesVersion} · ${game.gameId}`);
    expect(markup).not.toContain("Game ID");
    expect(markup).not.toContain("Game controls");
    expect(markup).not.toContain('class="kiln-tabletop-actionbar"');
    expect(markup).toContain("Pass round");
    expect(markup).toContain("Face-up Main Orders");
    expect(markup).toContain("Shared Kiln");
    expect(markup).toContain("Face-up Techs");
    expect(markup).toContain('data-hover-preview="order"');
    expect(markup).toContain('data-hover-preview="advanced-technique"');
    expect(markup).toMatch(/aria-describedby="kiln-order-preview-[^"]+-description"/);
    expect(markup).toMatch(/aria-describedby="kiln-technique-preview-[^"]+-description"/);
    expect(markup).toMatch(/aria-describedby="kiln-starting-technique-preview-[^"]+-description"/);
    expect(markup).toMatch(/<button[^>]*aria-haspopup="dialog"[^>]*data-hover-preview="starting-technique"[^>]*data-preview-id="kiln-starting-technique-preview-ST0[1-4]"[^>]*data-starting-technique-id="ST0[1-4]"/);
    expect(markup).toMatch(/<button[^>]*aria-label="Inspect Order [^"]+"[^>]*aria-haspopup="dialog"[^>]*data-hover-preview="order"/);
    expect(markup).toMatch(/<button[^>]*aria-label="Inspect [^"]+"[^>]*aria-haspopup="dialog"[^>]*data-hover-preview="advanced-technique"/);
    expect(markup).toMatch(/class="kiln-tabletop-player-resources" aria-label="Resources"><i>Clay \d+<\/i><i>Wood \d+<\/i><i>Coins \d+<\/i>/);
    expect(markup).toContain('title="First Player">1</span>');
    expect(markup).not.toContain('title="First Player">一</span>');
    expect(markup).toContain('data-min-players="3"');
    expect(markup).toContain('data-min-players="4"');
    expect(markup).toMatch(/class="[^"]*is-locked[^"]*" data-min-players="3"/);
    expect(markup).toMatch(/class="[^"]*is-locked[^"]*" data-min-players="4"/);

    expect(markup).toContain('data-player-id="P2"');
    expect(markup).toMatch(/class="kiln-tabletop-ai-badge"[^>]*aria-label="Computer player"[^>]*>AI<\/span>/);
    expect(markup).toContain('data-worker-kind="apprentice"');
    expect(markup).toContain('data-worker-kind="shifu"');
    expect(markup).toContain('class="kiln-tabletop-worker-hat"');
    expect(markup).toContain('>S</text>');
    expect(markup).toContain('>A</text>');

    expect(markup).toContain('data-shape="plate"');
    expect(markup).toContain('data-glaze="celadon"');
    expect(markup).toContain('data-decoration="carved"');
    expect(markup).toContain('class="kiln-tabletop-decoration-pattern is-carved"');
    expect(markup).toContain('class="kiln-tabletop-decoration-pattern is-crackle"');
    expect(markup).toContain("BELONGS TO");
    expect(markup).toContain("Preferred Heat");
    expect(markup).not.toContain(`>${marked.id} ·`);
    expect(markup).not.toContain(`>${finished.id} ·`);
    expect(markup).toContain("Furniture");
    expect(markup).toContain('class="kiln-tabletop-quality-badge is-fine"');
    expect(markup).toContain(">Fine</b>");
    expect(markup).toMatch(/class="kiln-tabletop-shifu-marker"[^>]*>S<\/em>/);
    expect(markup).not.toMatch(/<i>素<\/i>|<i>刻<\/i>|<i>印<\/i>|<i>裂<\/i>/);
  });

  it("shows a concise computer recap without backend implementation details", () => {
    const state = structuredClone(startedGame(2, 12_663).state);
    const game = projectPublicGameState(state);
    const apprentice = workerId(state, "P2", "apprentice");
    const events: PublicGameEvent[] = [
      { type: "WORKER_PLACED", playerId: "P2", workerId: apprentice, locationId: "materials_yard" },
      { type: "RESOURCES_CHANGED", playerId: "P2", clay: 2, wood: 1, coins: 0 },
      { type: "PLAYER_PASSED", playerId: "P2" },
    ];
    const highlights = computerRecapHighlights(events);

    expect(highlights.map((event) => event.type)).toEqual(["WORKER_PLACED", "PLAYER_PASSED"]);
    const markup = localizedMarkup("en", createElement(TabletopGameExperience, {
      game,
      ownPlayerId: "P1",
      ownPendingContribution: null,
      events: [],
      computerRecap: {
        id: "recap-1",
        revision: 9,
        actionCount: 2,
        actorIds: ["P2", "P2"],
        events,
      },
      describeEvent: (record) => record.event.type,
      describeComputerEvent: (event) => `TURN EVENT: ${event.type}`,
      busy: false,
      send: async () => true,
    }));

    expect(markup).toContain('data-testid="computer-turn-recap"');
    expect(markup).toContain("COMPUTER TURN RECAP");
    expect(markup).toContain("2 actions");
    expect(markup).not.toContain("server revision");
    expect(markup).toContain("TURN EVENT: WORKER_PLACED");
    expect(markup).not.toContain("TURN EVENT: RESOURCES_CHANGED");
    expect(markup).toContain("View full log");
  });

  it("uses a tabletop selection to focus the matching action form", () => {
    const state = startedGame(2, 12_661).state;
    const selectedWorkerId = workerId(state, "P1", "apprentice", 1);
    const game = projectPublicGameState(state);
    const markup = localizedMarkup("en", createElement(ActionPanel, {
      game,
      ownPlayerId: "P1",
      ownPendingContribution: null,
      selectedLocation: "labour",
      selectedWorkerId,
      busy: false,
      send: async () => true,
    }));

    expect(markup).toContain("Send to Labour");
    expect(markup).not.toContain("Gather materials");
    expect(markup).not.toContain("Shape vessels");
    expect(markup).toContain(`value="${selectedWorkerId}" selected=""`);
  });

  it("offers both privately viewed and face-up Orders during a Colour Samples choice", () => {
    const state = structuredClone(startedGame(2, 12_670).state);
    const lookedAt = state.marketDeck.splice(0, 3);
    const marketDisplay = [...state.marketDisplay];
    state.phase = {
      type: "work_office_orders",
      actorId: "P1",
      workerId: workerId(state, "P1", "apprentice"),
      mode: "take_one",
      remainingTakes: 1,
      ordersTaken: 0,
      step: "colour_samples_choose",
      colourSamplesUsed: true,
      colourSamplesDeck: "market",
      colourSamplesChoices: lookedAt,
    };
    const markup = localizedMarkup("en", createElement(ActionPanel, {
      game: projectPublicGameState(state),
      ownPlayerId: "P1",
      ownPendingContribution: null,
      ownPrivateDecision: {
        startingOrderIds: [],
        colourSamplesOrderIds: lookedAt,
        guildInspectedTechniqueIds: [],
        fireModifierPeek: null,
      },
      busy: false,
      send: async () => true,
    }));

    expect(markup).toContain("Privately viewed Orders");
    expect(markup).toContain(`aria-label="Reserve looked-at ${lookedAt[0]}"`);
    expect(markup).toContain("Face-up Orders");
    expect(markup).toContain(`aria-label="Reserve face-up ${marketDisplay[0]}"`);
  });

  it("keeps one Commission modal open through chained reservation decisions", () => {
    const state = structuredClone(startedGame(2, 12_671).state);
    state.phase = {
      type: "work_office_orders",
      actorId: "P1",
      workerId: workerId(state, "P1", "shifu"),
      mode: "take_up_to_two",
      remainingTakes: 1,
      ordersTaken: 1,
      step: "gain_advance",
      colourSamplesUsed: false,
    };
    const game = projectPublicGameState(state);

    expect(keepCommissionControlsOpenAfterCommand(game, "P1", {
      type: "COMMISSION_GAIN_ADVANCE",
      resource: "clay",
    })).toBe(true);
    expect(keepCommissionControlsOpenAfterCommand(game, "P1", {
      type: "OFFICE_END_ORDERS",
    })).toBe(false);

    if (game.phase.type !== "work_office_orders") throw new Error("Missing Commission phase");
    game.phase.remainingTakes = 0;
    expect(keepCommissionControlsOpenAfterCommand(game, "P1", {
      type: "COMMISSION_GAIN_ADVANCE",
      resource: "wood",
    })).toBe(false);
  });

  it("describes blind and face-up reservations by their actual source", () => {
    const state = startedGame(2, 12_672).state;
    const game = projectPublicGameState(state);
    const baseResult = {
      commandId: "notice-test",
      room: {
        id: "room-1",
        code: "NOTICE",
        status: "playing" as const,
        hostSeatId: "seat-1",
        rulesVersion: "1.2.6" as const,
        latestRevision: game.revision,
        endedAt: null,
        endedByPlayerId: null,
      },
      actorId: "P1",
      revision: game.revision,
      game,
      ownPendingContribution: null,
    };

    expect(commandNotice({
      ...baseResult,
      events: [{ type: "ORDER_TAKEN", playerId: "P1", orderId: "O01", deck: "market", acquisition: "blind_deck" }],
    })).toBe("Reserved unseen top Main Order O01.");
    expect(commandNotice({
      ...baseResult,
      events: [{ type: "ORDER_TAKEN", playerId: "P1", orderId: "O02", deck: "market", acquisition: "face_up" }],
    }, "zh-CN")).toBe("承接公开主委托O02。");
  });

  it("keeps the Glaze action and its submit control available in a scrollable modal rail", () => {
    const state = structuredClone(startedGame(2, 12_664).state);
    addShaped(state, "P1", "bowl");
    const game = projectPublicGameState(state);
    const markup = localizedMarkup("en", createElement(ActionPanel, {
      game,
      ownPlayerId: "P1",
      ownPendingContribution: null,
      selectedLocation: "glaze_workshop",
      busy: false,
      send: async () => true,
    }));

    expect(markup).toContain('class="control-form control-form-glaze"');
    expect(markup).toContain('class="control-submit-bar"');
    expect(markup).toContain("Apply glaze");
    expect(markup).not.toContain("Authoritative controls");
    expect(markup).not.toContain("Every command is validated by the server");
  });

  it("explains firing ineligibility and disables Wood-funded Contributions at zero Wood", () => {
    const state = structuredClone(startedGame(2, 12_665).state);
    addLoaded(state, "P2", "plate", "celadon", "plain", "middle_1");
    state.phase = {
      type: "firing_contributions",
      windowId: "firing-ui-window",
      eligiblePlayerIds: ["P2"],
      submittedPlayerIds: [],
    };
    let game = projectPublicGameState(state);
    let markup = localizedMarkup("en", createElement(ActionPanel, {
      game,
      ownPlayerId: "P1",
      ownPendingContribution: null,
      busy: false,
      send: async () => true,
    }));

    expect(markup).toContain("You cannot participate in this firing");
    expect(markup).toContain("no ceramic loaded in the Shared Kiln or your Imperial Kiln");

    addLoaded(state, "P1", "bowl", "white", "plain", "high_1");
    state.players["P1"]!.resources.wood = 0;
    state.phase.eligiblePlayerIds = ["P1", "P2"];
    game = projectPublicGameState(state);
    markup = localizedMarkup("en", createElement(ActionPanel, {
      game,
      ownPlayerId: "P1",
      ownPendingContribution: null,
      busy: false,
      send: async () => true,
    }));

    const bank = markup.match(/<button[^>]*aria-label="Bank the Fire: 1 Wood, -1 Heat"[^>]*>/)?.[0] ?? "";
    const tend = markup.match(/<button[^>]*aria-label="Tend the Fire: 0 Wood, \+0 Heat"[^>]*>/)?.[0] ?? "";
    const stoke = markup.match(/<button[^>]*aria-label="Stoke the Fire: 1 Wood, \+1 Heat"[^>]*>/)?.[0] ?? "";
    expect(bank).toContain('disabled=""');
    expect(stoke).toContain('disabled=""');
    expect(tend).not.toContain('disabled=""');
    expect(markup).toContain("Not enough Wood");
  });

  it("keeps Contributions private while choosing, then shows the reveal and First Player gate", () => {
    const state = structuredClone(startedGame(2, 12_666).state);
    addLoaded(state, "P1", "bowl", "white", "plain", "high_1");
    addLoaded(state, "P2", "plate", "celadon", "plain", "middle_1");
    state.phase = {
      type: "firing_contributions",
      windowId: "firing-ui-window",
      eligiblePlayerIds: ["P1", "P2"],
      submittedPlayerIds: ["P1"],
    };
    let game = projectPublicGameState(state);
    let markup = localizedMarkup("en", createElement(ActionPanel, {
      game,
      ownPlayerId: "P1",
      ownPendingContribution: { windowId: "firing-ui-window", card: "BANK", useFuelLedger: false, submitted: true },
      busy: false,
      send: async () => true,
    }));

    expect(markup).toContain("Your sealed choice:");
    expect(markup).toContain("Ready");
    expect(markup).toContain("Choosing");
    expect(markup).not.toContain("Player 2</small><strong>Stoke");

    state.firstPlayerId = "P2";
    state.phase = { type: "firing_reveal_fire", actorId: "P2" };
    state.firingContext = {
      round: state.round,
      contributors: ["P1", "P2"],
      contributions: { P1: "BANK", P2: "STOKE" },
      fuelLedgerUpgradedBy: [],
      baseHeat: 2,
      fireModifier: null,
      globalHeat: null,
      kilnYardShifuRepositions: [],
      ceramicResults: {},
    };
    game = projectPublicGameState(state);
    markup = localizedMarkup("en", createElement(ActionPanel, {
      game,
      ownPlayerId: "P1",
      ownPendingContribution: null,
      busy: false,
      send: async () => true,
    }));

    expect(markup).toContain("FIRING PROGRESS");
    expect(markup).toContain("Player 1</small><strong>Bank");
    expect(markup).toContain("Player 2</small><strong>Stoke");
    expect(markup).toContain("2 − 1 + 1 = 2");
    expect(markup).toContain("Waiting for Player 2 to reveal the Fire card.");
    expect(markup).not.toContain(">Reveal Fire card</button>");

    state.firstPlayerId = "P1";
    state.phase = { type: "firing_reveal_fire", actorId: "P1" };
    game = projectPublicGameState(state);
    markup = localizedMarkup("en", createElement(ActionPanel, {
      game,
      ownPlayerId: "P1",
      ownPendingContribution: null,
      busy: false,
      send: async () => true,
    }));
    expect(markup).toContain(">Reveal Fire card</button>");
  });

  it("reviews Base, Fire, Actual Heat, and the current player's ceramic Quality", () => {
    const state = structuredClone(startedGame(2, 12_667).state);
    const ceramic = addFinished(state, "P1", "bowl", "fine", "white", "plain");
    state.phase = { type: "orders", turnOrder: ["P2", "P1"], currentIndex: 0, activePlayerId: "P2", completedInCircuit: 0 };
    state.lastFiringResult = {
      round: state.round,
      contributors: ["P1", "P2"],
      contributions: { P1: "TEND", P2: "STOKE" },
      effectiveHeatAdjustments: { P1: 0, P2: 1 },
      baseHeat: 3,
      fireModifier: -1,
      globalHeat: 2,
      kilnYardShifuRepositions: [],
      ceramicResults: {
        [ceramic.id]: {
          ceramicId: ceramic.id,
          zoneModifier: 1,
          naturalActualHeat: 3,
          naturalHeatDifference: 1,
          naturalExactMatch: false,
          finalActualHeat: 3,
          finalHeatDifference: 1,
          forcedQuality: null,
          assignedQuality: "fine",
        },
      },
    };
    const game = projectPublicGameState(state);
    const markup = localizedMarkup("en", createElement(ActionPanel, {
      game,
      ownPlayerId: "P1",
      ownPendingContribution: null,
      busy: false,
      send: async () => true,
    }));

    expect(markup).toContain("FIRING COMPLETE");
    expect(markup).toContain("2 + 0 + 1 = 3");
    expect(markup).toContain("Actual Heat");
    expect(markup).toContain("2 + 1 = 3");
    expect(markup).toContain("Preferred 1");
    expect(markup).toContain(">Fine</strong>");
    expect(markup).toContain("Continue to Order Phase");
  });

  it("shows only Orders the current player can complete with a valid ceramic combination", () => {
    const state = structuredClone(startedGame(2, 12_668).state);
    addFinished(state, "P1", "bowl", "standard", "white", "plain");
    addFinished(state, "P1", "plate", "standard", "celadon", "carved");
    addFinished(state, "P1", "washer", "standard", "grey_green", "impressed");
    addFinished(state, "P1", "censer", "flawed", "moon_white", "crackle");
    state.players["P1"]!.orderHand = ["S01", "S04", "O43", "O44"];
    state.marketDisplay = ["O02"];
    state.phase = { type: "orders", turnOrder: ["P1", "P2"], currentIndex: 0, activePlayerId: "P1", completedInCircuit: 0 };

    const markup = localizedMarkup("en", createElement(ActionPanel, {
      game: projectPublicGameState(state),
      ownPlayerId: "P1",
      ownPendingContribution: null,
      busy: false,
      send: async () => true,
    }));

    expect(markup).toContain(">Complete S01</button>");
    expect(markup).toContain(">Complete O02</button>");
    expect(markup).toContain(">Complete O43</button>");
    expect(markup).not.toContain(">Complete S04</button>");
    expect(markup).not.toContain(">Complete O44</button>");
    expect(markup).not.toContain("Censer · Moon White · Crackle · Flawed");
  });

  it("explains when none of the held or face-up Orders can currently be completed", () => {
    const state = structuredClone(startedGame(2, 12_669).state);
    addFinished(state, "P1", "bowl", "flawed", "white", "plain");
    state.players["P1"]!.orderHand = ["S06", "S04"];
    state.marketDisplay = ["O43"];
    state.phase = { type: "orders", turnOrder: ["P1", "P2"], currentIndex: 0, activePlayerId: "P1", completedInCircuit: 0 };

    const markup = localizedMarkup("en", createElement(ActionPanel, {
      game: projectPublicGameState(state),
      ownPlayerId: "P1",
      ownPendingContribution: null,
      busy: false,
      send: async () => true,
    }));

    expect(markup).toContain("You cannot complete any available Orders with your Finished ceramics.");
    expect(markup).not.toContain("completion-card");
    expect(markup).toContain("Pass this Order opportunity");
  });

  it("renders the live surface in Simplified Chinese without changing state", () => {
    const game = projectPublicGameState(startedGame(3, 12_662).state);
    const before = JSON.stringify(game);
    const markup = localizedMarkup("zh-CN", createElement(TabletopGameExperience, {
      game,
      ownPlayerId: "P1",
      ownPendingContribution: null,
      events: [],
      describeEvent: (record) => record.event.type,
      busy: false,
      send: async () => true,
    }));

    expect(markup).toContain("游戏桌面");
    expect(markup).not.toContain("服务器权威状态");
    expect(markup).toContain("公开主委托");
    expect(markup).toContain("共窑");
    expect(markup).toContain("御府声望");
    expect(markup).toContain("你的作坊");
    expect(markup).toContain('data-hover-preview="order"');
    expect(markup).toContain('data-hover-preview="advanced-technique"');
    expect(markup).toContain('data-hover-preview="starting-technique"');
    expect(markup).toMatch(/class="kiln-tabletop-player-resources" aria-label="资源"><i>泥 \d+<\/i><i>柴 \d+<\/i><i>钱 \d+<\/i>/);
    expect(JSON.stringify(game)).toBe(before);
  });
});
