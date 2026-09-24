/**
 * Witch-Blade rules data (V2.5 WIP).
 * Shared by the sheet tab and (later) compendium builders.
 * Edit numbers here to rebalance — no other code needs to change.
 */

/** Ferality cap by Witch-Blade level. */
export const FP_CAP_STEPS = [
  { level: 14, cap: 12 },
  { level: 11, cap: 10 },
  { level: 9, cap: 9 },
  { level: 5, cap: 7 },
  { level: 1, cap: 5 }
];

export function feralityCap(level) {
  return (FP_CAP_STEPS.find(s => level >= s.level) ?? FP_CAP_STEPS.at(-1)).cap;
}

export function proficiencyFor(level) {
  return Math.ceil(Math.max(1, level) / 4) + 1;
}

export const SUBCLASSES = {
  seeker: "Seeker",
  executioner: "Executioner",
  sentinel: "Sentinel",
  "veil-splitter": "Veil-Splitter"
};

/** End-of-turn Blood Surge save DC. */
export const SURGE_SAVE_DC = 13;

/**
 * Surge techniques.
 * group: "core" or a subclass key. tier: "standard" | "advanced" (advanced unlocks at level 11).
 * fp: list of possible FP changes. One entry = fixed; several = player picks the outcome.
 * actionAssumed: true where the source text doesn't state an action type.
 */
