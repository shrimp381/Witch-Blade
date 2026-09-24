/**
 * Witch-Blade: sheet support for the Witch-Blade homebrew class (D&D 5e).
 *
 * Two ways to show the Ferality tab:
 *   1. "Witch-Blade Character Sheet": extends the dnd5e 5.x CharacterActorSheet
 *      (ApplicationV2) with a Ferality tab and a Surge Techniques features section.
 *   2. Tidy 5e Sheets: a Ferality tab registered through Tidy's API, shown on
 *      any Witch-Blade character using a Tidy character sheet.
 *
 * Ferality Points are stored at actor.system.resources.secondary.value.
 */

import { INSTABILITY, MUTATIONS, TECHNIQUES, ICONS, feralityCap } from "./data.js";
import {
  MODULE_ID, INSTABILITY_TABLE, MUTATION_TABLE, t, tf, wbLevel, getFp, setFp, chat,
  toggleBloodSurge, endOfTurnSave, useTechnique, drawInstability, capSave,
  enterFeral, exitFeral, feralTurn, calmFeral, feralState,
  isResponsibleUser, onTurnStart, onTurnEnd
} from "./mechanics.js";
import { syncAbilityItems, runAbility, registerAbilityHooks, isWitchBlade } from "./abilities.js";
import { BODY_TEMPLATE, prepareTabContext, bindTab } from "./tab.js";

const TEMPLATE = `modules/${MODULE_ID}/templates/witchblade-ui.hbs`;
const SURGE_SECTION = "wb-surge";

/* -------------------------------------------- */
/*  Shared                                      */
/* -------------------------------------------- */

/** Keep the stored resource max/label matched to the level-based cap. */
const resourceSyncing = new Set();
async function syncFeralityResource(actor) {
  if (!actor?.isOwner || resourceSyncing.has(actor.id)) return;
  const res = actor.system.resources?.secondary ?? {};
  const cap = feralityCap(wbLevel(actor));
  const label = t("Ferality");
  if (res.max === cap && res.label === label && !res.sr && !res.lr) return;
  resourceSyncing.add(actor.id);
  try {
    await actor.update({
      "system.resources.secondary.max": cap,
      "system.resources.secondary.label": label,
      "system.resources.secondary.sr": false,
      "system.resources.secondary.lr": false
    });
  } finally {
    resourceSyncing.delete(actor.id);
  }
}

/** First time a Witch-Blade tab renders for an actor this session: set up resource and items. */
const prepared = new Set();
function ensurePrepared(actor) {
  syncFeralityResource(actor);
  if (prepared.has(actor.uuid) || !actor.isOwner) return;
  prepared.add(actor.uuid);
  syncAbilityItems(actor);
}

/* -------------------------------------------- */
/*  dnd5e sheet variant                         */
/* -------------------------------------------- */

function defineSheet() {
  const Base = dnd5e.applications.actor.CharacterActorSheet;

  // Insert our part among the tab bodies, before the non-tab parts.
  const PARTS = {};
  for (const [key, part] of Object.entries(Base.PARTS)) {
    if (key === "abilityScores") {
      PARTS.witchblade = {
        container: { classes: ["tab-body"], id: "tabs" },
        template: TEMPLATE,
        templates: [BODY_TEMPLATE],
        scrollable: [""]
      };
    }
    PARTS[key] = part;
  }

  return class WitchBladeSheet extends Base {
    static DEFAULT_OPTIONS = { classes: ["witch-blade-sheet"] };

    static PARTS = PARTS;

    static TABS = [
      ...Base.TABS,
      { tab: "witchblade", label: "WITCHBLADE.Tab", icon: "fas fa-droplet" }
    ];

    /** @inheritDoc */
    async _preparePartContext(partId, context, options) {
      context = await super._preparePartContext(partId, context, options);
      if (partId === "witchblade") context.wb = prepareTabContext(this.actor, { editable: this.isEditable });
      return context;
    }

    /** Give surge techniques their own section in the Features tab. */
    async _prepareFeaturesContext(context, options) {
      context = await super._prepareFeaturesContext(context, options);
      const hasTechniques = this.actor.items.some(i => i.getFlag(MODULE_ID, "ability") === "technique");
      if (!hasTechniques || !Array.isArray(context.sections)) return context;
      const columns = context.sections[0]?.columns ?? [];
      context.sections.push({
        id: SURGE_SECTION,
        label: "WITCHBLADE.Techniques",
        order: 50,
        columns,
        items: [],
        groups: { origin: SURGE_SECTION, activation: SURGE_SECTION },
        dataset: { "group-origin": SURGE_SECTION, "group-activation": SURGE_SECTION }
      });
      context.sections.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      return context;
    }

    /** Route technique items to that section, and the core abilities under the Witch-Blade class. */
    async _prepareItemFeature(item, ctx) {
      await super._prepareItemFeature(item, ctx);
      const ability = item.getFlag?.(MODULE_ID, "ability");
      if (!ability || !ctx.groups) return;
      if (ability === "technique") {
        ctx.groups.origin = SURGE_SECTION;
        ctx.groups.activation = SURGE_SECTION;
      } else if (this.actor.classes?.[MODULE_ID]) {
        ctx.groups.origin = MODULE_ID;
      }
    }

    /** @inheritDoc */
    _onRender(context, options) {
      super._onRender(context, options);
      bindTab(this.element, this.actor, () => this.render({ parts: ["witchblade"] }));
      if (this.isEditable) ensurePrepared(this.actor);
    }
  };
}

