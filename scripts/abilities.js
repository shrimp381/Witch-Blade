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

import { ACTION_LABELS, ICONS } from "./data.js";
import {
  MODULE_ID, t, tf, availableTechniques, wbLevel, getFp, setFp, chat, isResponsibleUser,
  toggleBloodSurge, endOfTurnSave, useTechnique, capSave
} from "./mechanics.js";

const TIDY_ID = "tidy5e-sheet";

const ACTIVATION = { action: "action", bonus: "bonus", reaction: "reaction", free: "special" };


/* -------------------------------------------- */
/*  Item definitions                            */
/* -------------------------------------------- */

function itemData({ key, name, img, activation, description, requirements, uses, technique }) {
  // Surge techniques get their own section in Tidy 5e's Features and Actions tabs.
  const tidy = technique ? { [TIDY_ID]: { section: t("Techniques"), actionSection: t("Techniques") } } : {};
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
      [MODULE_ID]: { ability: key, ...(technique ? { technique } : {}), generated: true, version: moduleVersion() },
      ...tidy
    }
  };
}

function moduleVersion() {
  return game.modules.get(MODULE_ID)?.version ?? "0";
}

/**
 * Items the module should generate for this actor.
 * Blood Surge and the two saves come from the Witch-Blade class's level-2 advancement when the
 * actor has the class item, so they are only generated for actors without it (sidebar toggle),
 * and only from level 2. Surge techniques are always generated (no class grants them).
 */