export const TECHNIQUES = [
  // ── Core ─────────────────────────────────────────────
  { id: "phantom-step", img: "icons/creatures/magical/humanoid-silhouette-dashing-blue.webp", name: "Phantom Step", group: "core", tier: "standard", action: "bonus", req: 1,
    fp: [{ d: 1 }],
    text: "Until the end of your turn your movement does not provoke opportunity attacks. You may move through hostile creatures' spaces (but not end your turn there). If you move at least 15 feet, gain +2 AC until the start of your next turn." },
  { id: "reset-pulse", img: "icons/magic/life/cross-area-circle-green-white.webp", name: "Reset Pulse", group: "core", tier: "standard", action: "action", req: 2,
    fp: [{ d: -1, label: "Save succeeded" }, { d: 0, label: "Save failed" }],
    save: { ability: "wis", dc: 13 },
    text: "End one condition affecting you: Charmed, Frightened, Grappled, Restrained, Stunned, or Blinded. Then make a DC 13 Wisdom saving throw. On a success, reduce your FP by 1. On a failure, no reduction." },
  { id: "bone-lock-grasp", img: "icons/magic/control/debuff-chains-ropes-red.webp", name: "Bone-Lock Grasp", group: "core", tier: "standard", action: "reaction", req: 3,
    fp: [{ d: 1 }], dc: "8 + Prof + STR",
    text: "When you hit a creature with a melee weapon attack, it must succeed on a Strength saving throw (DC 8 + Prof + STR) or its speed becomes 0 and it cannot take reactions until the start of your next turn." },
  { id: "carve-the-weak", img: "icons/skills/melee/blade-tip-chipped-blood-red.webp", name: "Carve the Weak", group: "core", tier: "standard", action: "action", req: 3,
    fp: [{ d: 1 }],
    text: "Choose a creature within 5 ft. Make a single melee weapon attack with advantage. If the target is below 25% HP, the hit becomes an automatic crit. If you kill it, move up to your speed without provoking opportunity attacks." },
  { id: "blood-slick-advance", img: "icons/skills/melee/blood-slash-foam-red.webp", name: "Blood-Slick Advance", group: "core", tier: "standard", action: "reaction", req: 4,
    fp: [{ d: 1 }],
    text: "When you reduce a creature to 0 HP, you may use your reaction to move up to your speed toward another enemy and make an immediate melee weapon attack against them." },
  { id: "reapers-carve", img: "icons/magic/death/skull-horned-goat-pentagram-red.webp", name: "Reaper's Carve", group: "core", tier: "standard", action: "action", req: 5,
    fp: [{ d: -2 }], dc: "8 + Prof + STR",
    text: "When you hit with a melee attack: double all damage dice. All creatures within 10 ft. must make a Wisdom save (DC 8 + Prof + STR) or be frightened until the end of your next turn." },

  // ── Seeker ───────────────────────────────────────────
  { id: "ghoststep-assault", img: "icons/magic/perception/silhouette-stealth-shadow.webp", name: "Ghoststep Assault", group: "seeker", tier: "standard", action: "bonus", req: 1,
    fp: [{ d: 1 }],
    text: "Teleport up to 10 ft before a melee weapon attack. That attack has advantage." },
  { id: "lunging-precision", img: "icons/skills/melee/strike-sword-stabbed-brown.webp", name: "Lunging Precision", group: "seeker", tier: "standard", action: "action", req: 1,
    fp: [{ d: 1 }],
    text: "Make a melee weapon attack with +10 feet of reach. On hit, the target's movement is reduced by 10 feet until the end of its next turn." },
  { id: "pinpoint-hemorrhage", img: "icons/skills/wounds/blood-spurt-spray-red.webp", name: "Pinpoint Hemorrhage", group: "seeker", tier: "standard", action: "bonus", req: 2,
    fp: [{ d: 1 }],
    text: "Your next melee weapon hit causes the target to begin bleeding: it takes 1d6 damage at the start of each of its turns for 1 minute (DC 13 Con save ends early)." },
  { id: "veil-of-control", img: "icons/magic/perception/third-eye-blue-red.webp", name: "Veil of Control", group: "seeker", tier: "standard", action: "bonus", req: 2,
    fp: [{ d: -1, label: "Insight 13–19" }, { d: -2, label: "Insight 20+" }, { d: 0, label: "Insight failed" }],
    text: "If not within 10 ft of a hostile and you haven't attacked this turn, make a DC 13 Insight check: success = reduce FP by 1, roll of 20+ = reduce by 2." },
  { id: "nerve-sever", img: "icons/skills/targeting/target-strike-triple-blue.webp", name: "Nerve Sever", group: "seeker", tier: "standard", action: "bonus", req: 3,
    fp: [{ d: 1 }], dc: "8 + Prof + DEX",
    text: "Choose a creature within 30 feet that is below its maximum HP. Until the end of your next turn, its speed is halved, it has disadvantage on Dexterity saves against your effects, and the next time it takes melee weapon damage from you it must make a Constitution save (DC 8 + Prof + DEX) or lose its reaction." },
  { id: "shadow-severance", img: "icons/magic/unholy/strike-body-life-soul-purple.webp", name: "Shadow Severance", group: "seeker", tier: "standard", action: "action", req: 4,
    fp: [{ d: 3 }], dc: "8 + Prof + DEX",
    text: "Guaranteed melee hit. Target makes a Con save (DC 8 + Prof + DEX): fail = +6d8 necrotic and blinded, success = half necrotic, not blinded." },

  // ── Executioner ─────────────────────────────────────
  { id: "guttural-roar", img: "icons/magic/sonic/scream-wail-shout-teal.webp", name: "Guttural Roar", group: "executioner", tier: "standard", action: "free", req: 1,
    fp: [{ d: 1 }], dc: "8 + Prof + STR",
    text: "Enemies within 5 ft must make a Wisdom save (DC 8 + Prof + STR) or lose reactions until their next turn." },
  { id: "flesh-rend", img: "icons/creatures/claws/claw-scaled-red.webp", name: "Flesh Rend", group: "executioner", tier: "standard", action: "bonus", req: 2,
    fp: [{ d: 1 }],
    text: "Until the end of your turn, your melee attacks deal +1d6 damage and cause targets to bleed (1d4 per round)." },
  { id: "chain-cleaver", img: "icons/skills/melee/strike-axe-blood-red.webp", name: "Chain Cleaver", group: "executioner", tier: "standard", action: "action", req: 3,
    fp: [{ d: 1 }],
    text: "Make a sweeping melee attack against up to 3 adjacent creatures (roll for each hit)." },
  { id: "shatter-the-pulse", img: "icons/skills/wounds/anatomy-organ-heart-red.webp", name: "Shatter the Pulse", group: "executioner", tier: "standard", action: "bonus", req: 4,
    fp: [{ d: -2, label: "Con save succeeded" }, { d: -1, label: "Con save failed" }],
    save: { ability: "con", dc: 13 },
    text: "Take 2d6 force damage (ignores resistance). Until the end of your next turn, you gain resistance to all damage and advantage on Wisdom and Constitution saves. Then make a DC 13 Con save: success = reduce FP by 2, failure = reduce FP by 1." },
  { id: "sever-the-line", img: "icons/skills/melee/sword-damaged-broken-glow-red.webp", name: "Sever the Line", group: "executioner", tier: "standard", action: "action", req: 4,
    fp: [{ d: 2 }], dc: "8 + STR",
    text: "Hit a Large or smaller creature. It must make a Strength save (DC 8 + STR mod) or become stunned until the end of your next turn. On a failed save, you may immediately make a melee attack against another creature within reach." },
  { id: "final-impact", img: "icons/magic/sonic/explosion-impact-shock-wave.webp", name: "Final Impact", group: "executioner", tier: "standard", action: "action", req: 5,
    fp: [{ d: 3 }],
    text: "Melee attack with +5 to hit. On hit, deal +6d10 damage and knock the target prone." },

  // ── Sentinel ────────────────────────────────────────
  { id: "iron-grasp", img: "icons/skills/melee/swords-parry-block-yellow.webp", name: "Iron-Grasp", group: "sentinel", tier: "standard", action: "reaction", req: 1,
    fp: [{ d: 1 }],
    text: "When an ally within 5 feet is targeted by an attack, impose disadvantage on the attack roll. If it still hits, you may choose to take half the damage instead of your ally." },
  { id: "aegis-burst", img: "icons/magic/defensive/shield-barrier-deflect-teal.webp", name: "Aegis Burst", group: "sentinel", tier: "standard", action: "bonus", req: 2,
    fp: [{ d: 1 }],
    text: "Pulse of force. Creatures within 10 ft must make a Strength save or be pushed 10 ft and knocked prone." },
  { id: "counterhold", img: "icons/magic/control/debuff-chains-shackle-movement-red.webp", name: "Counterhold", group: "sentinel", tier: "standard", action: "reaction", req: 2,
    fp: [{ d: 1 }],
    text: "When a creature misses you with a melee attack, you may automatically grapple it until the end of your next turn. While grappled, it cannot Disengage, Dash, or teleport." },
  { id: "blood-fused-guard", img: "icons/magic/unholy/barrier-shield-glowing-pink.webp", name: "Blood-Fused Guard", group: "sentinel", tier: "standard", action: "bonus", req: 3,
    fp: [{ d: 1 }],
    text: "Until the start of your next turn: +2 AC to you and allies within 10 ft, and resistance to bludgeoning, piercing and slashing." },
  { id: "bastion-rhythm", img: "icons/magic/holy/barrier-shield-winged-blue.webp", name: "Bastion Rhythm", group: "sentinel", tier: "standard", action: "bonus", req: 3,
    fp: [{ d: -2, label: "Wis save succeeded" }, { d: -1, label: "Wis save failed" }],
    save: { ability: "wis", dc: 13 },
    text: "When you intercept an attack against an ally (using a reaction or feature) and they take no damage, make a DC 13 Wisdom save. Success = reduce FP by 2, failure = reduce FP by 1. Must be used on the same turn the interception occurs." },
  { id: "fortress-breaker", img: "icons/skills/melee/shield-damaged-broken-orange.webp", name: "Fortress Breaker", group: "sentinel", tier: "standard", action: "action", req: 5,
    fp: [{ d: 3 }],
    text: "Melee attack: double weapon damage + 4d10 force. Con save: fail = stunned and prone, success = just prone." },

  // ── Veil-Splitter ───────────────────────────────────
  { id: "rift-step", img: "icons/magic/movement/portal-vortex-orange.webp", name: "Rift Step", group: "veil-splitter", tier: "standard", action: "bonus", req: 1,
    fp: [{ d: 1 }],
    text: "Teleport 15 ft. Gain resistance to force and psychic damage until the start of your next turn." },
  { id: "veinlash-channel", img: "icons/magic/unholy/hand-weapon-glow-black-green.webp", name: "Veinlash Channel", group: "veil-splitter", tier: "standard", action: "bonus", req: 2,
    fp: [{ d: 1 }], dc: "8 + Prof + INT",
    text: "Until the end of your turn, your melee weapon attacks deal an extra 1d4 force damage. If you hit a creature affected by a magical condition (hex, hunter's mark, bane, etc.), it must make a Con save (DC 8 + Prof + INT) or be disoriented, granting advantage on the next attack roll against it before the end of your next turn." },
  { id: "feedback-collapse", img: "icons/magic/control/hypnosis-mesmerism-swirl.webp", name: "Feedback Collapse", group: "veil-splitter", tier: "standard", action: "bonus", req: 3,
    fp: [{ d: -2, label: "Int save succeeded" }, { d: -1, label: "Int save failed (take 1d6 psychic)" }],
    save: { ability: "int", dc: 14 },
    text: "End one magical effect on yourself (hex, curse, charm, etc.). Then make a DC 14 Intelligence save: success = reduce FP by 2; failure = take 1d6 psychic damage and reduce FP by 1." },
  { id: "arcane-mutation-spike", img: "icons/magic/light/explosion-star-small-teal-purple.webp", name: "Arcane Mutation Spike", group: "veil-splitter", tier: "standard", action: "bonus", req: 4,
    fp: [{ d: 2 }], dc: "8 + Prof + INT",
    text: "Choose a creature within 10 ft. It takes 3d6 force damage and must make a Wisdom save (DC 8 + Prof + INT) or be confused until the end of its next turn. Then roll 1d100: on 01–15 gain a temporary Feral Mutation (1 minute); on a natural 1 the mutation is permanent." },
  { id: "veil-tearing-ritual", img: "icons/magic/symbols/runes-star-pentagon-magenta.webp", name: "Veil-Tearing Ritual", group: "veil-splitter", tier: "standard", action: "action", req: 4,
    fp: [{ d: 2 }],
    text: "Choose one: Regenerative Confluence (heal 2 × Witch-Blade level + INT and end one condition); Arcane Gravity Field (creatures within 10 ft treat the area as difficult terrain and must make a Strength save or have speed 0 until end of turn); Blood-Memory Surge (regain one expended 2nd-level or lower spell slot, or 3rd if below half HP). Then roll 1d100: 01–15 = temporary mutation (10 minutes); natural 1 = permanent." },
  { id: "soulburn-arc", img: "icons/magic/unholy/beam-ringed-impact-purple.webp", name: "Soulburn Arc", group: "veil-splitter", tier: "standard", action: "action", req: 5,
    fp: [{ d: 3 }], dc: "8 + Prof + CON",
    text: "As part of an Attack action, detonate a 20-foot radius burst centred on yourself. Creatures of your choice make a Con save (DC 8 + Prof + CON). Fail: 4d8 force and one effect of your choice — Unravel (disadvantage on saves until end of your next turn) or Fracture (speed halved, no reactions until end of your next turn). Success: half damage, no effect. Afterwards you take 1d6 force damage that cannot be reduced." },

  // ── Advanced (level 11+) ────────────────────────────
  { id: "apex-carve", img: "icons/skills/melee/strike-slashes-red.webp", name: "Apex Carve", group: "core", tier: "advanced", action: "action", actionAssumed: true, req: 7,
    fp: [{ d: 3 }], dc: "8 + Prof + STR",
    text: "Make a melee weapon attack. On hit it automatically crits. Target makes a Con save (DC 8 + Prof + STR). Fail: stunned and takes 2d6 bleed each round for 1 minute. Success: half bleed, no stun. If it kills the target, regain 1 use of Blood Surge (1/long rest)." },
  { id: "controlled-collapse", img: "icons/magic/holy/meditation-chi-focus-blue.webp", name: "Controlled Collapse", group: "core", tier: "advanced", action: "bonus", req: 9,
    fp: [{ d: -3, label: "Wis save succeeded" }, { d: -1, label: "Wis save failed (take 2d6 psychic)" }],
    save: { ability: "wis", dc: 15 },
    text: "DC 15 Wisdom save: success = reduce FP by 3; failure = reduce FP by 1 and take 2d6 psychic. If below half HP, gain resistance to all damage until the start of your next turn." },
  { id: "bloodline-lure", img: "icons/magic/perception/eye-ringed-glow-angry-red.webp", name: "Bloodline Lure", group: "seeker", tier: "advanced", action: "action", actionAssumed: true, req: 6,
    fp: [{ d: 2 }],
    text: "Choose a creature you've damaged in the last 10 minutes. Until your next long rest, sense its direction and distance unerringly, even across planes. Your first attack against it each round deals +3d6 psychic and ignores resistance. If it dies, reduce FP by 2." },
  { id: "ghost-chain-assault", img: "icons/creatures/magical/humanoid-silhouette-glowing-pink.webp", name: "Ghost Chain Assault", group: "seeker", tier: "advanced", action: "action", actionAssumed: true, req: 7,
    fp: [{ d: 3 }], oncePerSurge: true,
    text: "Melee weapon attack. On hit: +4d10 force, then teleport 15 ft and make a second melee attack against a different creature. If the second target is bloodied, it crits. Once per Blood Surge." },
  { id: "carnage-apex", img: "icons/skills/melee/strike-sword-blood-red.webp", name: "Carnage Apex", group: "executioner", tier: "advanced", action: "action", actionAssumed: true, req: 7,
    fp: [{ d: 3 }],
    text: "Melee attack. On hit: +6d10. If the target drops to 10 HP or less or dies, move and make another melee attack. The follow-up deals +2d10 and ignores resistance." },
  { id: "feral-core-release", img: "icons/creatures/abilities/fang-tooth-blood-red.webp", name: "Feral Core Release", group: "executioner", tier: "advanced", action: "bonus", req: 10,
    fp: [{ d: -3, label: "Con save succeeded" }, { d: 1, label: "Con save failed (take 2d10 force)" }],
    save: { ability: "con", dc: 15 },
    text: "Gain advantage on melee attacks for 1 minute and +1d6 force on attacks. DC 15 Con save: success = reduce FP by 3; failure = gain 1 FP and take 2d10 force damage." },
  { id: "immovable-verdict", img: "icons/magic/earth/strike-fist-stone.webp", name: "Immovable Verdict", group: "sentinel", tier: "advanced", action: "action", actionAssumed: true, req: 7,
    fp: [{ d: 2 }], dc: "8 + Prof + STR",
    text: "Attack up to 2 targets. Each must make a Strength save (DC 8 + Prof + STR) or be knocked prone and silenced. If both fail, stun one until your next turn." },
  { id: "bastion-unleashed", img: "icons/magic/defensive/barrier-shield-dome-deflect-teal.webp", name: "Bastion Unleashed", group: "sentinel", tier: "advanced", action: "bonus", req: 10,
    fp: [{ d: -3, label: "Wis save succeeded" }, { d: -1, label: "Wis save failed" }, { d: 0, label: "Took no damage" }],
    save: { ability: "wis", dc: 15 }, oncePerSurge: true,
    text: "Allies within 10 ft gain +3 AC and resistance to all damage until the start of your next turn. If you take damage, make a DC 15 Wisdom save: success = reduce FP by 3, failure = reduce FP by 1. Once per Blood Surge." },
  { id: "splinter-reality", img: "icons/magic/light/explosion-star-glow-silhouette.webp", name: "Splinter Reality", group: "veil-splitter", tier: "advanced", action: "action", actionAssumed: true, req: 7,
    fp: [{ d: 3 }], dc: "8 + Prof + INT",
    text: "20 ft radius sphere within 60 ft. Con save (DC 8 + Prof + INT). Fail: 6d8 force, blinded, and disadvantage on concentration. Success: half damage. Affects invisible and ethereal creatures and ignores total cover." },
  { id: "arc-symbiotic-surge", img: "icons/magic/control/energy-stream-link-spiral-teal.webp", name: "Arc-Symbiotic Surge", group: "veil-splitter", tier: "advanced", action: "action", actionAssumed: true, req: 10,
    fp: [{ d: -3, label: "Int save succeeded" }, { d: 0, label: "Int save failed (temporary mutation)" }],
    save: { ability: "int", dc: 15 },
    text: "Choose one: end 1 Instability effect, regain a 2nd/3rd level slot, or gain temp HP = INT × 3 and resistance to force and psychic. Then DC 15 Int save: success = reduce FP by 3; failure = gain a temporary mutation (1 minute)." }
];

