# Space Trader - How To Play (Current Build)

## Goal
Destroy the enemy base (reduce its HP to 0).

## Core Idea
You play on a turn/phase system with:
- unit movement/combat on the hex map
- StarCraft-style harvesting (node -> cargo -> base-adjacent deposit)
- card play from hand (instants/tactics and unit deployment)
- stack + priority resolution for instant-speed interaction

## What You See
- Canvas HUD (top-left): turn, phase, active player, priority, resources, winner, rejection messages.
- Hand tray (bottom): active player's hand and deck count (`Hand X | Deck Y`).
- Stack debug panel (bottom-right): quick stack controls and stack preview.

## Controls
- `N`: End/advance phase.
- `U`: Select first active-player unit.
- Arrow keys: Move selected unit (tactical phase only).
- `A`: Attack first valid target in range (selected combat unit).
- `H`: Harvest with selected resource unit on a controlled node.
- `P`: Pass priority.
- `R`: Add debug no-op stack item.
- `T`: Add debug damage stack item.
- `C`: Add debug counter stack item.
- `B`: Toggle bot autopilot for player 2.
- `Shift+B`: Toggle bot autopilot for player 1.
- Mouse click on unit: select/deselect active-player unit.
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
- `player_2` bot autopilot starts enabled.
- `player_1` bot autopilot starts disabled.
- You can toggle either at runtime (`B` / `Shift+B` or debug panel buttons).

## Cards and Costs
Card costs are shown like:
- `C2 A1` = 2 Credits + 1 Alloy
- `C1 F1` = 1 Credit + 1 Flux
- `C1 B1` = 1 Credit + 1 Biomass

Starting resources are non-zero:
- each player starts with `3` Credits
- plus `2` of their faction resource

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
- Players alternate priority responses.
- If both players pass in sequence, top stack item resolves.
- Counter cards currently target the **top stack item** only.

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
3. Capture and harvest nodes with `H`.
4. Use `N` to reach Main and click a unit card to deploy.
5. Click instant cards during priority windows; use `P` to resolve stack.
6. Keep pressure on enemy base until HP reaches 0.
