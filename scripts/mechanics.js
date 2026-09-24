/**
 * Witch-Blade core mechanics. No UI dependencies: callable from either sheet,
 * from generated items (Argon Combat HUD, hotbar) or from macros via
 * game.modules.get("witch-blade").api.
 */

import {
  feralityCap, proficiencyFor, SUBCLASSES, SURGE_SAVE_DC, TECHNIQUES, ICONS
} from "./data.js";

export const MODULE_ID = "witch-blade";
export const INSTABILITY_TABLE = "Feral Instability";
export const MUTATION_TABLE = "Feral Mutations";
const MAX_EXHAUSTION = 6;

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

/** Subclass key: from a subclass item if one matches, else the tab's selector flag. */
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

export function capOf(actor) {
  return feralityCap(wbLevel(actor));
}

export function surgeEffect(actor) {
  return actor.effects.find(e => e.getFlag(MODULE_ID, "bloodSurge"));
}

export function feralEffect(actor) {
  return actor.effects.find(e => e.getFlag(MODULE_ID, "feral"));
}

/** Feral State as stored on the actor: { rounds, total } or null. */
export function feralState(actor) {
  const f = actor.getFlag(MODULE_ID, "feral");
  return f && f.rounds > 0 ? f : null;
}

export function capHeld(actor) {
  return actor.getFlag(MODULE_ID, "capHeld") ?? null;
}

export function mutations(actor) {
  return actor.getFlag(MODULE_ID, "mutations") ?? [];
}

/** The generated feature item for an ability key, if present. */
export function abilityItem(actor, key) {
  return actor.items.find(i => i.getFlag(MODULE_ID, "ability") === key);
}

