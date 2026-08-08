from pathlib import Path
import json, sys, re
from collections import Counter

ROOT = Path(__file__).resolve().parents[1]
errors = []

def load(name):
    return json.loads((ROOT/"data"/name).read_text(encoding="utf-8"))

orders = load("orders.json")
techs = load("techniques.json")
kilns = load("kilns.json")
cfg = load("game_config.json")
actions = load("action_locations.json")
firing = load("firing.json")
components = load("components.json")
imperial = load("imperial_progress.json")
asset_specs = load("asset_specs.json")
round_structure = load("round_structure.json")

def check(cond, msg):
    if not cond: errors.append(msg)

for versioned in [cfg, actions, firing, components, imperial, asset_specs, round_structure]:
    check(versioned["rulesVersion"] == "0.6.3", "Rules version must be 0.6.3")
check(cfg["players"] == {"min":2,"max":4}, "Player count must be 2-4")
check(cfg["rounds"] == 5, "Game must be 5 rounds")
check(cfg["startingResources"] == {"clay":2,"wood":2,"coins":3}, "Starting resources mismatch")
check(cfg["workers"]["shifu"] == 1, "Each player needs 1 Shifu")
check(cfg["workers"]["apprenticesTotal"] == 5, "Each player needs 5 Apprentices")
check(cfg["workers"]["apprenticesStarting"] == 3, "3 Apprentices must start available")
check(cfg["workers"]["apprenticeUnlockProgress"] == [2,4], "Apprentice unlock spaces must be 2 and 4")

expected_caps = {
 "materials_yard":{"2":2,"3":3,"4":4},
 "forming_studio":{"2":2,"3":3,"4":4},
 "glaze_workshop":{"2":2,"3":3,"4":4},
 "kiln_yard":{"2":3,"3":4,"4":5},
 "market_imperial_office":{"2":2,"3":3,"4":4},
 "guild_academy":{"2":1,"3":2,"4":2},
}
locs = {x["id"]:x for x in actions["locations"]}
check(set(locs) == set(expected_caps), "Must have exactly the six V0.6.3 action locations")
for k,v in expected_caps.items():
    check(locs.get(k,{}).get("capacity") == v, f"Capacity mismatch for {k}")
check("reposition" not in locs["kiln_yard"]["shifu"].lower(), "Shifu Kiln action must not reposition")
check("wood" not in locs["kiln_yard"]["apprentice"].lower(), "Kiln Yard Apprentice must not gain Wood")
check("wood" not in locs["kiln_yard"]["shifu"].lower(), "Kiln Yard Shifu must not gain Wood")
check(locs["materials_yard"]["apprentice"] == "Gain 3 resources in any combination of Clay and Wood.", "Materials Apprentice amount mismatch")
check(locs["materials_yard"]["shifu"] == "Gain 4 resources in any combination of Clay and Wood.", "Materials Shifu amount mismatch")
office = locs["market_imperial_office"]
check(office.get("apprentice") == "Choose one: take 1 face-up Market or Imperial Order; or gain 2 Coins. In addition, you may sell 1 Flawed ceramic for 1 Coin.", "Office Apprentice action mismatch")
check(office.get("shifu") == "Choose one: take up to 2 face-up Orders; take 1 face-up Order and gain 2 Coins; or gain 4 Coins. In addition, you may sell up to 2 Flawed ceramics for 1 Coin each.", "Office Shifu action mismatch")
check("apprenticeOptions" not in office and "shifuOptions" not in office, "Office sale must not remain a standalone action option")
check("apprentice" not in locs["guild_academy"], "Guild & Academy must not define an Apprentice action")
check("printed Coin cost" in locs["guild_academy"]["shifu"], "Guild Shifu must pay printed cost")
check(cfg["decorations"] == {"plain":1,"carved":2,"impressed":2,"crackle":2}, "V0.6.3 Decoration costs mismatch")

check(len(orders["market"]) == 20, "Expected 20 Market Orders")
check(len(orders["imperial"]) == 10, "Expected 10 Imperial Orders")
check([x["id"] for x in orders["market"]] == [f"M{i:02d}" for i in range(1,21)], "Market Order IDs mismatch")
check([x["id"] for x in orders["imperial"]] == [f"I{i:02d}" for i in range(1,11)], "Imperial Order IDs mismatch")

