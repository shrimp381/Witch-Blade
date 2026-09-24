# Witch-Blade

A Foundry VTT module for the **Witch-Blade** homebrew class (V2.5) on the D&D 5e system. It adds a **Ferality** tab to the character sheet, tracks Ferality Points and Blood Surge, runs the end-of-turn Wisdom save, draws from the Feral Instability table, and shows which surge techniques you can use right now.

Everything also works from **Argon Combat HUD**: the module adds standard dnd5e feature items for Blood Surge, the End-of-Turn Save and each surge technique, so they appear as HUD buttons.

- Foundry VTT v13
- D&D 5e system 5.x (tested against 5.3.3)
- No other modules required. Argon Combat HUD (DND5E) is optional.

## Install

In Foundry: **Add-on Modules → Install Module**, paste this manifest URL:

```
https://raw.githubusercontent.com/Shrimp381/witch-blade/main/module.json
```

Enable **Witch-Blade** in your world.

## Set up a character

1. Open the character, click **Sheet** in the window header, and choose **Witch-Blade Character Sheet**.
2. Open the new **Ferality** tab (droplet icon).
3. If the character has no Witch-Blade subclass item, pick the subclass from the dropdown on the tab.

The first time the sheet opens, the module:
- sets the sheet's secondary resource to **Ferality**, with the cap worked out from Witch-Blade level (5 / 7 / 9 / 10 / 12)
- adds the feature items (Blood Surge, End-of-Turn Save, and surge techniques for the subclass)

When the GM loads the world, the module creates the **Feral Instability** (1d10) and **Feral Mutations** (1d100) roll tables if they don't already exist.

## Using it

| Control | What it does |
|---|---|
| FP gauge | Click a node to set FP. The brass line marks the cap. Nodes past it are striped. |
| − / + | Adjust FP by 1. |
| **Blood Surge** | Bonus action. Adds the Blood Surge effect (+5 STR, or DEX for Seekers; +d4 force on melee attacks; advantage on STR checks and saves), gains 1 FP and spends a use. Click again to end it. Uses equal your proficiency bonus and come back on a short rest. |
| **End-of-Turn Save** | Choose Advantage, Normal or Disadvantage. DC 13 Wisdom save. Success: −1 FP (you can also end the surge). Failure: +1 FP and a draw from **Feral Instability**. Results 7 and 10 add their FP automatically. |
| Surge Techniques | Lists Core plus your subclass's techniques. They unlock once you are in Blood Surge and at or above the FP requirement. Advanced techniques unlock at level 11. Click one to read it and use it; techniques with several outcomes (for example, a save succeeded or failed) have one button per outcome. |

From Argon Combat HUD, the same items appear under Bonus Actions, Actions, Reactions and Free Actions. The module uses dnd5e's **Special** activation type for free actions, because that is what Argon lists under Free Actions.

## Settings

- **Create Witch-Blade tables** (default on)
- **Add surge techniques as feature items** (default on). Turn off to add only Blood Surge and the End-of-Turn Save.
- **Trance reduces Ferality on**: long rests (default), short and long rests, or never.

## Rules choices the code makes

These follow the V2.5 document where it is clear. Where it is not, the module does the following:
- The cap uses Witch-Blade class levels. Without a Witch-Blade class item, it uses total character level.
- Resting reduces FP by half the Witch-Blade level, rounded down, on a long rest. Change this in the settings.
- Advanced techniques with no stated action type are treated as **Actions**. The tab marks them with a dashed badge.
- The end-of-turn save is always offered. If you gained FP that turn, the dialog notes that the save is optional.

## Not yet included

The Ferality cap save and Feral State (1d4 + overflow rounds, then exhaustion and a mutation roll) are shown as a warning on the tab but not automated yet. The same goes for class features other than Blood Surge (Feral Edge, Bestial Vitality and so on) and the alchemy items.

## For macro writers

`game.modules.get("witch-blade").api` exposes `toggleBloodSurge(actor)`, `endOfTurnSave(actor)`, `useTechnique(actor, id)`, `drawInstability(actor)`, `syncAbilityItems(actor)`, `getFp(actor)`, `setFp(actor, n)` and `feralityCap(level)`.