/** Blood Surge uses: read from the feature item's native uses, else a flag fallback. */
export function surgeUses(actor) {
  const item = abilityItem(actor, "bloodSurge");
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

export async function chat(actor, title, body, subtitle = "", cls = "") {
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="witch-blade-card ${cls}"><header><h3>${title}</h3>${subtitle ? `<span>${subtitle}</span>` : ""}</header>${body}</div>`
  });
}

/** Why a technique can't be used right now, or null if it can. */
export function techniqueLock(actor, tech) {
  const level = wbLevel(actor);
  const fp = getFp(actor);
  const usedOnce = actor.getFlag(MODULE_ID, "oncePerSurge") ?? [];
  if (feralState(actor)) return t("Lock.Feral");
  if (!surgeEffect(actor)) return t("Lock.Surge");
  if (tech.tier === "advanced" && level < 11) return t("Lock.Level");
  if (fp < tech.req) return tf("Lock.Fp", { req: tech.req, fp });
  if (tech.oncePerSurge && usedOnce.includes(tech.id)) return t("Lock.Once");
  return null;
}

/** Techniques this actor has access to (core + their subclass). */
export function availableTechniques(actor, { respectLevel = false } = {}) {
  const groups = ["core", wbSubclass(actor).key];
  const level = wbLevel(actor);
  return TECHNIQUES.filter(x => groups.includes(x.group) && (!respectLevel || x.tier === "standard" || level >= 11));
}

/**
 * Run an FP-changing flow, then check whether it pushed FP up to the cap.
 * Reaching the cap (from below) triggers the Ferality Cap Save.
 */
async function withCapCheck(actor, fn) {
  const before = getFp(actor);
  const result = await fn();
  const cap = capOf(actor);
  const after = getFp(actor);
  if (before < cap && after >= cap && !feralState(actor)) await capSave(actor);
  return result;
}

/* -------------------------------------------- */
/*  Blood Surge                                 */
/* -------------------------------------------- */

export async function toggleBloodSurge(actor) {
  const existing = surgeEffect(actor);
  if (existing) {
    await existing.delete();
    await actor.unsetFlag(MODULE_ID, "oncePerSurge");
    return chat(actor, t("Chat.SurgeEndsTitle"), `<p>${t("Chat.SurgeEnds")}</p>`);
  }
  if (feralState(actor)) return ui.notifications.warn(t("Lock.Feral"));

  const level = wbLevel(actor);
  const uses = surgeUses(actor);
  if (level < 2) return ui.notifications.warn(t("Warn.SurgeLevel"));
  if (uses.value <= 0) return ui.notifications.warn(t("Warn.NoUses"));

  return withCapCheck(actor, async () => {
    const { key: sub } = wbSubclass(actor);
    const stat = sub === "seeker" ? "dex" : "str";
    const dice = Math.max(1, proficiencyFor(level) - 1);
    const ADD = CONST.ACTIVE_EFFECT_MODES.ADD;

    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: t("BloodSurge"),
      img: ICONS.bloodSurge,
      origin: uses.item?.uuid ?? actor.uuid,
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
  });
}

/* -------------------------------------------- */
/*  Tables                                      */
/* -------------------------------------------- */

/**
 * Draw from "Feral Instability" and apply what the result carries:
 * +FP normally, or +Feral rounds instead when already Feral (result 10).
 */
export async function drawInstability(actor) {
  const table = game.tables.getName(INSTABILITY_TABLE);
  if (!table) {
    ui.notifications.warn(tf("Warn.NoTable", { name: INSTABILITY_TABLE }));
    return null;
  }
  const draw = await table.draw();
  const feral = feralState(actor);
  let fp = 0, rounds = 0;
  for (const r of draw.results) {
    const addRounds = Number(r.getFlag(MODULE_ID, "feralRounds")) || 0;
    if (feral && addRounds) rounds += addRounds;
    else fp += Number(r.getFlag(MODULE_ID, "fp")) || 0;
  }
  if (rounds) {
    await actor.setFlag(MODULE_ID, "feral", { ...feral, rounds: feral.rounds + rounds, total: feral.total + rounds });
    await chat(actor, t("FeralState"), `<p>${tf("Chat.FeralExtended", { rounds })}</p>`, "", "feral");
  }
  if (fp) await setFp(actor, getFp(actor) + fp);
  return draw;
}

async function drawMutation(actor) {
  const table = game.tables.getName(MUTATION_TABLE);
  if (!table) {
    ui.notifications.warn(tf("Warn.NoTable", { name: MUTATION_TABLE }));
    return null;
  }
  const draw = await table.draw();
  const r = draw.results[0];
  if (!r) return null;
  const text = (r.description ?? r.text ?? "").replace(/^<strong>.*?<\/strong>\s*/, "");
  const entry = { id: foundry.utils.randomID(), name: r.name || "Mutation", text };
  await actor.setFlag(MODULE_ID, "mutations", [...mutations(actor), entry]);
  return entry;
}

export async function removeMutation(actor, id) {
  await actor.setFlag(MODULE_ID, "mutations", mutations(actor).filter(m => m.id !== id));
}

/* -------------------------------------------- */
/*  Saves                                       */
/* -------------------------------------------- */

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
  if (feralState(actor)) return ui.notifications.warn(t("Lock.Feral"));
  if (!surgeEffect(actor)) return ui.notifications.warn(t("Lock.Surge"));
  const note = actor.getFlag(MODULE_ID, "gainedThisTurn") ? t("Dialog.GainedNote") : "";
  const result = await promptWisSave(actor, {
    title: t("EndTurnSave"), text: t("Dialog.EndTurnText"), dc: SURGE_SAVE_DC, showLeave: true, note
  });
  if (!result) return;

  await withCapCheck(actor, async () => {
    const before = getFp(actor);
    if (result.success) {
      const fp = await setFp(actor, before - 1);
      await chat(actor, t("Chat.SaveSuccess"), `<p>FP ${before} → ${fp}</p>`);
    } else {
      const fp = await setFp(actor, before + 1);
      await chat(actor, t("Chat.SaveFailure"), `<p>FP ${before} → ${fp}</p>`);
      await drawInstability(actor);
    }
  });
  await actor.setFlag(MODULE_ID, "gainedThisTurn", false);
  if (result.leave && surgeEffect(actor) && !feralState(actor)) await toggleBloodSurge(actor);
}

/**
 * Ferality Cap Save: DC 13 + 1 per FP over the cap.
 * Success keeps control until the end of your next turn. Failure: Feral State.
 */
export async function capSave(actor) {
  if (feralState(actor)) return;
  const cap = capOf(actor);
  const fp = getFp(actor);
  const over = Math.max(0, fp - cap);
  const dc = SURGE_SAVE_DC + over;
  const result = await promptWisSave(actor, {
    title: t("CapSave"),
    text: tf("Dialog.CapText", { fp, cap, extra: over ? ` + ${over}` : "" }),
    dc
  });
  if (!result) return null;
  if (result.success) {
    // "Until the end of your next turn": if saving on your own turn, this turn's end doesn't count.
    const ownTurn = !!game.combat?.started && game.combat.combatant?.actor?.id === actor.id;
    await actor.setFlag(MODULE_ID, "capHeld", { turnsLeft: ownTurn ? 2 : 1 });
    await chat(actor, t("Chat.CapHeldTitle"), `<p>${t("Chat.CapHeld")}</p>`);
  } else {
    await enterFeral(actor, over);
  }
  return result;
}

/* -------------------------------------------- */
/*  Feral State                                 */
/* -------------------------------------------- */

export async function enterFeral(actor, over = Math.max(0, getFp(actor) - capOf(actor))) {
  const roll = await new Roll("1d4").evaluate();
  const rounds = roll.total + over;
  await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: `${t("FeralState")}: 1d4${over ? ` + ${over}` : ""}` });

  await actor.unsetFlag(MODULE_ID, "capHeld");
  await actor.setFlag(MODULE_ID, "feral", { rounds, total: rounds });
  const ADD = CONST.ACTIVE_EFFECT_MODES.ADD;
  await actor.createEmbeddedDocuments("ActiveEffect", [{
    name: t("FeralState"),
    img: ICONS.feral,
    origin: actor.uuid,
    description: `<p>${t("Item.Feral")}</p>`,
    duration: { rounds },
    flags: { [MODULE_ID]: { feral: true } },
    changes: [
      { key: "system.traits.dr.value", mode: ADD, value: "bludgeoning" },
      { key: "system.traits.dr.value", mode: ADD, value: "piercing" },
      { key: "system.traits.dr.value", mode: ADD, value: "slashing" },
      { key: "system.traits.dr.bypasses", mode: ADD, value: "mgc" }
    ]
  }]);
  return chat(actor, t("FeralState"), `<p>${tf("Chat.FeralOn", { rounds })}</p>`, "", "feral");
}

/**
 * Leave Feral State.
 * full: 2 exhaustion, FP → 0, Blood Surge ends, roll a mutation (the normal ending).
 * soft: dropped below the cap out of combat; keep FP, no exhaustion.
 */
export async function exitFeral(actor, { soft = false } = {}) {
  await feralEffect(actor)?.delete();
  await actor.unsetFlag(MODULE_ID, "feral");
  await actor.unsetFlag(MODULE_ID, "capHeld");
  if (soft) return chat(actor, t("Chat.FeralEndsTitle"), `<p>${t("Chat.FeralSoftEnd")}</p>`, "", "feral");

  const exhaustion = Math.min(MAX_EXHAUSTION, (actor.system.attributes?.exhaustion ?? 0) + 2);
  await actor.update({ "system.attributes.exhaustion": exhaustion, "system.resources.secondary.value": 0 });
  const surge = surgeEffect(actor);
  if (surge) { await surge.delete(); await actor.unsetFlag(MODULE_ID, "oncePerSurge"); }
  const mutation = await drawMutation(actor);
  return chat(actor, t("Chat.FeralEndsTitle"),
    `<p>${tf("Chat.FeralEnds", { exhaustion })}</p>${mutation ? `<p><strong>${t("Mutation")}: ${mutation.name}</strong></p>` : ""}`,
    "", "feral");
}

/** One Feral turn out of combat (or when automation is off): roll Instability, count down a round. */
export async function feralTurn(actor) {
  const feral = feralState(actor);
  if (!feral) return;
  await drawInstability(actor);
  const now = feralState(actor);
  const left = now.rounds - 1;
  if (left <= 0) return exitFeral(actor);
  await actor.setFlag(MODULE_ID, "feral", { ...now, rounds: left });
  return chat(actor, t("FeralState"), `<p>${tf("Chat.FeralLeft", { rounds: left })}</p>`, "", "feral");
}

/**
 * Out of combat: make a Blood Surge save to calm down (DC 13 + over the cap).
 * Success ends Feral State. Failure rolls Instability and drops FP by 1; falling
 * below the cap before a successful save ends it without the usual penalties.
 */
export async function calmFeral(actor) {
  if (!feralState(actor)) return;
  const cap = capOf(actor);
  const over = Math.max(0, getFp(actor) - cap);
  const result = await promptWisSave(actor, { title: t("CalmDown"), text: t("Dialog.CalmText"), dc: SURGE_SAVE_DC + over });
  if (!result) return;
  if (result.success) return exitFeral(actor);
  await drawInstability(actor);
  const fp = await setFp(actor, getFp(actor) - 1);
  if (fp < cap) return exitFeral(actor, { soft: true });
  return chat(actor, t("FeralState"), `<p>${tf("Chat.CalmFailed", { fp })}</p>`, "", "feral");
}

/* -------------------------------------------- */
/*  Techniques                                  */
/* -------------------------------------------- */

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
  return withCapCheck(actor, async () => {
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
  });
}

/** Manual FP change from the gauge. Reaching the cap still triggers the cap save. */
export async function changeFp(actor, value) {
  return withCapCheck(actor, () => setFp(actor, value));
}

/* -------------------------------------------- */
/*  Combat turn automation                      */
/* -------------------------------------------- */

/** The one client that should act for this actor: an active player owner, else the active GM. */
export function isResponsibleUser(actor) {
  const player = game.users.find(u => u.active && !u.isGM && actor.testUserPermission(u, "OWNER"));
  const responsible = player ?? game.users.activeGM;
  return responsible?.id === game.user.id;
}

/** Start of a Witch-Blade's turn. */
export async function onTurnStart(actor) {
  await actor.setFlag(MODULE_ID, "gainedThisTurn", false);
  if (feralState(actor)) {
    const f = feralState(actor);
    await chat(actor, t("FeralState"), `<p>${tf("Chat.FeralTurn", { n: f.total - f.rounds + 1, total: f.total })}</p>`, "", "feral");
    await drawInstability(actor);
  }
}

/** End of a Witch-Blade's turn. */
export async function onTurnEnd(actor, combat) {
  const feral = feralState(actor);
  if (feral) {
    const left = feral.rounds - 1;
    if (left <= 0) return exitFeral(actor);
    await actor.setFlag(MODULE_ID, "feral", { ...feral, rounds: left });
    return chat(actor, t("FeralState"), `<p>${tf("Chat.FeralLeft", { rounds: left })}</p>`, "", "feral");
  }

  const cap = capOf(actor);
  if (getFp(actor) >= cap) {
    // At or over the cap: roll Instability each turn end, and re-save once control lapses.
    await drawInstability(actor);
    if (feralState(actor)) return;
    const held = capHeld(actor);
    const turnsLeft = (held?.turnsLeft ?? 0) - 1;
    if (turnsLeft > 0) return actor.setFlag(MODULE_ID, "capHeld", { turnsLeft });
    await actor.unsetFlag(MODULE_ID, "capHeld");
    await capSave(actor);
    return;
  }
  await actor.unsetFlag(MODULE_ID, "capHeld");

  if (surgeEffect(actor) && game.settings.get(MODULE_ID, "promptEndTurn")) {
    if (actor.getFlag(MODULE_ID, "gainedThisTurn")) {
      return chat(actor, t("EndTurnSave"), `<p>${t("Chat.SaveSkipped")}</p>`);
    }
    return endOfTurnSave(actor);
  }
}
