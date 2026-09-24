/**
 * Witch-Blade: custom D&D 5e character sheet for the Witch-Blade homebrew class.
 *
 * Extends the dnd5e 5.x CharacterActorSheet (ApplicationV2) with a "Ferality"
 * tab. Every stock tab (inventory, features, spells, …) is left as it is.
 *
 * Ferality Points are stored at actor.system.resources.secondary.value.
 * The cap comes from Witch-Blade level and is written back to .max so the
 * sheet's own resource display shows the right number.
 */

import {
  feralityCap, proficiencyFor, SUBCLASSES, SURGE_SAVE_DC, INSTABILITY, MUTATIONS, TECHNIQUES
} from "./data.js";
import {
  MODULE_ID, INSTABILITY_TABLE, MUTATION_TABLE, SURGE_ICON, t, tf, signed,
  wbLevel, wbSubclass, getFp, setFp, surgeEffect, surgeUses, chat,
  techniqueLock, availableTechniques,
  toggleBloodSurge, endOfTurnSave, useTechnique, drawInstability
} from "./mechanics.js";
import { syncAbilityItems, runAbility, registerAbilityHooks, isWitchBlade } from "./abilities.js";

const TEMPLATE = `modules/${MODULE_ID}/templates/witchblade-ui.hbs`;

/* -------------------------------------------- */
/*  Sheet                                       */
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
        scrollable: [""]
      };
    }
    PARTS[key] = part;
  }

  return class WitchBladeSheet extends Base {
    static DEFAULT_OPTIONS = {
      classes: ["witch-blade-sheet"],
      actions: {
        wbSetFp: WitchBladeSheet.#onSetFp,
        wbStepFp: WitchBladeSheet.#onStepFp,
        wbBloodSurge: WitchBladeSheet.#onBloodSurge,
        wbEndTurnSave: WitchBladeSheet.#onEndTurnSave,
        wbFilter: WitchBladeSheet.#onFilter,
        wbToggleTech: WitchBladeSheet.#onToggleTech,
        wbUseTech: WitchBladeSheet.#onUseTech,
        wbToggleLocked: WitchBladeSheet.#onToggleLocked,
        wbSync: WitchBladeSheet.#onSync
      }
    };

    static PARTS = PARTS;

    static TABS = [
      ...Base.TABS,
      { tab: "witchblade", label: "WITCHBLADE.Tab", icon: "fas fa-droplet" }
    ];

    /** Per-sheet view state (not saved). */
    _wb = { filter: "all", open: null, showLocked: true, syncing: false, itemsChecked: false };

    /** @inheritDoc */
    async _preparePartContext(partId, context, options) {
      context = await super._preparePartContext(partId, context, options);
      if (partId === "witchblade") context.wb = this._prepareWitchBlade();
      return context;
    }

    _prepareWitchBlade() {
      const actor = this.actor;
      const level = wbLevel(actor);
      const cap = feralityCap(level);
      const fp = getFp(actor);
      const over = Math.max(0, fp - cap);
      const surging = !!surgeEffect(actor);
      const uses = surgeUses(actor);
      const sub = wbSubclass(actor);
      const prof = proficiencyFor(level);

      // Gauge: one node per point up to the cap, plus a spare past the cap once you reach it.
      const total = Math.max(cap, fp) + (fp >= cap ? 1 : 0);
      const nodes = Array.fromRange(total, 1).map(n => ({
        n, on: n <= fp, over: n > cap, near: n >= cap - 1 && n <= cap, capMark: n === cap + 1
      }));

      let state = { cls: "calm", label: t("State.Calm") };
      if (fp >= cap) state = { cls: "cap", label: over ? tf("State.Over", { over }) : t("State.Cap") };
      else if (surging) state = { cls: "surge", label: t("BloodSurge") };

      const all = availableTechniques(actor)
        .map(x => {
          const lock = techniqueLock(actor, x);
          return {
            ...x,
            lock,
            ready: !lock,
            open: this._wb.open === x.id,
            actionLabel: t(`Action.${x.action}`),
            groupLabel: x.group === "core" ? t("Core") : SUBCLASSES[x.group],
            advanced: x.tier === "advanced",
            deltas: x.fp.map((o, i) => ({
              i, d: o.d, text: signed(o.d), label: o.label,
              cls: o.d > 0 ? "up" : o.d < 0 ? "down" : "", primary: i === 0
            }))
          };
        })
        .sort((a, b) => (a.tier === b.tier ? 0 : a.advanced ? 1 : -1) || a.req - b.req);

      const techniques = all.filter(x =>
        (this._wb.filter === "all" || x.action === this._wb.filter) && (this._wb.showLocked || x.ready));

      const filters = ["all", "action", "bonus", "reaction", "free"].map(f => ({
        id: f, label: f === "all" ? t("All") : t(`Action.${f}`), active: this._wb.filter === f
      }));

      const stat = sub.key === "seeker" ? "DEX" : "STR";
      return {
        editable: this.isEditable,
        level, cap, fp, over, prof, surging, uses, nodes, state,
        atCap: fp >= cap,
        capDc: SURGE_SAVE_DC + over,
        surgeDc: SURGE_SAVE_DC,
        surgeSummary: tf(surging ? "SurgeActive" : "SurgeIdle", { stat, dice: Math.max(1, prof - 1), uses: uses.max }),
        canSurge: this.isEditable && (surging || (level >= 2 && uses.value > 0)),
        canSave: this.isEditable && surging,
        subclass: sub.key,
        subclassFromItem: sub.fromItem,
        subclassLabel: SUBCLASSES[sub.key] ?? "",
        subclassOptions: Object.entries(SUBCLASSES).map(([value, label]) => ({ value, label, selected: value === sub.key })),
        filters,
        showLocked: this._wb.showLocked,
        techniques,
        readyCount: all.filter(x => x.ready).length,
        emptyText: surging ? t("EmptyFilter") : t("EmptySurge")
      };
    }

    /** @inheritDoc */
    _onRender(context, options) {
      super._onRender(context, options);
      this._syncFeralityResource();
      if (!this._wb.itemsChecked && this.isEditable) {
        this._wb.itemsChecked = true;
        syncAbilityItems(this.actor);
      }
    }

    /** Keep the stored resource max/label matched to the level-based cap. */
    async _syncFeralityResource() {
      if (!this.isEditable || this._wb.syncing) return;
      const res = this.actor.system.resources?.secondary ?? {};
      const cap = feralityCap(wbLevel(this.actor));
      const label = t("Ferality");
      if (res.max === cap && res.label === label && !res.sr && !res.lr) return;
      this._wb.syncing = true;
      try {
        await this.actor.update({
          "system.resources.secondary.max": cap,
          "system.resources.secondary.label": label,
          "system.resources.secondary.sr": false,
          "system.resources.secondary.lr": false
        });
      } finally {
        this._wb.syncing = false;
      }
    }

    /* ---------- Actions ---------- */

    static async #onSetFp(event, target) {
      const n = Number(target.dataset.value);
      await setFp(this.actor, getFp(this.actor) === n ? n - 1 : n);
    }

    static async #onStepFp(event, target) {
      await setFp(this.actor, getFp(this.actor) + Number(target.dataset.step));
    }

    static async #onBloodSurge() {
      await toggleBloodSurge(this.actor);
    }

    static async #onEndTurnSave() {
      await endOfTurnSave(this.actor);
    }

    static #onFilter(event, target) {
      this._wb.filter = target.dataset.filter;
      this.render({ parts: ["witchblade"] });
    }

    static #onToggleLocked() {
      this._wb.showLocked = !this._wb.showLocked;
      this.render({ parts: ["witchblade"] });
    }

    static #onToggleTech(event, target) {
      const id = target.closest("[data-tech]")?.dataset.tech;
      this._wb.open = this._wb.open === id ? null : id;
      this.render({ parts: ["witchblade"] });
    }

    static async #onUseTech(event, target) {
      const id = target.closest("[data-tech]")?.dataset.tech;
      await useTechnique(this.actor, id, Number(target.dataset.option) || 0);
    }

    static async #onSync() {
      const r = await syncAbilityItems(this.actor, { force: true });
      if (r) ui.notifications.info(tf("Info.Synced", r));
    }
  };
}