# Key high-risk Order values
key_orders = {x["id"]:x for x in orders["market"] + orders["imperial"]}
for oid, vp, coins in [
    ("M15",7,5),("M16",8,5),("M17",9,5),("M18",10,4),("M19",11,6),("M20",10,5),
    ("I06",11,0),("I07",12,0),("I08",14,0),("I09",13,0),("I10",15,0)
]:
    check(key_orders[oid]["vp"] == vp and key_orders[oid].get("coins",0) == coins, f"{oid} reward mismatch")
check(key_orders["M10"]["ceramics"] == [{"shape":"censer","glaze":"moon_white","decoration":"carved"}], "M10 attribute mismatch")
check(key_orders["M12"]["ceramics"] == [{"glaze":"grey_green","decoration":"impressed"}], "M12 attribute mismatch")
check(key_orders["M14"]["ceramics"] == [{"glaze":"moon_white","decoration":"impressed"}], "M14 attribute mismatch")
check(key_orders["I02"]["ceramics"] == [{"shape":"washer","glaze":"celadon","decoration":"impressed"}], "I02 attribute mismatch")
check(key_orders["I04"]["ceramics"] == [{"shape":"vase","glaze":"moon_white","decoration":"impressed"}], "I04 attribute mismatch")
check({x["id"]:x.get("imperialProgressReward") for x in orders["imperial"]} == {
    **{f"I{i:02d}":1 for i in range(1,6)},
    **{f"I{i:02d}":2 for i in range(6,11)},
}, "Imperial Order Progress rewards mismatch")
glaze_counts = Counter(
    requirement["glaze"]
    for order in orders["market"] + orders["imperial"]
    for requirement in order["ceramics"]
    if "glaze" in requirement
)
decoration_counts = Counter(
    requirement["decoration"]
    for order in orders["market"] + orders["imperial"]
    for requirement in order["ceramics"]
    if "decoration" in requirement
)
check(glaze_counts == {"white":4,"celadon":4,"grey_green":4,"moon_white":4}, "Named Glaze distribution mismatch")
check(decoration_counts == {"plain":3,"carved":3,"impressed":4,"crackle":3}, "Named Decoration distribution mismatch")

check(len(techs) == 12, "Expected 12 Techniques")
check(sum(1 for t in techs if t["discipline"]=="forming") == 4, "Expected 4 Forming Techniques")
check(sum(1 for t in techs if t["discipline"]=="glazing") == 4, "Expected 4 Glazing Techniques")
check(sum(1 for t in techs if t["discipline"]=="firing") == 4, "Expected 4 Firing Techniques")
check({t["name"] for t in techs} == {
 "Large Throwing Wheel","Measuring Calipers","Clay Substitution","Drying Frames",
 "Carving Knives","Seal Stamps","Glaze Notebook","Colour Samples",
 "Kiln Setting","Protective Saggars","Fuel Ledger","Test Pieces"
}, "Technique names mismatch")
expected_technique_costs = {
 "T01":2, "T02":2, "T03":3, "T04":2,
 "T05":2, "T06":2, "T07":2, "T08":2,
 "T09":3, "T10":3, "T11":3, "T12":2,
}
check({t["id"]:t["cost"] for t in techs} == expected_technique_costs, "V0.6.3 Technique costs mismatch")

check(len(kilns) == 5, "Expected 5 Kilns")
check({k["id"] for k in kilns} == {"RU","GU","GE","DI","JU"}, "Kiln IDs mismatch")
ge = next(k for k in kilns if k["id"] == "GE")
check(
    "without paying the Crackle Decoration cost" in ge["ability"]
    and "or refunding its original Decoration cost" in ge["ability"],
    "Ge must waive Crackle cost without a refund",
)

check(len(firing["kilnSpaces"]) == 8, "Shared Kiln must have 8 spaces")
check(sum(1 for s in firing["kilnSpaces"] if s["zone"]=="high") == 2, "High zone must have 2 spaces")
check(sum(1 for s in firing["kilnSpaces"] if s["zone"]=="middle") == 3, "Middle zone must have 3 spaces")
check(sum(1 for s in firing["kilnSpaces"] if s["zone"]=="low") == 3, "Low zone must have 3 spaces")
check(firing["fireDeck"].count(-1)==5 and firing["fireDeck"].count(0)==10 and firing["fireDeck"].count(1)==5, "Fire distribution mismatch")
check(firing["qualityByDifference"] == {"0":"masterpiece","1":"fine","2":"standard","3+":"flawed"}, "Quality table mismatch")

