/**
 * Generated feature items for Argon Combat HUD (and any other UI that lists
 * standard dnd5e items).
 *
 * Each Witch-Blade mechanic becomes an ordinary dnd5e `feat` item with one
 * `utility` activity whose activation type Argon uses to sort it:
 *   action → Actions, bonus → Bonus Actions, reaction → Reactions,
 *   special → Free Actions (dnd5e has no "free" activation type).
 *
 * Standard schema only: everything module-specific lives in flags.
 *   flags.witch-blade.ability   "bloodSurge" | "endTurnSave" | "technique"
 *   flags.witch-blade.technique technique id (for techniques)
 *
 * When any UI uses one of these items (Argon, the sheet, the hotbar), dnd5e
 * fires dnd5e.preUseActivity; the hook below runs the Witch-Blade logic and
 * cancels the default chat card. No other module is required.
 */

import { TECHNIQUES, ACTION_LABELS } from "./data.js";
import {
  MODULE_ID, SURGE_ICON, t, wbLevel, wbSubclass, availableTechniques,
  toggleBloodSurge, endOfTurnSave, useTechnique
} from "./mechanics.js";

const ACTIVATION = { action: "action", bonus: "bonus", reaction: "reaction", free: "special" };

const TECH_ICONS = {
  action: "icons/skills/melee/strike-sword-blood-red.webp",
  bonus: "icons/skills/movement/figure-running-gray.webp",
  reaction: "icons/skills/melee/shield-block-gray-orange.webp",
  free: "icons/magic/control/fear-fright-monster-grin-red-orange.webp"
};

/* -------------------------------------------- */
/*  Item definitions                            */
/* -------------------------------------------- */

function itemData({ key, name, img, activation, description, requirements, uses, technique }) {
  const activityId = "wbActivity000000"; // 16 chars, stable so updates can target it
  return {
    name,
    type: "feat",
    img,
    system: {
      description: { value: description, chat: "" },
      type: { value: "class", subtype: "" },
      identifier: `wb-${technique ?? key}`,
      requirements,
      ...(uses ? { uses } : {}),
      activities: {
        [activityId]: {
          _id: activityId,
          type: "utility",
          activation: { type: activation, value: 1, condition: "", override: false },
          range: { units: "self", special: "", override: false },
          target: { affects: { type: "self", count: "", choice: false, special: "" }, override: false }
        }
      }
    },
    flags: {
      [MODULE_ID]: { ability: key, ...(technique ? { technique } : {}), version: moduleVersion() }
    }
  };
}

function moduleVersion() {
  return game.modules.get(MODULE_ID)?.version ?? "0";
}

function desiredItems(actor) {
  const items = [
    itemData({
      key: "bloodSurge",
      name: t("BloodSurge"),
      img: SURGE_ICON,
      activation: "bonus",
      requirements: "Witch-Blade 2",
      uses: { max: "@prof", spent: 0, recovery: [{ period: "sr", type: "recoverAll" }] },
      description: `<p>${t("Item.BloodSurge")}</p>`
    }),
    itemData({
      key: "endTurnSave",
      name: t("EndTurnSave"),
      img: "icons/magic/control/silhouette-hold-change-blue.webp",
      activation: "special",
      requirements: "Witch-Blade 2",
      description: `<p>${t("Item.EndTurnSave")}</p>`
    })
  ];

  if (game.settings.get(MODULE_ID, "techniqueItems")) {
    for (const tech of availableTechniques(actor, { includeAdvanced: false })) {
      items.push(itemData({
        key: "technique",
        technique: tech.id,
        name: tech.name,
        img: TECH_ICONS[tech.action],
        activation: ACTIVATION[tech.action],
        requirements: `Surge Technique · ${tech.req}+ FP${tech.tier === "advanced" ? " · Level 11" : ""}`,
        description: `<p><strong>${ACTION_LABELS[tech.action]} · ${tech.req}+ FP · FP ${tech.fp.map(o => (o.d > 0 ? "+" : "") + o.d).join(" / ")}</strong></p><p>${tech.text}</p>`
      }));
    }
  }
  return items;
}

const itemKey = data => {
  const f = data.flags?.[MODULE_ID] ?? {};
  return f.ability === "technique" ? `technique:${f.technique}` : f.ability;
};
const docKey = item => {
  const ability = item.getFlag(MODULE_ID, "ability");
  return ability === "technique" ? `technique:${item.getFlag(MODULE_ID, "technique")}` : ability;
};