/* -------------------------------------------- */
/*  Tidy 5e Sheets variant                      */
/* -------------------------------------------- */

function registerTidyTab(api) {
  api.registerCharacterTab(
    new api.models.HandlebarsTab({
      title: "WITCHBLADE.Tab",
      tabId: `${MODULE_ID}-ferality`,
      iconClass: "fa-solid fa-droplet",
      path: `/${BODY_TEMPLATE}`,
      tabContentsClasses: ["wb-tidy-tab"],
      enabled: context => isWitchBlade(context.actor),
      getData: context => ({
        ...context,
        wb: prepareTabContext(context.actor, { editable: context.editable ?? context.actor?.isOwner })
      }),
      onRender: params => {
        const actor = params.data?.actor ?? params.app?.actor ?? params.app?.document;
        if (!actor) return;
        bindTab(params.tabContentsElement, actor, () => params.app.render());
        if (actor.isOwner) ensurePrepared(actor);
      }
    })
  );
}

/* -------------------------------------------- */
/*  Roll tables                                 */
/* -------------------------------------------- */

async function ensureTables() {
  if (!game.user.isGM || !game.settings.get(MODULE_ID, "createTables")) return;

  if (!game.tables.getName(INSTABILITY_TABLE)) {
    await RollTable.create({
      name: INSTABILITY_TABLE,
      img: ICONS.bloodSurge,
      formula: "1d10",
      replacement: true,
      displayRoll: true,
      description: "Witch-Blade: roll when you fail the end-of-turn Blood Surge save.",
      results: INSTABILITY.map(r => ({
        type: "text",
        range: [r.roll, r.roll],
        weight: 1,
        name: r.name,
        description: `<strong>${r.name}.</strong> ${r.text}`,
        flags: (r.fp || r.feralRounds) ? { [MODULE_ID]: { fp: r.fp ?? 0, feralRounds: r.feralRounds ?? 0 } } : {}
      }))
    });
    ui.notifications.info(tf("Info.TableCreated", { name: INSTABILITY_TABLE }));
  }

  if (!game.tables.getName(MUTATION_TABLE)) {
    await RollTable.create({
      name: MUTATION_TABLE,
      img: ICONS.feral,
      formula: "1d100",
      replacement: true,
      displayRoll: true,
      description: "Witch-Blade: roll each time you exit Feral State. Mutations are cumulative.",
      results: MUTATIONS.map(m => ({
        type: "text",
        range: [m.min, m.max],
        weight: m.max - m.min + 1,
        name: m.name,
        description: `<strong>${m.name}.</strong> ${m.text}`
      }))
    });
    ui.notifications.info(tf("Info.TableCreated", { name: MUTATION_TABLE }));
  }
}

/* -------------------------------------------- */
/*  Actors sidebar: switch a character on/off   */
/* -------------------------------------------- */

