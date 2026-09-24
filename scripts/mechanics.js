/**
 * Witch-Blade core mechanics. No UI dependencies: callable from the sheet,
 * from generated items (Argon Combat HUD, hotbar) or from macros
 * via game.modules.get("witch-blade").api.
 */

import {
  feralityCap, proficiencyFor, SUBCLASSES, SURGE_SAVE_DC, TECHNIQUES
} from "./data.js";

export const MODULE_ID = "witch-blade";
export const INSTABILITY_TABLE = "Feral Instability";
export const MUTATION_TABLE = "Feral Mutations";
export const SURGE_ICON = "icons/svg/blood.svg";

/* -------------------------------------------- */
/*  Helpers                                     */
/* -------------------------------------------- */

export const t = key => game.i18n.localize(`WITCHBLADE.${key}`);
export const tf = (key, data) => game.i18n.format(`WITCHBLADE.${key}`, data);
export const signed = n => (n > 0 ? `+${n}` : n === 0 ? "±0" : `${n}`);

/** Witch-Blade level: the class item's levels if present, else total character level. */
export function wbLevel(actor) {
  const cls = actor.classes?.[MODULE_ID];
  return cls?.system?.levels ?? actor.system.details?.level ?? 1;
}

/** Subclass key: from a subclass item if one matches, else the sheet's selector flag. */
export function wbSubclass(actor) {
  const fromItem = Object.keys(actor.subclasses ?? {}).find(k => k in SUBCLASSES);
  return { key: fromItem ?? actor.getFlag(MODULE_ID, "subclass") ?? "", fromItem: !!fromItem };
}

export function getFp(actor) {
  return Number(actor.system.resources?.secondary?.value) || 0;
}

export async function setFp(actor, value) {
  const fp = Math.max(0, Math.round(value));
  await actor.update({ "system.resources.secondary.value": fp });
  return fp;
}

export function surgeEffect(actor) {
  return actor.effects.find(e => e.getFlag(MODULE_ID, "bloodSurge"));
}

/** The generated Blood Surge feature item, if present. */
export function surgeItem(actor) {
  return actor.items.find(i => i.getFlag(MODULE_ID, "ability") === "bloodSurge");
}

/** Blood Surge uses: read from the feature item's native uses, else a flag fallback. */
export function surgeUses(actor) {
  const item = surgeItem(actor);
  const uses = item?.system?.uses;
  if (uses?.max) return { value: uses.value, max: uses.max, item };
  const max = proficiencyFor(wbLevel(actor));
  return { value: Math.min(max, actor.getFlag(MODULE_ID, "surgeUses") ?? max), max, item: null };
}

async function spendSurgeUse(actor) {
  const { value, item } = surgeUses(actor);
  if (item) return item.update({ "system.uses.spent": (item.system.uses.spent ?? 0) + 1 });
  return actor.setFlag(MODULE_ID, "surgeUses", value - 1);
}

