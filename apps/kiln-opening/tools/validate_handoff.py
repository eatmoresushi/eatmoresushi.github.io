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
    check(versioned["rulesVersion"] == "1.0.2", "Rules version must be 1.0.2")
check(cfg["players"] == {"min":2,"max":4}, "Player count must be 2-4")
check(cfg["rounds"] == 5, "Game must be 5 rounds")
check(cfg["startingResources"] == {"clay":2,"wood":2,"coins":3}, "Starting resources mismatch")
check(cfg["workers"]["shifu"] == 1, "Each player needs 1 Shifu")
check(cfg["workers"]["apprenticesTotal"] == 5, "Each player needs 5 Apprentices")
check(cfg["workers"]["apprenticesStarting"] == 3, "3 Apprentices must start available")
check(cfg["workers"]["apprenticeUnlockProgress"] == [1,3], "Apprentice unlock spaces must be 1 and 3")
check(cfg["orderDisplay"]["market"] == 4 and cfg["orderDisplay"]["imperial"] == 4, "Both Order displays must contain 4 cards")

expected_caps = {
 "materials_yard":{"2":2,"3":3,"4":4},
 "forming_studio":{"2":2,"3":3,"4":4},
 "glaze_workshop":{"2":2,"3":3,"4":4},
 "kiln_yard":{"2":3,"3":4,"4":5},
 "market_imperial_office":{"2":2,"3":3,"4":4},
 "guild_academy":{"2":1,"3":2,"4":3},
}
locs = {x["id"]:x for x in actions["locations"]}
check(set(locs) == set(expected_caps), "Must have exactly the six V1.0.2 action locations")
for k,v in expected_caps.items():
    check(locs.get(k,{}).get("capacity") == v, f"Capacity mismatch for {k}")
check("reposition" not in locs["kiln_yard"]["shifu"].lower(), "Shifu Kiln action must not reposition")
check("wood" not in locs["kiln_yard"]["apprentice"].lower(), "Kiln Yard Apprentice must not gain Wood")
check("wood" not in locs["kiln_yard"]["shifu"].lower(), "Kiln Yard Shifu must not gain Wood")
check(locs["materials_yard"]["apprentice"] == "Gain 3 resources in any combination of Clay and Wood.", "Materials Apprentice amount mismatch")
check(locs["materials_yard"]["shifu"] == "Gain 4 resources in any combination of Clay and Wood.", "Materials Shifu amount mismatch")
office = locs["market_imperial_office"]
check("blind-top" in office.get("apprentice", ""), "Office Apprentice must allow a blind top-deck Order")
check("blind-top" in office.get("shifu", "") and "Court Patronage" in office.get("shifu", ""), "Office Shifu blind draw or Patronage mismatch")
check("apprenticeOptions" not in office and "shifuOptions" not in office, "Office sale must not remain a standalone action option")
check("printed Coin cost" in locs["guild_academy"].get("apprentice", ""), "Guild Apprentice must pay printed cost")
check("1 Coin less" in locs["guild_academy"]["shifu"], "Guild Shifu must receive the exact discount")
check(cfg["decorations"] == {"plain":1,"carved":2,"impressed":2,"crackle":2}, "V1.0.2 Decoration costs mismatch")

check(len(orders["market"]) == 23, "Expected 23 Market Orders")
check(len(orders["imperial"]) == 13, "Expected 13 Imperial Orders")
check([x["id"] for x in orders["market"]] == [f"M{i:02d}" for i in range(1,24)], "Market Order IDs mismatch")
check([x["id"] for x in orders["imperial"]] == [f"I{i:02d}" for i in range(1,14)], "Imperial Order IDs mismatch")
check(all("name" not in order and "title" not in order for order in orders["market"] + orders["imperial"]), "Orders must remain ID-only")

