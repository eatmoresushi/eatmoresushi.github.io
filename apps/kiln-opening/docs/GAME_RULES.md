# GAME_RULES.md — V1.4 source index

- [V1.4 Player Rulebook](./KILN_OPENING_v1.4_EN_SOURCE.md) is the mechanical authority, based on the owner's replacement rulebook supplied on 2026-09-28, the confirmed Ge timing correction, the 2026-09-30 economy amendment and the 2026-10-02 Ding availability amendment. The audit records retained non-conflicting clarifications.
- [V1.4 audit](./RULEBOOK_AUDIT_V1.4.md) records source provenance, original and corrected checksums, approved clarifications and implementation validation.
- [V1.4 component text](./KILN_OPENING_v1.4_COMPONENT_TEXT_SOURCE.md) records the owner-approved Tech and Kiln tile reminders; click-through details retain complete structured rules.
- `data/*.json` derives current component definitions, costs, reminders and localized rules text from V1.4.
- [Implementation decisions](./IMPLEMENTATION_DECISIONS.md) and [Online specification](./ONLINE_GAME_SPEC.md) document digital behavior without changing the board-game rules.
- The archived [V1.2.6 Chinese source](./KILN_OPENING_v1.2.6_ZH_SOURCE.md) supplies established terminology only. Changed Chinese gameplay text is translated from V1.4 English.

V1.4 supersedes earlier sources and owner amendments. V1.2.7 rulebooks, Tech/Kiln copy and audits remain historical records. Visual references remain restricted to `assets/current_v04/`; obsolete rules text must be rendered from current structured data.

The 2026-09-28 owner amendment makes Imperial Court cost 5 Coins and changes Ge Crackle to one virtual Glaze per ceramic for Order requirements. Actual Glaze and Decoration remain unchanged; Crackle does not substitute Decoration.

The replacement rulebook broadens Measuring Calipers to any other workshop vessel and replaces Standardised Moulds with Dipping Vats: once per round, waive Glazing costs for all Plain ceramics loaded by one Kiln Yard action into either kiln. Rapid Drying and Imperial Priority are excluded. Ge remains in the owner-chosen after-Quality order.

The 2026-09-30 owner economy amendment sets starting Coins to 3, reduces all 28 crownless Commercial Main Order Coin rewards by 1, and sets all Starting Order Coin rewards to 3. Kiln Tending is removed: Prepared Clay, White Slip and Rapid Drying are the only Starting Tech choices. Crown Order rewards, Order requirements and Shifu discounts are unchanged.

The 2026-10-02 owner amendment disables Ding Kiln for new online games. Ru, Guan, Ge and Jun are the four selectable Kilns; 2–4-player support and reverse-order selection remain unchanged. Ding’s stable `DI` definition and ability remain historical content.
