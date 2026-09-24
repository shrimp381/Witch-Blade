/**
 * The Ferality tab: context preparation and click handling, shared by the
 * dnd5e sheet variant and the Tidy 5e Sheets variant.
 *
 * Buttons use data-wb-action (not data-action) so neither sheet's own
 * ApplicationV2 action dispatch picks them up.
 */

import { proficiencyFor, SUBCLASSES, SURGE_SAVE_DC } from "./data.js";
import {
  MODULE_ID, t, tf, signed, wbLevel, wbSubclass, getFp, capOf, surgeEffect, surgeUses,
  feralState, capHeld, mutations, techniqueLock, availableTechniques,
  toggleBloodSurge, endOfTurnSave, useTechnique, changeFp, capSave,
  feralTurn, calmFeral, exitFeral, removeMutation
} from "./mechanics.js";
import { syncAbilityItems } from "./abilities.js";

export const BODY_TEMPLATE = `modules/${MODULE_ID}/templates/witchblade-body.hbs`;

/** Per-actor view state (filters, open rows). Not saved. */
const viewState = new Map();
function stateFor(actor) {
  if (!viewState.has(actor.uuid)) viewState.set(actor.uuid, { filter: "all", open: null, showLocked: true });
  return viewState.get(actor.uuid);
}

export function prepareTabContext(actor, { editable = actor.isOwner } = {}) {
  const view = stateFor(actor);
  const level = wbLevel(actor);
  const cap = capOf(actor);
  const fp = getFp(actor);
  const over = Math.max(0, fp - cap);
  const surging = !!surgeEffect(actor);
  const feral = feralState(actor);
  const held = capHeld(actor);
  const uses = surgeUses(actor);
  const sub = wbSubclass(actor);
  const prof = proficiencyFor(level);
  const inCombat = !!game.combat?.started && !!game.combat.combatants.find(c => c.actor?.id === actor.id);

  // Gauge: one node per point up to the cap, plus a spare past the cap once you reach it.
  const total = Math.max(cap, fp) + (fp >= cap ? 1 : 0);
  const nodes = Array.fromRange(total, 1).map(n => ({
    n, on: n <= fp, over: n > cap, near: n >= cap - 1 && n <= cap, capMark: n === cap + 1
  }));

  let state = { cls: "calm", label: t("State.Calm") };
  if (feral) state = { cls: "feral", label: tf("State.Feral", { rounds: feral.rounds }) };
  else if (fp >= cap) state = { cls: "cap", label: over ? tf("State.Over", { over }) : t("State.Cap") };
  else if (surging) state = { cls: "surge", label: t("BloodSurge") };

  const all = availableTechniques(actor)
    .map(x => {
      const lock = techniqueLock(actor, x);
      return {
        ...x,
        lock,
        ready: !lock,
        open: view.open === x.id,
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
    (view.filter === "all" || x.action === view.filter) && (view.showLocked || x.ready));

  const filters = ["all", "action", "bonus", "reaction", "free"].map(f => ({
    id: f, label: f === "all" ? t("All") : t(`Action.${f}`), active: view.filter === f
  }));

  const stat = sub.key === "seeker" ? "DEX" : "STR";
  let banner = null;
  if (feral) banner = { cls: "feral", html: tf(inCombat ? "Banner.FeralCombat" : "Banner.Feral", { rounds: feral.rounds, total: feral.total }) };
  else if (fp >= cap && held) banner = { cls: "held", html: t("Banner.Held") };
  else if (fp >= cap) banner = { cls: "cap", html: tf("Banner.Cap", { dc: SURGE_SAVE_DC + over, extra: over ? ` + ${over}` : "" }) };

  return {
    editable,
    isGM: game.user.isGM,
    level, cap, fp, over, prof, surging, uses, nodes, state, banner,
    feral, inCombat,
    exhaustion: actor.system.attributes?.exhaustion ?? 0,
    showCapSave: editable && !feral && fp >= cap && !held,
    showFeralControls: editable && !!feral,
    surgeSummary: tf(surging ? "SurgeActive" : "SurgeIdle", { stat, dice: Math.max(1, prof - 1), uses: uses.max }),
    canSurge: editable && !feral && (surging || (level >= 2 && uses.value > 0)),
    canSave: editable && surging && !feral,
    surgeDc: SURGE_SAVE_DC,
    subclass: sub.key,
    subclassFromItem: sub.fromItem,
    subclassLabel: SUBCLASSES[sub.key] ?? "",
    subclassOptions: Object.entries(SUBCLASSES).map(([value, label]) => ({ value, label, selected: value === sub.key })),
    filters,
    showLocked: view.showLocked,
    techniques,
    readyCount: all.filter(x => x.ready).length,
    emptyText: feral ? t("Lock.Feral") : surging ? t("EmptyFilter") : t("EmptySurge"),
    mutations: mutations(actor)
  };
}

/**
 * Wire the tab's controls. Safe to call on every render: listeners are attached
 * once per root element.
 * @param {HTMLElement} root     element containing .wb-root
 * @param {Actor} actor
 * @param {Function} rerender    re-render the tab after a view-only change
 */
export function bindTab(root, actor, rerender) {
  const el = root?.classList?.contains("wb-root") ? root : root?.querySelector(".wb-root");
  if (!el || el._wbBound) return;
  el._wbBound = true;

  el.addEventListener("click", async event => {
    const target = event.target.closest("[data-wb-action]");
    if (!target || !el.contains(target) || target.disabled) return;
    event.preventDefault();
    event.stopPropagation();
    await handleAction(target.dataset.wbAction, target, actor, rerender);
  });

  el.addEventListener("change", async event => {
    const target = event.target.closest("[data-wb-change]");
    if (!target) return;
    event.stopPropagation();
    if (target.dataset.wbChange === "subclass") await actor.setFlag(MODULE_ID, "subclass", target.value);
  });
}

async function handleAction(action, target, actor, rerender) {
  const view = stateFor(actor);
  const techId = target.closest("[data-tech]")?.dataset.tech;
  switch (action) {
    case "setFp": {
      const n = Number(target.dataset.value);
      return changeFp(actor, getFp(actor) === n ? n - 1 : n);
    }
    case "stepFp": return changeFp(actor, getFp(actor) + Number(target.dataset.step));
    case "bloodSurge": return toggleBloodSurge(actor);
    case "endTurnSave": return endOfTurnSave(actor);
    case "capSave": return capSave(actor);
    case "feralTurn": return feralTurn(actor);
    case "calmFeral": return calmFeral(actor);
    case "endFeral": return exitFeral(actor);
    case "removeMutation": return removeMutation(actor, target.dataset.id);
    case "useTech": return useTechnique(actor, techId, Number(target.dataset.option) || 0);
    case "sync": {
      const r = await syncAbilityItems(actor, { force: true });
      if (r) ui.notifications.info(tf("Info.Synced", r));
      return;
    }
    case "filter": view.filter = target.dataset.filter; return rerender();
    case "toggleLocked": view.showLocked = !view.showLocked; return rerender();
    case "toggleTech": view.open = view.open === techId ? null : techId; return rerender();
  }
}
