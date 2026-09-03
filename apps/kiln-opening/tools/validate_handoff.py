from collections import Counter
import json
from pathlib import Path
import sys


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
RULES_VERSION = "1.2.4"
errors: list[str] = []


def load(name: str):
    return json.loads((DATA / name).read_text(encoding="utf-8"))


def check(condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)


config = load("game_config.json")
actions = load("action_locations.json")
assets = load("asset_specs.json")
components = load("components.json")
firing = load("firing.json")
recognition = load("imperial_progress.json")
kilns = load("kilns.json")
orders = load("orders.json")
rounds = load("round_structure.json")
techniques = load("techniques.json")

for name, document in {
    "game config": config,
    "action locations": actions,
    "asset specs": assets,
    "components": components,
    "firing": firing,
    "Imperial Recognition": recognition,
    "orders": orders,
    "round structure": rounds,
    "techniques": techniques,
}.items():
    check(document.get("rulesVersion") == RULES_VERSION, f"{name} must use V{RULES_VERSION}")

check(config["players"] == {"min": 2, "max": 4}, "Player count must be 2-4")
check(config["rounds"] == 5, "Game must last 5 rounds")
check(config["startingResources"] == {"clay": 2, "wood": 2, "coins": 3}, "Starting resources mismatch")
check(config["workers"] == {"shifu": 1, "apprenticesTotal": 3, "apprenticesStarting": 3}, "Every player must start with 1 Shifu and 3 Apprentices")
check(config["orderDisplay"] == {"market": 5, "baseHandLimit": 3}, "Main Order display or hand limit mismatch")
check(config["techniques"] == {"maxOwned": 2, "faceUpPerDiscipline": 2}, "Advanced Tech limits mismatch")
check(config["coinEndGame"] == {"coinsPerVp": 3, "maxVp": 5}, "Coin scoring mismatch")

expected_locations = {
    "materials_yard": ({"2": 2, "3": 3, "4": 4}, None),
    "forming_studio": ({"2": 2, "3": 2, "4": 2}, "private"),
    "glaze_workshop": ({"2": 2, "3": 2, "4": 2}, "private"),
    "kiln_yard": ({"2": None, "3": None, "4": None}, "uncapped"),
    "market_imperial_office": ({"2": 2, "3": 3, "4": 4}, None),
    "guild_academy": ({"2": 2, "3": 3, "4": 4}, None),
    "labour": ({"2": None, "3": None, "4": None}, "uncapped"),
}
locations = {location["id"]: location for location in actions["locations"]}
check(set(locations) == set(expected_locations), "Expected exactly the seven V1.2.4 action locations")
for location_id, (capacity, scope) in expected_locations.items():
    location = locations.get(location_id, {})
    check(location.get("capacity") == capacity, f"{location_id} capacity mismatch")
    if scope is not None:
        check(location.get("scope") == scope, f"{location_id} scope mismatch")
    check(bool(location.get("nameZh")) and bool(location.get("apprenticeZh")) and bool(location.get("shifuZh")), f"{location_id} needs Chinese text")

check(len(orders["starting"]) == 16, "Expected 16 Starting Orders")
check(len(orders["main"]) == 48, "Expected 48 Main Orders")
check([order["id"] for order in orders["starting"]] == [f"S{number:02d}" for number in range(1, 17)], "Starting Order IDs mismatch")
check([order["id"] for order in orders["main"]] == [f"O{number:02d}" for number in range(1, 49)], "Main Order IDs mismatch")
all_orders = orders["starting"] + orders["main"]
check(all(order.get("requirements") and order.get("requirementsZh") for order in all_orders), "Every Order needs English and Chinese Requirements text")
check(all(order["crowns"] == 0 for order in orders["starting"]), "Starting Orders cannot have Crowns")
check(sum(order["crowns"] for order in orders["main"]) == 30, "Main Order deck must contain 30 Crown icons")
check(sum(order["crowns"] > 0 for order in orders["main"]) == 20, "Exactly 20 Main Orders must show Crowns")