function desiredItems(actor) {
  const level = wbLevel(actor);
  const hasClass = !!actor.classes?.[MODULE_ID];
  const items = hasClass || level < 2 ? [] : [
    itemData({
      key: "bloodSurge",
      name: t("BloodSurge"),
      img: ICONS.bloodSurge,
      activation: "bonus",
      requirements: "Witch-Blade 2",
      uses: { max: "@prof", spent: 0, recovery: [{ period: "sr", type: "recoverAll" }] },
      description: `<p>${t("Item.BloodSurge")}</p>`
    }),
    itemData({
      key: "endTurnSave",
      name: t("EndTurnSave"),
      img: ICONS.endTurnSave,
      activation: "special",
      requirements: "Witch-Blade 2",
      description: `<p>${t("Item.EndTurnSave")}</p>`
    }),
    itemData({
      key: "capSave",
      name: t("CapSave"),
      img: ICONS.capSave,
      activation: "special",
      requirements: "Witch-Blade 1",
      description: `<p>${t("Item.CapSave")}</p>`
    })
  ];

  if (level >= 2 && game.settings.get(MODULE_ID, "techniqueItems")) {
    for (const tech of availableTechniques(actor, { respectLevel: true })) {
      items.push(itemData({
        key: "technique",
        technique: tech.id,
        name: tech.name,
        img: tech.img,
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

/**
 * An actor counts as a Witch-Blade if it has a class with identifier "witch-blade",
 * uses the Witch-Blade sheet, or was switched on from the Actors sidebar.
 */
export function isWitchBlade(actor) {
  if (actor?.type !== "character") return false;
  if (actor.classes?.[MODULE_ID]) return true;
  if (actor.getFlag(MODULE_ID, "enabled")) return true;
  return actor.getFlag("core", "sheetClass") === `${MODULE_ID}.WitchBladeSheet`;
}

const syncing = new Set();

/** True for items this module generated (as opposed to ones granted by the class compendium). */
function isGenerated(item) {
  return item.getFlag(MODULE_ID, "generated") === true
    || String(item.system?.identifier ?? "").startsWith("wb-");  // generated before 0.2.2
}

/**
 * Create missing ability items, refresh generated ones from an older module version,
 * remove generated items the actor no longer qualifies for, and remove generated
 * duplicates of anything the class advancement granted.
 * Items granted by the class compendium are never modified or deleted here.
 */
export async function syncAbilityItems(actor, { force = false } = {}) {
  if (!actor?.isOwner || !isWitchBlade(actor) || syncing.has(actor.id)) return;
  syncing.add(actor.id);
  try {
    const desired = desiredItems(actor);
    const desiredByKey = new Map(desired.map(d => [itemKey(d), d]));
    const owned = actor.items.filter(i => i.getFlag(MODULE_ID, "ability"));
    const granted = owned.filter(i => !isGenerated(i));
    const generated = owned.filter(isGenerated);
    const grantedKeys = new Set(granted.map(docKey));

    // Generated items to remove: duplicates of granted ones, duplicates of each other, or no longer wanted.
    const toDelete = [];
    const keptGenerated = new Map();
    for (const item of generated) {
      const key = docKey(item);
      if (grantedKeys.has(key) || keptGenerated.has(key) || !desiredByKey.has(key)) toDelete.push(item.id);
      else keptGenerated.set(key, item);
    }

    const toCreate = desired.filter(d => !grantedKeys.has(itemKey(d)) && !keptGenerated.has(itemKey(d)));
    const version = moduleVersion();
    const toUpdate = [...keptGenerated.values()]
      .filter(i => force || i.getFlag(MODULE_ID, "version") !== version)
      .map(i => {
        const d = desiredByKey.get(docKey(i));
        const [activityId, activity] = Object.entries(d.system.activities)[0];
        const existingActivity = i.system.activities?.get?.(activityId);
        const update = {
          _id: i.id,
          name: d.name,
          img: d.img,
          "system.description.value": d.system.description.value,
          "system.requirements": d.system.requirements,
          [`flags.${MODULE_ID}.version`]: version,
          [`flags.${MODULE_ID}.generated`]: true,
          ...(d.flags[TIDY_ID] ? { [`flags.${TIDY_ID}.section`]: d.flags[TIDY_ID].section, [`flags.${TIDY_ID}.actionSection`]: d.flags[TIDY_ID].actionSection } : {})
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
    case "capSave": return capSave(actor);
    case "technique": return useTechnique(actor, item.getFlag(MODULE_ID, "technique"));
  }
}

/**
 * Alchemical consumables from the compendium carry flags.witch-blade.alchemy:
 * { activity, fp: "<formula>", exhaustion: <n> }. After that activity is used, apply them.
 */
async function applyAlchemy(activity) {
  const item = activity?.item;
  const actor = item?.actor;
  const alchemy = item?.getFlag?.(MODULE_ID, "alchemy");
  if (!alchemy || !actor || (activity.id ?? activity._id) !== alchemy.activity) return;
  if (!isWitchBlade(actor) || !isResponsibleUser(actor)) return;
  const lines = [];
  if (alchemy.fp) {
    const roll = await new Roll(String(alchemy.fp)).evaluate();
    const before = getFp(actor);
    const fp = await setFp(actor, before + roll.total);
    lines.push(`FP ${roll.total >= 0 ? "+" : ""}${roll.total} (${alchemy.fp}): ${before} → ${fp}`);
  }
  if (alchemy.exhaustion) {
    const now = Math.min(6, (actor.system.attributes?.exhaustion ?? 0) + Number(alchemy.exhaustion));
    await actor.update({ "system.attributes.exhaustion": now });
    lines.push(tf("Chat.AlchemyExhaustion", { n: alchemy.exhaustion, now }));
  }
  if (lines.length) await chat(actor, item.name, lines.map(l => `<p>${l}</p>`).join(""));
}

export function registerAbilityHooks() {
  Hooks.on("dnd5e.postUseActivity", activity => { applyAlchemy(activity); });

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
    const grantedAbility = item.getFlag?.(MODULE_ID, "ability") && !isGenerated(item);
    if (["class", "subclass"].includes(item.type) || grantedAbility) syncAbilityItems(item.parent);
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
    const enabledChanged = foundry.utils.hasProperty(changes, `flags.${MODULE_ID}.enabled`);
    if (subChanged || sheetChanged || enabledChanged) syncAbilityItems(actor);
  });

  Hooks.on("createActor", (actor, _opts, userId) => {
    if (userId === game.user.id) syncAbilityItems(actor);
  });
}
