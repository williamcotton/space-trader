# Space Trader - How To Play (Current Build)

## Goal
Destroy enemy bases.

- In 1v1, reduce the opposing base HP to `0`.
- In FFA, eliminate opponents by reducing their bases to `0`; last surviving player wins.

## Core Idea
You play on a turn/phase system with:
- unit movement/combat on the hex map
- StarCraft-style harvesting (node -> cargo -> base-adjacent deposit)
- card play from hand (instants/tactics and unit deployment)
- stack + priority resolution for instant-speed interaction

## What You See
- Top bar: map, turn, mode selector, player resources, bot toggles, and debug actions.
- Network Match bar: server URL, online mode, faction selector, queue/match buttons.
- Canvas battlefield: units, bases, resource nodes, movement overlays, attack-target overlays, and animation feedback.
- Hand tray: current playable hand view. In networked matches, this is your local hand.
- Command stack panel: stack preview, history, priority controls, and phase/priority buttons.
- HUD panel: selected unit, combat preview, targeting prompts, and rejection messages.

## Controls
- `N`: End/advance phase.
- `U`: Select first active-player unit.
- Arrow keys: Move selected unit (tactical phase only).
- `A`: Enter/cancel attack-targeting mode for the selected attacker. Click a highlighted enemy unit or base to attack.
- `Esc`: Cancel pending card or attack targeting.
- `H`: Harvest with selected resource unit on a controlled node.
- `P`: Pass priority.
- `R`: Add debug no-op stack item.
- `T`: Add debug damage stack item.
- `C`: Add debug counter stack item.
- `B`: Toggle bot autopilot for player 2.
- `Shift+B`: Toggle bot autopilot for player 1.
- Mouse click on unit: select/deselect active-player unit.
- Mouse click while attack-targeting: attack a valid highlighted enemy target, or cancel/retarget depending on what was clicked.
- Mouse move: hover/target preview.
- Click card in hand tray: play card from hand (if legal).

## Turn Structure
1. **Start**
   - Active player draws 1 card.
2. **Economy**
   - Loaded harvesters on base-adjacent tiles auto-deposit cargo.
3. **Main**
   - Play main-speed cards (for now: unit deployment cards).
4. **Tactical**
   - Move units, attack, and harvest.
5. **End**
   - Node ownership updates by occupancy.

Press `N` to move through phases.

Default bot behavior:
- In 1v1 local play, `player_2` bot autopilot starts enabled and `player_1` starts disabled.
- In the 4-player local profile, bots default to disabled.
- You can toggle bots at runtime from the top bar.

## Cards and Costs
Card costs are shown like:
- `C2 A1` = 2 Credits + 1 Alloy
- `C1 F1` = 1 Credit + 1 Flux
- `C1 B1` = 1 Credit + 1 Biomass

Starting resources are non-zero:
- the starting player starts with `2` Credits
- non-starting players start with `5` Credits
- every player starts with `2` of their faction resource

## Playing Cards
Click a card in the hand tray.

Playability rules:
- You must be the player with **priority**.
- You must have enough resources.
- **Instant/tactic** cards can be played with priority.
- **Main-speed unit** cards require:
  - your turn,
  - Main phase,
  - empty stack,
  - open base-adjacent tile.

Result:
- Tactics go onto the stack and resolve after priority passes.
- Unit cards deploy a unit onto a base-adjacent tile.

## Harvesting Loop (Economy)
1. Move a **resource unit** onto a resource node.
2. End turn while occupying node to capture it.
3. On your next tactical phase, select that resource unit and press `H` to harvest.
4. Move loaded harvester to a tile adjacent to your base.
5. In Economy phase, deposit happens automatically.

Notes:
- Node control grants harvest rights; no passive node income.
- If a loaded harvester is destroyed, cargo is lost.

## Stack and Priority
- Players pass priority in seat order.
- In FFA, priority rotates through all live players.
- If all live players pass in sequence, the top stack item resolves.
- Empty-stack phase advancement also waits for the live-player pass cycle after the active player starts ending the phase.
- Counter cards currently target the **top stack item** only.

## Multiplayer Modes
- Local mode selector:
  - `Alpha Default`: 1v1 on `Frontier Belt`
  - `Alpha Three-Player FFA`: local 3-player FFA on `Frontier Triad`
  - `Alpha Free-For-All`: local 4-player FFA on `Frontier Crossroads`
- Network mode selector:
  - `1v1 PvP`: waits for 2 players
  - `3-Player FFA`: waits for 3 players
  - `4-Player FFA`: waits for 4 players

Current online play is trust-based command replay. The UI hides the opponent hand, but this is not secure hidden-information networking yet.

## If Something Fails
Check `Last Reject` in HUD. Common reasons:
- wrong phase
- not enough resources
- no priority
- no legal counter target
- no open deployment tile
- trying to harvest without control/selection/occupancy

## Quick First Match Flow
1. Press `U` to select a unit.
2. Press `N` until Tactical and move/attack.
3. To attack, press `A` with a selected attacker, then click a highlighted enemy unit or base.
4. Capture and harvest nodes with `H`.
5. Use `N` to reach Main and click a unit card to deploy.
6. Click instant cards during priority windows; use `P` to resolve stack.
7. Keep pressure on enemy bases until only you remain.