# Key high-risk Order values
key_orders = {x["id"]:x for x in orders["market"] + orders["imperial"]}
for oid, vp, coins in [
    ("M15",7,5),("M16",8,5),("M17",9,5),("M18",10,4),("M19",11,6),("M20",10,5),
    ("I06",11,0),("I07",12,0),("I08",14,0),("I09",13,0),("I10",15,0)
    ,("M21",5,5),("M22",8,4),("M23",13,5),("I11",8,0),("I12",11,0),("I13",14,0)
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
    "I11":1, "I12":2, "I13":2,
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

check(len(techs) == 15, "Expected 15 Techniques")
check(sum(1 for t in techs if t["discipline"]=="forming") == 5, "Expected 5 Forming Techniques")
check(sum(1 for t in techs if t["discipline"]=="glazing") == 5, "Expected 5 Glazing Techniques")
check(sum(1 for t in techs if t["discipline"]=="firing") == 5, "Expected 5 Firing Techniques")
check({t["name"] for t in techs} == {
 "Large Throwing Wheel","Measuring Calipers","Clay Substitution","Drying Frames",
 "Kiln Records","Carving Knives","Seal Stamps","Colour Samples","Connoisseur Network",
 "Second Firing","Kiln Setting","Protective Saggars","Fuel Ledger","Test Pieces","Sagger Selection"
}, "Technique names mismatch")
expected_technique_costs = {
 "T01":2, "T02":2, "T03":2, "T04":2,
 "T05":2, "T06":2, "T08":2,
 "T09":3, "T10":3, "T11":3, "T12":2,
 "T13":3, "T14":3, "T15":3, "T16":3,
}
check({t["id"]:t["cost"] for t in techs} == expected_technique_costs, "V1.0.2 Technique costs mismatch")
colour_samples = next(t for t in techs if t["id"] == "T08")
check("before choosing your first Order" in colour_samples["ability"] and "either display" in colour_samples["ability"] and "bottom" in colour_samples["ability"], "T08 Colour Samples timing or target mismatch")
connoisseur = next(t for t in techs if t["id"] == "T14")
check(connoisseur["cost"] == 3 and "5 Coins" in connoisseur["ability"] and "Court Patronage" in connoisseur["ability"], "T14 Connoisseur Network mismatch")

check(len(kilns) == 5, "Expected 5 Kilns")
check({k["id"] for k in kilns} == {"RU","GU","GE","DI","JU"}, "Kiln IDs mismatch")
ge = next(k for k in kilns if k["id"] == "GE")
check(
    "without paying the Crackle Decoration cost" in ge["ability"]
    and "or refunding its original Decoration cost" in ge["ability"],
    "Ge must waive Crackle cost without a refund",
)
ru = next(k for k in kilns if k["id"] == "RU")
jun = next(k for k in kilns if k["id"] == "JU")
check("gain 3 VP" in ru["ability"], "Ru must award 3 VP")
check("pay 2 Coins" in jun["ability"] and "+1 or -1" in jun["ability"], "Jun must cost 2 Coins and remain exactly +/-1")

check(len(firing["kilnSpaces"]) == 8, "Shared Kiln must have 8 spaces")
check(sum(1 for s in firing["kilnSpaces"] if s["zone"]=="high") == 2, "High zone must have 2 spaces")
check(sum(1 for s in firing["kilnSpaces"] if s["zone"]=="middle") == 3, "Middle zone must have 3 spaces")
check(sum(1 for s in firing["kilnSpaces"] if s["zone"]=="low") == 3, "Low zone must have 3 spaces")
expected_fire_distribution = {-2:5, -1:3, 0:4, 1:3, 2:5}
check(Counter(firing["fireDeck"]) == expected_fire_distribution, "Fire distribution mismatch")
check(cfg["fireDeck"] == {str(value): count for value, count in expected_fire_distribution.items()}, "Game config Fire distribution mismatch")
check(sum(firing["fireDeck"]) == 0, "Fire distribution must remain symmetric around 0")
check(firing["qualityByDifference"] == {"0":"masterpiece","1":"fine","2":"standard","3+":"flawed"}, "Quality table mismatch")
check(cfg["kiln"]["activeSpacesByPlayerCount"] == {
 "2":["high_1","high_2","middle_1","middle_2","low_1","low_2"],
 "3":["high_1","high_2","middle_1","middle_2","middle_3","low_1","low_2"],
 "4":["high_1","high_2","middle_1","middle_2","middle_3","low_1","low_2","low_3"],
}, "Player-scaled kiln spaces mismatch")

check([x["space"] for x in imperial["track"]] == [0,1,2,3,4,5], "Imperial track spaces mismatch")
check([x["title"] for x in imperial["track"]] == [
 "Local Workshop", "Local Renown", "Prefectural Recommendation",
 "Court Examination", "Awaiting Audience", "Imperial Audience"
], "Imperial track titles mismatch")
check([x["endGameVp"] for x in imperial["track"]] == [0,0,2,2,4,8], "Imperial track VP mismatch")
check("maxProgressPerRound" not in imperial, "Imperial progress must not have a per-round cap")
check(imperial["imperialSealVp"] == 2, "Imperial Seal must be worth 2 VP")
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
 "Vessel Cards":40, "Market Orders":23, "Imperial Orders":13, "Technique Tiles":15,
 "Fire Cards":20, "Wood Contribution Cards":16, "Imperial Progress Markers":4,
 "VP Markers / Score Pad":"4 or 1",
 "First Player Marker":1, "Round Marker":1, "Imperial Seal":1
}
for name, qty in required_components.items():
    check(component_map.get(name) == qty, f"Component checklist mismatch: {name}")