function actorContextOption(app, options) {
  const actorFrom = li => game.actors.get(li?.dataset?.entryId ?? li?.dataset?.documentId ?? li?.[0]?.dataset?.entryId);
  options.push({
    name: "WITCHBLADE.ToggleActor",
    icon: '<i class="fa-solid fa-droplet"></i>',
    condition: li => {
      const actor = actorFrom(li);
      return actor?.type === "character" && actor.isOwner && !actor.classes?.[MODULE_ID];
    },
    callback: async li => {
      const actor = actorFrom(li);
      const on = !actor.getFlag(MODULE_ID, "enabled");
      await actor.setFlag(MODULE_ID, "enabled", on);
      ui.notifications.info(tf(on ? "Info.Enabled" : "Info.Disabled", { name: actor.name }));
    }
  });
}

/* -------------------------------------------- */
/*  Hooks                                       */
/* -------------------------------------------- */

Hooks.once("init", () => {
  const setting = (key, data) => game.settings.register(MODULE_ID, key, {
    name: `WITCHBLADE.Settings.${key}.Name`, hint: `WITCHBLADE.Settings.${key}.Hint`, scope: "world", config: true, ...data
  });
  setting("createTables", { type: Boolean, default: true });
  setting("techniqueItems", { type: Boolean, default: true });
  setting("automateTurns", { type: Boolean, default: true });
  setting("promptEndTurn", { type: Boolean, default: true });
  setting("tranceRest", {
    type: String, default: "long",
    choices: {
      long: "WITCHBLADE.Settings.tranceRest.Long",
      both: "WITCHBLADE.Settings.tranceRest.Both",
      none: "WITCHBLADE.Settings.tranceRest.None"
    }
  });

  const WitchBladeSheet = defineSheet();
  foundry.applications.apps.DocumentSheetConfig.registerSheet(Actor, MODULE_ID, WitchBladeSheet, {
    types: ["character"],
    makeDefault: false,
    label: "WITCHBLADE.SheetLabel"
  });

  registerAbilityHooks();

  game.modules.get(MODULE_ID).api = {
    WitchBladeSheet,
    toggleBloodSurge, endOfTurnSave, useTechnique, drawInstability, runAbility,
    capSave, enterFeral, exitFeral, feralTurn, calmFeral,
    syncAbilityItems, isWitchBlade, feralityCap, getFp, setFp,
    TECHNIQUES
  };
});

Hooks.once("tidy5e-sheet.ready", registerTidyTab);
Hooks.once("ready", ensureTables);
Hooks.on("getActorContextOptions", actorContextOption);
Hooks.on("getActorDirectoryEntryContext", actorContextOption);

/** Combat: run end-of-turn and start-of-turn Witch-Blade steps on one client. */
Hooks.on("updateCombat", async (combat, changed, options) => {
  if (!game.settings.get(MODULE_ID, "automateTurns") || !combat.started) return;
  if (!("turn" in changed || "round" in changed) || options?.direction === -1) return;

  const prev = combat.combatants.get(combat.previous?.combatantId)?.actor;
  if (prev && isWitchBlade(prev) && isResponsibleUser(prev)) await onTurnEnd(prev, combat);

  const next = combat.combatant?.actor;
  if (next && isWitchBlade(next) && isResponsibleUser(next)) await onTurnStart(next);
});

/** Combat ended while Feral: point to the out-of-combat rule. */
Hooks.on("deleteCombat", combat => {
  for (const c of combat.combatants) {
    const actor = c.actor;
    if (actor && feralState(actor) && isWitchBlade(actor) && isResponsibleUser(actor)) {
      chat(actor, t("FeralState"), `<p>${t("Chat.CombatEndedFeral")}</p>`, "", "feral");
    }
  }
});

/** Rests: restore the flag-based uses fallback; trance reduces FP by half Witch-Blade level. */
Hooks.on("dnd5e.restCompleted", async (actor, result) => {
  if (!actor.isOwner || !isWitchBlade(actor)) return;
  if (actor.getFlag(MODULE_ID, "surgeUses") !== undefined) await actor.unsetFlag(MODULE_ID, "surgeUses");

  const mode = game.settings.get(MODULE_ID, "tranceRest");
  const applies = mode === "both" || (mode === "long" && result.longRest);
  if (!applies) return;
  const cut = Math.floor(wbLevel(actor) / 2);
  const before = getFp(actor);
  if (!cut || !before) return;
  const fp = await setFp(actor, before - cut);
  await chat(actor, t("Chat.TranceTitle"), `<p>${tf("Chat.Trance", { cut, before, fp })}</p>`);
});
