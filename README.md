# Witch-Blade

A Foundry VTT module for the **Witch-Blade** homebrew class (V2.5) on the D&D 5e system. It adds a **Ferality** tab that tracks Ferality Points and Blood Surge, runs the end-of-turn save and the Ferality cap save, automates Feral State, and shows which surge techniques you can use right now.

- **Two sheet options:** the default D&D 5e character sheet ("Witch-Blade Character Sheet"), or **Tidy 5e Sheets** (classic or new layout). Use whichever you prefer.
- **Argon Combat HUD:** Blood Surge, the saves and every surge technique are standard feature items, so they appear as HUD buttons.
- **Features tab:** surge techniques get their own **Surge Techniques** section on both sheets.

Requirements: Foundry VTT v13, D&D 5e system 5.x (tested against 5.3.3). Tidy 5e Sheets and Argon Combat HUD are optional.

## Install

In Foundry: **Add-on Modules → Install Module**, paste this manifest URL:

```
https://raw.githubusercontent.com/Shrimp381/witch-blade/main/module.json
```

Enable **Witch-Blade** in your world.

## Set up a character

A character counts as a Witch-Blade if any of these are true:
- it has a class item with the identifier `witch-blade`
- it uses the **Witch-Blade Character Sheet**
- you right-click it in the **Actors** sidebar and choose **Witch-Blade: turn on/off for this character** (the easiest option with Tidy)

Then:
- **Default sheet:** click **Sheet** in the character window's header and choose **Witch-Blade Character Sheet**. The Ferality tab has a droplet icon.
- **Tidy 5e Sheets:** keep your Tidy sheet. The **Ferality** tab appears on Witch-Blade characters automatically.

If the character has no Witch-Blade subclass item, pick the subclass from the dropdown on the tab.

The first time the tab opens, the module sets the sheet's secondary resource to **Ferality**, with the cap worked out from Witch-Blade level (5 / 7 / 9 / 10 / 12). It also adds the feature items. When the GM loads the world, it creates the **Feral Instability** and **Feral Mutations** roll tables if they don't already exist.

## The Ferality tab

| Control | What it does |
|---|---|
| FP gauge | Click a node to set FP. The brass line marks the cap. Nodes past it are striped. |
| **Blood Surge** | Bonus action. Adds the Blood Surge effect (+5 STR, or DEX for Seekers; extra force damage on melee attacks; advantage on STR checks and saves), gains 1 FP and spends a use. Click again to end it. |
| **End-of-Turn Save** | DC 13 Wisdom save, rolled with Advantage, Normal or Disadvantage. Success: −1 FP, and you can also end the surge. Failure: +1 FP and a draw from Feral Instability. |
| **Ferality cap** | When FP reaches the cap, the **Ferality Cap Save** opens automatically (DC 13 + 1 per FP over the cap). Success keeps control until the end of your next turn. Failure starts **Feral State**. |
| **Feral State** | Lasts 1d4 rounds + 1 per FP over the cap. It adds resistance to nonmagical bludgeoning, piercing and slashing damage. Techniques, Blood Surge and the end-of-turn save are locked. When it ends: +2 exhaustion, FP resets to 0, Blood Surge ends, and a mutation is rolled and listed on the tab. |
| Mutations | Listed on the tab. Remove one with × (for example, after a Lysis purge). |
| Surge Techniques | Core plus your subclass's techniques. They unlock once you are in Blood Surge and at the FP requirement; Advanced techniques unlock at level 11. Click one to read it and use it. |

### In combat (automatic)

With **Automate combat turns** on, advancing the combat tracker runs these steps.

**End of the Witch-Blade's turn:**
- **In Blood Surge, below the cap:** the End-of-Turn Save opens. It is skipped if she gained FP that turn.
- **At or over the cap:** Feral Instability is rolled. When her held control runs out, the cap save opens again.
- **In Feral State:** one Feral round counts down. When the last one ends, Feral State ends as described above.

**Start of the Witch-Blade's turn, in Feral State:** Feral Instability is rolled to decide her actions. Result 10 adds a Feral round instead of FP.

Steps run on the client of an active player who owns the character, or on the GM's if no owner is online.

### Out of combat

While Feral outside combat, the tab shows **Feral turn**, which rolls Instability and counts a round down. It also shows **Calm down**. Calm down makes a Blood Surge save: success ends Feral State; failure rolls Instability and loses 1 FP. If FP drops below the cap before a successful save, she comes out with no exhaustion and keeps her FP. GMs also get **End Feral State**.

## Argon Combat HUD

Argon sorts items by activation type:
- **Blood Surge:** Bonus Actions
- **End-of-Turn Save** and **Ferality Cap Save:** Free Actions (dnd5e's *Special* type)
- **Each technique:** its own action type

Clicking a technique asks which outcome happened when there is more than one, for example whether the save succeeded.

## Settings

- **Create Witch-Blade tables** (on)
- **Add surge techniques as feature items** (on)
- **Automate combat turns** (on)
- **Prompt the end-of-turn save** (on)
- **Trance reduces Ferality on:** long rests (default), short and long rests, or never

## Rules choices the code makes

- The cap uses Witch-Blade class levels. Without a Witch-Blade class item, it uses total character level.
- Resting reduces FP by half the Witch-Blade level, rounded down, on a long rest. You can change this in the settings.
- Advanced techniques with no stated action type are treated as **Actions**. The tab marks them with a dashed badge.
- "Keep control until the end of your next turn" counts the Witch-Blade's own turn ends. If the save happens on her own turn, that turn's end doesn't count.
- dnd5e has no actor-wide "advantage on melee attacks" setting, so Feral State reminds you to roll melee attacks with advantage instead of applying it.

## Not yet included

- Class features other than Blood Surge and Ferality (Feral Edge, Bestial Vitality and so on)
- Hardened Ferality, Controlled Tap and the level 17–20 capstones
- The alchemy items

## For macro writers

`game.modules.get("witch-blade").api` has:
- `toggleBloodSurge`, `endOfTurnSave`, `capSave`, `useTechnique`, `drawInstability`
- `enterFeral`, `exitFeral`, `feralTurn`, `calmFeral`
- `syncAbilityItems`, `getFp`, `setFp`, `feralityCap`