check(asset_specs["orderCards"]["total"] == 36, "Asset spec must require 36 Order cards")
check(asset_specs["craftTechniques"]["total"] == 15, "Asset spec must require 15 Technique tiles")
check(asset_specs["fireCards"]["distribution"] == cfg["fireDeck"] and asset_specs["fireCards"]["totalCards"] == 20, "Asset spec Fire deck mismatch")
check(asset_specs["centralBoard"].get("mustShowPlayerCountKilnCovers") is True, "Asset spec must show player-count kiln covers")

# Runtime artwork is presentation-only; rules-bearing corrections are live HTML/CSS.
expected_assets = {
 "central-table.webp", "player-boards.webp", "market-orders.webp", "imperial-orders.webp",
 "techniques.webp", "vessels.webp", "tokens.webp", "firing-cards.webp",
}
asset_dir = ROOT/"public"/"assets"/"tabletop"
actual_assets = {p.name for p in asset_dir.iterdir() if p.is_file()} if asset_dir.exists() else set()
check(actual_assets == expected_assets, f"Runtime tabletop asset directory mismatch: {actual_assets ^ expected_assets}")

check("Progress Reminder Tokens" not in component_map, "Progress Reminder Tokens must be removed")

if errors:
    print("V1.0.2 HANDOFF VALIDATION FAILED")
    for e in errors: print(" -", e)
    sys.exit(1)

print("V1.0.2 HANDOFF VALIDATION PASSED")
print("Rules/data: 2-4 players, 5 rounds, 6 locations, 1 Shifu + 3 starting Apprentices.")
print("Office: face-up/blind Orders, pre-pick Colour Samples, and gated Shifu Court Patronage.")
print("Academy: both workers; Shifu optional refresh and -1 Coin; capacity 1/2/3.")
print("Decks: 23 Market Orders, 13 Imperial Orders, 15 Techniques, Fire -2/-1/0/+1/+2 = 5/3/4/3/5.")
print("Kiln: 6/7/8 active spaces, contributor-scaled Base Heat, current Quality ladder.")
print("Decorations: Plain 1 Coin; Carved, Impressed and Crackle 2 Coins.")
print("Orders: named Glazes 4/4/4/4; Decorations Plain/Carved/Impressed/Crackle 3/3/4/3.")
print("Imperial: 4-card displays; I01-I05/I11 +1; I06-I10/I12-I13 +2; crossed unlocks at 1/3 and 2-VP Seal at 5.")
print("V1.0.2: Ru +3 VP; Jun costs 2 Coins; Connoisseur Network gains 5 Coins and 0 VP.")
print("Assets: eight runtime tabletop atlases are present; live overlays carry V1.0.2 rule corrections.")