/* -------------------------------------------- */
/*  Roll tables                                 */
/* -------------------------------------------- */

async function ensureTables() {
  if (!game.user.isGM || !game.settings.get(MODULE_ID, "createTables")) return;

  if (!game.tables.getName(INSTABILITY_TABLE)) {
    await RollTable.create({
      name: INSTABILITY_TABLE,
      img: SURGE_ICON,
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
        flags: r.fp ? { [MODULE_ID]: { fp: r.fp } } : {}
      }))
    });
    ui.notifications.info(tf("Info.TableCreated", { name: INSTABILITY_TABLE }));
  }

  if (!game.tables.getName(MUTATION_TABLE)) {
    await RollTable.create({
      name: MUTATION_TABLE,
      img: SURGE_ICON,
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
/*  Hooks                                       */
/* -------------------------------------------- */

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "createTables", {
    name: "WITCHBLADE.Settings.CreateTables.Name",
    hint: "WITCHBLADE.Settings.CreateTables.Hint",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(MODULE_ID, "techniqueItems", {
    name: "WITCHBLADE.Settings.TechniqueItems.Name",
    hint: "WITCHBLADE.Settings.TechniqueItems.Hint",
    scope: "world", config: true, type: Boolean, default: true
  });
  game.settings.register(MODULE_ID, "tranceRest", {
    name: "WITCHBLADE.Settings.Trance.Name",
    hint: "WITCHBLADE.Settings.Trance.Hint",
    scope: "world", config: true, type: String, default: "long",
    choices: {
      long: "WITCHBLADE.Settings.Trance.Long",
      both: "WITCHBLADE.Settings.Trance.Both",
      none: "WITCHBLADE.Settings.Trance.None"
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
    syncAbilityItems, isWitchBlade, feralityCap, getFp, setFp,
    TECHNIQUES
  };
});

Hooks.once("ready", ensureTables);

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