export async function chat(actor, title, body, subtitle = "") {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="witch-blade-card"><header><h3>${title}</h3>${subtitle ? `<span>${subtitle}</span>` : ""}</header>${body}</div>`
  });
}

/** Why a technique can't be used right now, or null if it can. */
export function techniqueLock(actor, tech) {
  const level = wbLevel(actor);
  const fp = getFp(actor);
  const usedOnce = actor.getFlag(MODULE_ID, "oncePerSurge") ?? [];
  if (!surgeEffect(actor)) return t("Lock.Surge");
  if (tech.tier === "advanced" && level < 11) return t("Lock.Level");
  if (fp < tech.req) return tf("Lock.Fp", { req: tech.req, fp });
  if (tech.oncePerSurge && usedOnce.includes(tech.id)) return t("Lock.Once");
  return null;
}

/** Techniques this actor has access to (core + their subclass). */
export function availableTechniques(actor, { includeAdvanced = true } = {}) {
  const groups = ["core", wbSubclass(actor).key];
  const level = wbLevel(actor);
  return TECHNIQUES.filter(x => groups.includes(x.group) && (includeAdvanced || x.tier === "standard" || level >= 11));
}

/* -------------------------------------------- */
/*  Mechanics                                   */
/* -------------------------------------------- */

export async function toggleBloodSurge(actor) {
  const existing = surgeEffect(actor);
  if (existing) {
    await existing.delete();
    await actor.unsetFlag(MODULE_ID, "oncePerSurge");
    return chat(actor, t("Chat.SurgeEndsTitle"), `<p>${t("Chat.SurgeEnds")}</p>`);
  }

  const level = wbLevel(actor);
  const uses = surgeUses(actor);
  if (level < 2) return ui.notifications.warn(t("Warn.SurgeLevel"));
  if (uses.value <= 0) return ui.notifications.warn(t("Warn.NoUses"));

  const { key: sub } = wbSubclass(actor);
  const stat = sub === "seeker" ? "dex" : "str";
  const dice = Math.max(1, proficiencyFor(level) - 1);
  const ADD = CONST.ACTIVE_EFFECT_MODES.ADD;

  await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: t("BloodSurge"),
    img: SURGE_ICON,
    origin: surgeItem(actor)?.uuid ?? actor.uuid,
    duration: { rounds: 10, seconds: 60 },
    flags: { [MODULE_ID]: { bloodSurge: true } },
    changes: [
      { key: `system.abilities.${stat}.value`, mode: ADD, value: "5" },
      { key: "system.bonuses.mwak.damage", mode: ADD, value: `+${dice}d4[force]` },
      { key: "system.abilities.str.check.roll.mode", mode: ADD, value: "1" },
      { key: "system.abilities.str.save.roll.mode", mode: ADD, value: "1" }
    ]
  }]);
  await spendSurgeUse(actor);
  const before = getFp(actor);
  const fp = await setFp(actor, before + 1);
  await actor.setFlag(MODULE_ID, "gainedThisTurn", true);
  return chat(actor, t("BloodSurge"),
    `<p>${tf("Chat.SurgeOn", { stat: stat.toUpperCase(), dice })}</p><p><strong>${signed(1)} FP</strong> (${before} → ${fp})</p>`,
    t("Action.bonus"));
}

/** Draw from the "Feral Instability" table and apply any FP change stored on the drawn result. */
export async function drawInstability(actor) {
  const table = game.tables.getName(INSTABILITY_TABLE);
  if (!table) {
    ui.notifications.warn(tf("Warn.NoTable", { name: INSTABILITY_TABLE }));
    return null;
  }
  const draw = await table.draw();
  const extra = draw.results.reduce((n, r) => n + (Number(r.getFlag(MODULE_ID, "fp")) || 0), 0);
  if (extra) await setFp(actor, getFp(actor) + extra);
  return draw;
}

/** Ask for advantage mode, then roll a flat WIS save with the core Roll class. */
export async function promptWisSave(actor, { title, text, dc, showLeave = false, note = "" }) {
  const mod = Number(actor.system.abilities?.wis?.save?.value) || 0;
  const content = `
    <div class="witch-blade-dialog">
      <p>${text}</p>
      ${note ? `<p class="wb-note">${note}</p>` : ""}
      <p class="wb-formula">1d20 ${signed(mod)} vs DC ${dc}</p>
      ${showLeave ? `<label class="wb-check"><input type="checkbox" name="leave"> ${t("Dialog.Leave")}</label>` : ""}
    </div>`;
  const pick = (event, button) => ({ mode: button.dataset.action, leave: !!button.form?.elements?.leave?.checked });
  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title },
    content,
    rejectClose: false,
    buttons: [
      { action: "adv", label: t("Dialog.Advantage"), callback: pick },
      { action: "normal", label: t("Dialog.Normal"), default: true, callback: pick },
      { action: "dis", label: t("Dialog.Disadvantage"), callback: pick }
    ]
  });
  if (!choice) return null;

  const dice = { adv: "2d20kh", dis: "2d20kl", normal: "1d20" }[choice.mode];
  const roll = await new Roll(`${dice} + @mod`, { mod }).evaluate();
  const success = roll.total >= dc;
  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `${title} (DC ${dc}): ${success ? t("Success") : t("Failure")}`
  });
  return { roll, success, leave: choice.leave };
}

export async function endOfTurnSave(actor) {
  if (!surgeEffect(actor)) return ui.notifications.warn(t("Lock.Surge"));
  const note = actor.getFlag(MODULE_ID, "gainedThisTurn") ? t("Dialog.GainedNote") : "";
  const result = await promptWisSave(actor, {
    title: t("EndTurnSave"), text: t("Dialog.EndTurnText"), dc: SURGE_SAVE_DC, showLeave: true, note
  });
  if (!result) return;

  const before = getFp(actor);
  if (result.success) {
    const fp = await setFp(actor, before - 1);
    await chat(actor, t("Chat.SaveSuccess"), `<p>FP ${before} → ${fp}</p>`);
  } else {
    const fp = await setFp(actor, before + 1);
    await chat(actor, t("Chat.SaveFailure"), `<p>FP ${before} → ${fp}</p>`);
    await drawInstability(actor);
  }
  await actor.setFlag(MODULE_ID, "gainedThisTurn", false);
  if (result.leave && surgeEffect(actor)) await toggleBloodSurge(actor);
}

/**
 * Use a surge technique. If it has several possible FP outcomes and no option
 * index is given, ask which one happened.
 */
export async function useTechnique(actor, techId, optionIndex = null) {
  const tech = TECHNIQUES.find(x => x.id === techId);
  if (!tech) return;
  const lock = techniqueLock(actor, tech);
  if (lock) return ui.notifications.warn(`${tech.name}: ${lock}`);

  if (optionIndex === null) {
    if (tech.fp.length === 1) optionIndex = 0;
    else {
      optionIndex = await foundry.applications.api.DialogV2.wait({
        window: { title: tech.name },
        content: `<p>${tech.text}</p><p>${t("Dialog.PickOutcome")}</p>`,
        rejectClose: false,
        buttons: tech.fp.map((o, i) => ({
          action: String(i), label: `${o.label ?? ""} (${signed(o.d)} FP)`, default: i === 0, callback: () => i
        }))
      });
      if (optionIndex === null || optionIndex === undefined) return;
    }
  }

  const option = tech.fp[optionIndex];
  if (!option) return;
  const before = getFp(actor);
  const fp = await setFp(actor, before + option.d);
  if (option.d > 0) await actor.setFlag(MODULE_ID, "gainedThisTurn", true);
  if (tech.oncePerSurge) {
    const used = actor.getFlag(MODULE_ID, "oncePerSurge") ?? [];
    await actor.setFlag(MODULE_ID, "oncePerSurge", [...used, tech.id]);
  }
  const label = option.label ? ` (${option.label})` : "";
  return chat(actor, tech.name,
    `<p>${tech.text}</p><p><strong>FP ${signed(option.d)}${label}</strong>: ${before} → ${fp}</p>`,
    t(`Action.${tech.action}`));
}