check([tech["id"] for tech in techniques["starting"]] == ["ST01", "ST02", "ST03", "ST04"], "Starting Tech IDs mismatch")
check([tech["id"] for tech in techniques["advanced"]] == [f"T{number:02d}" for number in range(1, 16)], "Advanced Tech IDs mismatch")
check(Counter(tech["discipline"] for tech in techniques["advanced"]) == {"forming": 5, "glazing": 5, "firing": 5}, "Expected five Advanced Techs per discipline")
expected_tech_costs = {
    "T01": 2, "T02": 2, "T03": 2, "T04": 3, "T05": 2,
    "T06": 2, "T07": 2, "T08": 2, "T09": 2, "T10": 2,
    "T11": 2, "T12": 3, "T13": 3, "T14": 3, "T15": 3,
}
check({tech["id"]: tech["cost"] for tech in techniques["advanced"]} == expected_tech_costs, "Advanced Tech costs mismatch")
check(all(tech.get("name") and tech.get("nameZh") and tech.get("ability") and tech.get("abilityZh") for tech in techniques["starting"] + techniques["advanced"]), "Every Tech needs bilingual text")
tech_by_id = {tech["id"]: tech for tech in techniques["advanced"]}
check("top 3 Main Orders" in tech_by_id["T10"]["ability"], "Colour Samples must inspect three Main Orders")
check("secretly commit 1 additional Wood" in tech_by_id["T12"]["ability"] and "\u22122 or +2" in tech_by_id["T12"]["ability"], "Fuel Ledger text mismatch")
check("same Base Heat and kiln position" in tech_by_id["T14"]["ability"], "Second Firing recalculation mismatch")

expected_fire = {-2: 1, -1: 3, 0: 4, 1: 3, 2: 1}
check(Counter(firing["fireDeck"]) == expected_fire, "Fire deck distribution mismatch")
check(config["fireDeck"] == {str(modifier): count for modifier, count in expected_fire.items()}, "Game config Fire deck mismatch")
check(len(firing["kilnSpaces"]) == 7, "Shared Kiln must contain seven spaces")
check(Counter(space["zone"] for space in firing["kilnSpaces"]) == {"high": 3, "middle": 2, "low": 2}, "Shared Kiln zone counts mismatch")
check(firing["baseHeatRule"]["formula"] == "clamp(2 + sum(revealed heat adjustments), 0, 5)", "Base Heat formula mismatch")
check(firing["qualityByDifference"] == {"0": "masterpiece", "1": "fine", "2": "standard", "3+": "flawed"}, "Quality ladder mismatch")
check([(card["id"], card["woodCost"], card["heatAdjustment"]) for card in firing["contributionCards"]] == [("BANK", 1, -1), ("TEND", 0, 0), ("STOKE", 1, 1)], "Contribution cards mismatch")

check([kiln["id"] for kiln in kilns] == ["RU", "GU", "GE", "DI", "JU"], "Kiln IDs mismatch")
check(all(kiln.get("nameZh") and kiln.get("abilityNameZh") and kiln.get("abilityZh") for kiln in kilns), "Every Kiln needs bilingual text")
kiln_by_id = {kiln["id"]: kiln for kiln in kilns}
check("gain 4 VP" in kiln_by_id["RU"]["ability"], "Ru must award 4 VP")
check("2 Coins and 1 VP" in kiln_by_id["GU"]["ability"], "Guan must pay 2 Coins and 1 VP under V1.2.4")
check("waive" not in kiln_by_id["GU"]["ability"].lower() and "ignore" not in kiln_by_id["GU"]["ability"].lower(), "V1.2.4 Guan waives no Decoration requirement")
check("at no Clay cost" in kiln_by_id["DI"]["ability"], "Ding's additional vessel must be free under V1.2.4")
check("pay 1 Wood" in kiln_by_id["JU"]["ability"], "Jun must cost 1 Wood under V1.2.4")