/* -------------------------------------------- */
/*  Sync                                        */
/* -------------------------------------------- */

/** An actor counts as a Witch-Blade if it has the class item or uses the Witch-Blade sheet. */
export function isWitchBlade(actor) {
  if (actor?.type !== "character") return false;
  if (actor.classes?.[MODULE_ID]) return true;
  return actor.getFlag("core", "sheetClass") === `${MODULE_ID}.WitchBladeSheet`;
}

const syncing = new Set();

/**
 * Create missing ability items, refresh ones from an older module version,
 * and remove technique items the actor no longer qualifies for.
 * Only touches items this module generated.
 */
export async function syncAbilityItems(actor, { force = false } = {}) {
  if (!actor?.isOwner || !isWitchBlade(actor) || syncing.has(actor.id)) return;
  syncing.add(actor.id);
  try {
    const desired = desiredItems(actor);
    const desiredByKey = new Map(desired.map(d => [itemKey(d), d]));
    const owned = actor.items.filter(i => i.getFlag(MODULE_ID, "ability"));
    const ownedKeys = new Set(owned.map(docKey));

    const toCreate = desired.filter(d => !ownedKeys.has(itemKey(d)));
    const toDelete = owned.filter(i => !desiredByKey.has(docKey(i))).map(i => i.id);
    const version = moduleVersion();
    const toUpdate = owned
      .filter(i => desiredByKey.has(docKey(i)) && (force || i.getFlag(MODULE_ID, "version") !== version))
      .map(i => {
        const d = desiredByKey.get(docKey(i));
        const [activityId, activity] = Object.entries(d.system.activities)[0];
        const existingActivity = i.system.activities?.get?.(activityId);
        const update = {
          _id: i.id,
          "system.description.value": d.system.description.value,
          "system.requirements": d.system.requirements,
          [`flags.${MODULE_ID}.version`]: version
        };
        if (existingActivity) update[`system.activities.${activityId}.activation.type`] = activity.activation.type;
        return update;
      });

    if (toDelete.length) await actor.deleteEmbeddedDocuments("Item", toDelete);
    if (toCreate.length) await actor.createEmbeddedDocuments("Item", toCreate);
    if (toUpdate.length) await actor.updateEmbeddedDocuments("Item", toUpdate);
    return { created: toCreate.length, updated: toUpdate.length, deleted: toDelete.length };
  } finally {
    syncing.delete(actor.id);
  }
}

/* -------------------------------------------- */
/*  Running an ability                          */
/* -------------------------------------------- */

/** Dispatch a generated item to its mechanic. */
export async function runAbility(item, actor = item?.actor) {
  if (!item || !actor) return;
  switch (item.getFlag(MODULE_ID, "ability")) {
    case "bloodSurge": return toggleBloodSurge(actor);
    case "endTurnSave": return endOfTurnSave(actor);
    case "technique": return useTechnique(actor, item.getFlag(MODULE_ID, "technique"));
  }
}

export function registerAbilityHooks() {
  // Executor: whichever UI uses the item (Argon, sheet, hotbar), run the Witch-Blade logic.
  Hooks.on("dnd5e.preUseActivity", activity => {
    const item = activity?.item;
    if (!item?.getFlag(MODULE_ID, "ability")) return;
    runAbility(item, item.actor);
    return false; // stop the default card; the module posts its own
  });

  // Keep items in step with class/subclass changes, made by this user.
  const onItemChange = (item, _opts, userId) => {
    if (userId !== game.user.id || !item.parent) return;
    if (["class", "subclass"].includes(item.type)) syncAbilityItems(item.parent);
  };
  Hooks.on("createItem", (item, opts, userId) => onItemChange(item, opts, userId));
  Hooks.on("deleteItem", (item, opts, userId) => onItemChange(item, opts, userId));
  Hooks.on("updateItem", (item, changes, opts, userId) => {
    if (item.type === "class" && foundry.utils.hasProperty(changes, "system.levels")) onItemChange(item, opts, userId);
  });

  Hooks.on("updateActor", (actor, changes, _opts, userId) => {
    if (userId !== game.user.id) return;
    const subChanged = foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.subclass`);
    const sheetChanged = foundry.utils.hasProperty(changes, "flags.core.sheetClass");
    if (subChanged || sheetChanged) syncAbilityItems(actor);
  });

  Hooks.on("createActor", (actor, _opts, userId) => {
    if (userId === game.user.id) syncAbilityItems(actor);
  });
}