check([x["space"] for x in imperial["track"]] == [0,1,2,3,4,5], "Imperial track spaces mismatch")
check([x["title"] for x in imperial["track"]] == [
 "Local Workshop", "Local Renown", "Prefectural Recommendation",
 "Court Examination", "Awaiting Audience", "Imperial Audience"
], "Imperial track titles mismatch")
check([x["endGameVp"] for x in imperial["track"]] == [0,1,1,3,3,7], "Imperial track VP mismatch")
check("maxProgressPerRound" not in imperial, "Imperial progress must not have a per-round cap")
check(imperial["imperialSealVp"] == 3, "Imperial Seal must be worth 3 VP")
check(imperial["presentation"]["eligibleSpaces"] == [4,5], "Imperial Presentation eligibility must be spaces 4 and 5")
check(imperial["presentation"]["maxCeramics"] == 3, "Imperial Presentation must allow at most 3 ceramics")
check(imperial["presentation"]["qualityVp"] == {"standard":1,"fine":2,"masterpiece":4}, "Imperial Presentation Quality VP mismatch")
check(imperial["presentation"]["threeDifferentShapesBonus"] == 2, "Imperial Presentation shape-diversity bonus mismatch")
check(imperial["presentation"]["threeDifferentGlazesBonus"] == 2, "Imperial Presentation glaze-diversity bonus mismatch")
check(imperial["presentation"]["flawedEligible"] is False, "Flawed must not be presentable")
check(imperial["presentation"]["emptyPresentationPenalty"] == 0, "There must be no empty Presentation penalty")

component_map = {c["name"]:c["qty"] for c in components["components"]}
required_components = {
 "Central Action Board":1, "Shared Kiln Board":1, "Kiln Player Boards":5,
 "Shifu Workers":4, "Apprentice Workers":20, "Clay":40, "Wood":40, "Coins":50,
 "Vessel Cards":40, "Market Orders":20, "Imperial Orders":10, "Technique Tiles":12,
 "Fire Cards":20, "Wood Contribution Cards":16, "Imperial Progress Markers":4,
 "VP Markers / Score Pad":"4 or 1",
 "First Player Marker":1, "Round Marker":1, "Imperial Seal":1
}
for name, qty in required_components.items():
    check(component_map.get(name) == qty, f"Component checklist mismatch: {name}")

# Current visual directory is deliberately small and exact.
expected_assets = {
 "vessel_cards_page_1_bowl_plate.png",
 "vessel_cards_page_2_washer_vase.png",
 "vessel_cards_page_3_censer.png",
 "fire_cards_page_1.png",
 "fire_cards_page_2_remaining_plus1.png",
 "wood_contribution_cards_4_sets.png",
}
actual_assets = {p.name for p in (ROOT/"assets"/"current_v04").iterdir() if p.is_file()}
check(actual_assets == expected_assets, f"Canonical current asset directory mismatch: {actual_assets ^ expected_assets}")
obsolete_orders = {p.name for p in (ROOT/"assets"/"obsolete_v061").iterdir() if p.is_file()}
check(obsolete_orders == {"order_cards_page_1_M01-M16.png", "order_cards_page_2_M17-M20_I01-I10.png"}, "Obsolete V0.6.1 Order sheets must remain archived")

# No central board/player reference/player-board/technique raster should be in canonical current assets until regenerated.
for forbidden_piece in ["central","player_reference","player_board","technique"]:
    check(not any(forbidden_piece in n.lower() for n in actual_assets), f"Stale {forbidden_piece} raster found in current_v04")

check("Progress Reminder Tokens" not in component_map, "Progress Reminder Tokens must be removed")

if errors:
    print("V0.6.3 HANDOFF VALIDATION FAILED")
    for e in errors: print(" -", e)
    sys.exit(1)

print("V0.6.3 HANDOFF VALIDATION PASSED")
print("Rules/data: 2-4 players, 5 rounds, 6 locations, 1 Shifu + 3 starting Apprentices.")
print("Office: main action followed by optional Apprentice 0-1 / Shifu 0-2 Flawed sales.")
print("Decks: 20 Market Orders, 10 Imperial Orders, 12 Techniques, 20 Fire cards.")
print("Kiln: 8 spaces, contributor-scaled Base Heat, current Quality ladder.")
print("Decorations: Plain 1 Coin; Carved, Impressed and Crackle 2 Coins.")
print("Orders: named Glazes 4/4/4/4; Decorations Plain/Carved/Impressed/Crackle 3/3/4/3.")
print("Imperial: I01-I05 +1; I06-I10 +2; crossed unlocks at 2/4 and Seal at 5.")
print("Assets: six visually audited/current files remain; obsolete V0.6.1 Order sheets are archived.")