track = recognition["track"]
check([space["space"] for space in track] == [0, 1, 2, 3, 4, 5], "Recognition spaces mismatch")
check([space["title"] for space in track] == ["Local Workshop", "Local Renown", "Imperial Grant", "Imperial Gift", "Imperial Priority", "Imperial Audience"], "Recognition titles mismatch")
check(track[3]["reward"] == "Gain your Imperial Kiln tile.", "Imperial Gift must grant the Imperial Kiln tile")
check("during a Kiln Yard action" in track[4]["reward"] and "1 additional ceramic" in track[4]["reward"], "Imperial Priority effect mismatch")
check(track[5]["reward"] == "Gain 6 VP.", "Imperial Audience must award 6 VP")
check(recognition["exhibition"]["capacityByProgress"] == [5, 5, 5, 5, 5, 5], "Exhibition capacity mismatch")
check(recognition["exhibition"]["qualityVp"] == {"standard": 2, "fine": 3, "masterpiece": 5}, "Exhibition VP mismatch")

component_counts = {component["name"]: component["qty"] for component in components["components"]}
check(component_counts.get("Main Order Cards") == 48 and component_counts.get("Starting Order Cards") == 16, "Order component counts mismatch")
check(component_counts.get("Starting Tech Tiles") == 16 and component_counts.get("Advanced Tech Tiles") == 15, "Tech component counts mismatch")
check(component_counts.get("Fire Cards") == 12 and component_counts.get("Imperial Priority Tokens") == 4, "Fire/Priority component counts mismatch")
check(rounds["roundCount"] == 5, "Round structure must contain five rounds")
check("discard the three leftmost" in rounds["phases"][0]["summary"] and "refill the display to five" in rounds["phases"][0]["summary"], "Round-start five-card market rotation mismatch")
check(assets["orderCards"].get("total") == 64 and assets["orderCards"].get("main") == 48 and assets["orderCards"].get("starting") == 16, "Order asset counts mismatch")
check(assets["playerReference"].get("mustShowFiveCardMainOrderDisplay") is True, "Reference asset must show a five-card Main Order display")

adopted_rules = (ROOT / "docs" / "KILN_OPENING_v1.2.4_SOURCE.md").read_text(encoding="utf-8")
for required in (
    "reveal **5 face-up Main Orders**",
    "Discard the **3 leftmost face-up Main Orders**",
    "Imperial Gift",
    "**4 — Imperial Priority:**",
    "same Base Heat and kiln position",
    # V1.2.4-specific rules that must survive any future edit of the adopted source.
    "gain **2 Coins and 1 VP**",
    "at no Clay cost",
    "look at the top 2 Techs of that deck",
    "At the end of the Work Phase, before any Firing Phase abilities are resolved",
    "reserve the **top card of the Main Order deck without looking at it first**",
    "+3 VP if the 3 have **3 different Shapes**",
    "**1 VP per 3 Coins remaining**",
):
    check(required in adopted_rules, f"Adopted rulebook is missing: {required}")

if errors:
    print("V1.2.4 HANDOFF VALIDATION FAILED")
    for item in errors:
        print(f"- {item}")
    sys.exit(1)

print("V1.2.4 HANDOFF VALIDATION PASSED")
print("Rules/data: 2-4 players, 5 rounds, 1 Shifu + 3 Apprentices, seven current locations.")
print("Orders: 16 Starting + 48 Main; five-card market rotates its three leftmost cards.")
print("Tech: 4 Starting + 15 Advanced; Fuel Ledger and Second Firing match owner rulings.")
print("Firing: Bank/Tend/Stoke, 12-card Fire deck, seven Shared Kiln spaces, current Quality ladder.")
print("Recognition: Imperial Gift at 3, Imperial Priority at 4, Imperial Audience at 5.")
print("Localization: every current Order, Tech, Kiln and action location includes Chinese text.")