/** Core Foundry icons for the non-technique abilities and effects. */
export const ICONS = {
  bloodSurge: "icons/magic/unholy/strike-beam-blood-large-red-purple.webp",
  endTurnSave: "icons/magic/control/silhouette-hold-change-blue.webp",
  capSave: "icons/magic/life/heart-shadow-red.webp",
  feral: "icons/creatures/abilities/wolf-heads-swirl-purple.webp"
};

export const ACTION_LABELS = {
  action: "Action",
  bonus: "Bonus",
  reaction: "Reaction",
  free: "Free"
};

/** Feral Instability Table (1d10). Used to seed the "Feral Instability" RollTable. */
export const INSTABILITY = [
  { roll: 1, name: "Red Mist", text: "On your next turn, attack the nearest creature uncontrollably using all movement and actions. If the target is an ally, make a BS save. Success: you lose your action. Failure: attack." },
  { roll: 2, name: "Splintering Sanity", text: "Take 2d8 psychic damage and have disadvantage on all Int/Wis/Cha checks until your next turn." },
  { roll: 3, name: "Predator's Whispers", text: "Cannot distinguish allies from enemies. Disadvantage on attacks unless the target is bleeding. Lasts until the end of your next turn." },
  { roll: 4, name: "Gnashing Pulse", text: "DC 15 Con save or gain 1 level of exhaustion. Gain a bonus action bite attack (1d4 + STR) until combat ends." },
  { roll: 5, name: "Corrupted Memory", text: "Forget an ally's identity. Until your next turn, they cannot heal or aid you unless they succeed on a DC 15 Persuasion check." },
  { roll: 6, name: "Self-Flensing Surge", text: "Take 1d10 slashing damage (ignores resistance). Your next melee attack deals +2d6 necrotic." },
  { roll: 7, fp: 1, name: "Bloodsoaked Howl", text: "All within 10 ft make a DC 14 Wis save or be frightened for 1 round. You gain 1 FP." },
  { roll: 8, name: "Mutation Lash", text: "Partial mutation prevents casting and speech. Disadvantage on all Charisma and Intelligence checks. Ends when you exit Blood Surge." },
  { roll: 9, name: "Stalker's Obsession", text: "You must target the creature who last harmed you. Disadvantage against all others." },
  { roll: 10, fp: 2, feralRounds: 1, name: "Shattered Restraint", text: "Gain 2 FP and roll on the Feral Mutation table. May reroll this once per Blood Surge; if so, take 4d6 psychic damage. In Feral State: increase rounds by 1 instead of gaining 2 FP, roll on the Feral Mutation table, and you cannot reroll." }
];

