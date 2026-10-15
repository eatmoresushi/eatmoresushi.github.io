import { defineNamespace } from "../defineNamespace.ts";

/**
 * `lobby` namespace: home, lobby, ended screen, end-session dialog. Owned by B1 (UI_V1.6.1_ARCHITECTURE §4.2).
 * Created empty by A3 in phase A; B1 adds its keys here and nowhere else.
 */
export const lobby = defineNamespace({
  en: {},
  zh: {},
});
