# Space Trader - Game Design (Living Draft)

Last updated: March 18, 2026

## Purpose
This is the working game design document for Space Trader.
It should evolve continuously as we prototype, test, and make decisions.

## High Concept
Space Trader is a turn-based, hex-grid tactics game that blends deckbuilding CCG mechanics with army building and battlefield positioning.
Players gather resources, play cards from hand, deploy units, and create synergies/combo lines to outplay the opponent.

## Player Fantasy
- Build a custom deck and army identity.
- Control a battlefield like a tactical commander.
- Discover and execute satisfying card/unit synergies.
- Feel smart from resource planning, positioning, and combo timing.

## Core Pillars
- Deckbuilding matters: your card choices define your strategy.
- Tactical positioning matters: hex-grid movement and terrain create meaningful decisions.
- Economy matters: resource gathering and spending are central.
- Synergy matters: cards/units should create powerful interactions and combo moments.
- Clarity matters: synergies should have strong visual feedback and readable outcomes.

## Genre Blend (Current Direction)
- CCG elements (inspired by MTG): deck construction, hand management, card costs/effects, combos.
- RTS army flavor (inspired by StarCraft): build an army and leverage composition.
- Turn-based tactics layer: hex-grid movement, zone control, and sequencing.

## Core Loop (Match Level)
1. Build deck before match.
2. Start match with opening hand (currently target: 7 cards).
3. Each turn:
   - Gain cards (currently target: draw 1 card/turn).
   - Gather resources via units/structures.
   - Spend resources to cast cards from hand.
   - Move units on hex grid and take tactical actions.
   - Resolve effects, synergies, and end-step triggers.
4. Win by completing match objective (TBD: destroy base, VP control, or commander elimination).

## Turn Structure (Draft)
1. Start Phase
   - Draw card.
   - Apply start-of-turn effects.
2. Economy Phase
   - Resource collection and income effects.
3. Main Phase
   - Play cards from hand by paying costs.
   - Deploy units/structures.
4. Tactical Phase
   - Move units on hexes.
   - Attack/use abilities.
5. End Phase
   - Resolve end-of-turn triggers and cleanup.

## Card System (Draft)
- Deck construction and deck editor are first-class features.
- You can only cast cards currently in your hand.
- Cards have costs and effects.
- Candidate card types:
  - Unit (resource, combat, utility)
  - Structure
  - Tactic/Spell
  - Upgrade/Attachment

## Battlefield System (Draft)
- Hex-grid map.
- Units move and interact with enemies, allies, and terrain.
- Terrain/environment should create tactical opportunities (cover, hazards, resource nodes, chokepoints).

## Economy System (Draft)
- Resource gathering units generate income.
- Resources are spent to cast cards and potentially activate abilities.
- Economy pressure should force tradeoffs between expansion, defense, and aggression.

## Synergy and Combo Design
- Synergies should come from tags, triggers, archetypes, and board state interactions.
- We want "engine-building" moments where multiple permanents/cards create high-value sequences.
- Combo moments should trigger unique and satisfying animations.
- Balance target: powerful combos are fun, but must remain interactable/counterable.

## MVP Scope (First Playable)
- Single map, 1v1 skirmish (likely vs AI first).
- Turn-based match with hex movement.
- Hand/deck mechanics:
  - Opening hand of 7.
  - Draw 1 per turn.
  - Play cards from hand with resource costs.
- Three base unit roles:
  - Resource unit
  - Combat unit
  - Utility/support unit
- Basic synergy system:
  - At least 2-3 explicit combo interactions.
- Clear win condition (single mode).

## UX/Presentation Goals
- Readable board state and intent clarity.
- Distinct animation beats for:
  - Card cast
  - Unit summon
  - Resource gain
  - Synergy trigger/combo chain
- Fast feedback on legal actions, costs, and outcomes.

## Technical Design Notes (Current Codebase)
- Renderer uses a canvas game loop.
- Runtime architecture now supports HMR with persistent game state and hot-swappable update/render systems.
- This supports rapid iteration on gameplay logic without losing in-memory match state on refresh.

## Open Questions
- What is the primary win condition for v1?
- How many resource types should exist (one universal vs multiple)?
- Should units have summoning sickness/action points/cooldowns?
- How large should the hex map be for MVP?
- Do players have a commander/hero card?
- Is deck size fixed? If so, what size?
- How often should mulligan be allowed, if at all?
- How do we cap infinite loops while keeping combo creativity?
- Should fog of war exist?
- Target audience: deep strategy niche or broader accessibility?

## Decision Log
- 2026-03-18: Direction set to CCG + army tactics + turn-based hex grid.
- 2026-03-18: Deckbuilding/deck editor confirmed as core feature.
- 2026-03-18: Opening hand target set to 7 cards (draft).
- 2026-03-18: Resource gathering + card casting from hand confirmed.
- 2026-03-18: Strong emphasis on synergy/combo interactions and animations.

## Backlog Seeds
- Define canonical card schema and keyword system.
- Define unit stats schema (hp, attack, move, range, traits).
- Define turn/action economy details.
- Build minimal deck editor UI.
- Build simple AI opponent for tactical testing.
- Prototype 10-20 starter cards across 2 archetypes.
- Add event log/combat log for debugging and balance.