/** Ferality Mutations (1d100), rolled when Feral State ends. */
export const MUTATIONS = [
  { min: 1, max: 4, name: "Beast-Eyes", text: "Irises permanently glow amber-red. Advantage on sight-based Perception, disadvantage on Persuasion." },
  { min: 5, max: 7, name: "Clawed Hands", text: "Unarmed strikes deal 1d6 slashing damage." },
  { min: 8, max: 10, name: "Blood Hunger", text: "When a creature within 20 ft drops to 0 HP, DC 12 Wis save or move 10 ft toward it and attack if within 5 ft." },
  { min: 11, max: 13, name: "Partial Regeneration", text: "Heal HP equal to Prof at the start of each turn while below half HP. Healing spells restore half as much." },
  { min: 14, max: 16, name: "Thickened Skin", text: "+1 AC while not in heavy armor, –1 to Dexterity saves." },
  { min: 17, max: 20, name: "Carnal Aura", text: "Beasts and monstrosities react with fear or aggression. Advantage on Intimidation, disadvantage on Animal Handling." },
  { min: 21, max: 25, name: "Beast-Twitch", text: "+1 initiative. Cannot maintain concentration on spells for more than 1 minute." },
  { min: 26, max: 30, name: "Extended Fangs", text: "Bonus action bite attack (1d4 + STR piercing)." },
  { min: 31, max: 35, name: "Night-Sweats", text: "DC 13 Wis save after long rests or gain no benefit." },
  { min: 36, max: 40, name: "Hardened Spine", text: "Cannot be knocked prone unless you choose. Gait becomes unsettling." },
  { min: 41, max: 45, name: "Feral Whispers", text: "Advantage on saves vs. frightened, disadvantage on Insight." },
  { min: 46, max: 50, name: "Splinter-Vein Armor", text: "In Brutal Rhythm: +1 AC and resistance to slashing; no temp HP. Reroll if not Executioner." },
  { min: 51, max: 55, name: "Keen Smell", text: "Advantage on smell-based Perception; strong odors may poison you (DC 10 Con)." },
  { min: 56, max: 60, name: "Split Pupils", text: "See invisible creatures within 10 ft. Gain light sensitivity." },
  { min: 61, max: 65, name: "Muscle Rip", text: "+1 base Strength (max 20). Disadvantage on magical exhaustion saves." },
  { min: 66, max: 70, name: "Limb Twitch", text: "Extra reaction attack once per short rest. Visible, involuntary twitch." },
  { min: 71, max: 75, name: "Savage Reflex", text: "When surprised, act in the first round but must draw blood." },
  { min: 76, max: 80, name: "Disjointed Voice", text: "Advantage on Intimidation, disadvantage on Persuasion." },
  { min: 81, max: 85, name: "Tremor Step", text: "Jump distance doubled. Disadvantage on Stealth checks involving movement." },
  { min: 86, max: 90, name: "Enhanced Scent Memory", text: "Track a creature you've smelled in the last 24 hours." },
  { min: 91, max: 95, name: "Pack Echo", text: "Detect unseen creatures within 30 ft; cannot be surprised while conscious. Disadvantage on Insight vs humanoids." },
  { min: 96, max: 99, name: "Resonant Howl", text: "Once per long rest, roar to frighten creatures (Wis save, DC 8 + Prof + CHA)." },
  { min: 100, max: 100, name: "Beastbound Core", text: "Ferality cannot be reduced below 1. Resistance to all damage in Blood Surge." }
];
