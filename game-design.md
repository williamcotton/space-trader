# Space Trader - Game Design (Living Draft)

Last updated: March 18, 2026

## Purpose
This is the working game design document for Space Trader.
It should evolve continuously as we prototype, test, and make decisions.

## High Concept
Space Trader is a turn-based, hex-grid tactics game that blends CCG mechanics with army building and battlefield positioning.
Players pick a faction deck, gather faction-specific resources, download tactical plans from an orbiting satellite, play cards from hand, deploy units, and create synergies/combo lines to outplay the opponent.

## Player Fantasy
- Pilot a distinct faction economy and army identity.
- Control a battlefield like a tactical commander.
- Discover and execute satisfying card/unit synergies.
- Feel smart from resource planning, positioning, and combo timing.

## Core Pillars
- Faction identity matters: each faction has distinct resource pressures and play patterns.
- Tactical positioning matters: hex-grid movement and terrain create meaningful decisions.
- Economy matters: resource gathering and spending are central.
- Synergy matters: cards/units should create powerful interactions and combo moments.
- Clarity matters: synergies should have strong visual feedback and readable outcomes.

## Genre Blend (Current Direction)
- CCG elements (inspired by MTG): hand management, card costs/effects, color-like resource constraints, combos.
- RTS army flavor (inspired by StarCraft): build an army and leverage composition.
- Turn-based tactics layer: hex-grid movement, zone control, and sequencing.

## Factions and Resources (Draft)
- We will have 3 factions, each with different resource requirements and strategic identity.
- Core economy model (current draft):
  - Universal resource: Credits (baseline economy)
  - Faction resources:
    - Alloy (industrial/mechanical faction)
    - Flux (high-tech/energy faction)
    - BioMass (organic/swarm faction)
- Card costs can require Credits + faction resource.
- Resource income is map-based: players must control/exploit resource nodes on the hex grid.
- Resource node types:
  - Credit nodes (universal economy)
  - Alloy nodes
  - Flux nodes
  - BioMass nodes
- Map flavor rule: node names/art can vary by map, but each node still resolves to one canonical resource type.
- MVP constraint: only single-faction premade decks (no mixed-faction deck construction yet).

## Map Flavor Layer for Resources (Draft)
- Mechanical layer (stable across all maps):
  - Credits, Alloy, Flux, BioMass
- Presentation layer (map-specific labels + art):
  - One map may use "Ore Mine" for Alloy and another may use "Wreck Quarry" for Alloy.
  - One map may use "Swamp" for BioMass and another may use "Spore Basin" for BioMass.
  - One map may use "Ion Vent" for Flux and another may use "Arc Well" for Flux.
- Design principle:
  - Players learn one economy system.
  - Maps provide different fantasy and visual identity without changing the underlying rules.

## Map Roster and Resource Skins (Draft)
- Map 1: Frontier Belt (industrial salvage zone)
  - Credits: Trade Beacons
  - Alloy: Ore Mines
  - Flux: Ion Vents
  - BioMass: Xenobogs
- Map 2: Grave Ring (derelict megastructure field)
  - Credits: Data Vault Terminals
  - Alloy: Wreck Quarries
  - Flux: Arc Wells
  - BioMass: Spore Basins
- Map 3: Verdant Ruin (overgrown alien colony)
  - Credits: Relay Hubs
  - Alloy: Forge Ruins
  - Flux: Quantum Geysers
  - BioMass: Living Marshes
- Rule across all maps:
  - Node names and visuals change by map.
  - Resource mechanics and card costs remain tied to canonical types (Credits, Alloy, Flux, BioMass).

## Core Loop (Match Level)
1. Select a premade faction deck before match.
2. Start match with opening hand (currently target: 7 cards) and a starting base.
3. Each turn:
   - Download plans from the orbital satellite (currently target: draw 1 card/turn).
   - Capture/control resource nodes via units/structures.
   - Run harvester trips from controlled nodes back to base to convert cargo into resources.
   - Spend resources to cast cards from hand.
   - Move units on hex grid and take tactical actions.
   - Respond to key actions with instant-speed cards.
   - Resolve effects, synergies, and end-step triggers.
4. Win by destroying the opponent base with combat units.

## Turn Structure (Draft)
1. Start Phase
   - Download one plan card from the orbital satellite.
   - Apply start-of-turn effects.
2. Economy Phase
   - Deposit harvested cargo at base and add resources to pool.
   - Resolve other economy income/effects.
3. Main Phase
   - Play cards from hand by paying costs.
   - Deploy units/structures.
4. Tactical Phase
   - Move units on hexes (up to movement range per turn).
   - Attack/use abilities (typically one attack action per unit per turn).
5. End Phase
   - Resolve end-of-turn triggers and cleanup.

## Priority and Response Windows (Draft)
- Certain game actions open a response window where players may cast instants.
- Initial response window triggers:
  - Before an attack resolves.
  - In response to a card being cast.
  - In response to a unit ability activation.
- Resolution model (MVP locked):
  - Full stack (LIFO), MTG-style priority passing.
  - Players alternate adding responses until both pass in sequence.
  - Then the top stack item resolves; repeat until stack is empty.

## Base and Command Structure (Draft)
- Each player starts the match with a home base (StarCraft-style anchor).
- Primary victory condition remains: destroy the opponent base with combat units.
- Base uses HP, and combat units chip HP down over time (no one-shot objective capture).
- MVP base HP target: 100.
- By default, only combat-tagged units can perform base attacks.
- Base functions as:
  - Strategic objective to defend/assault.
  - Deployment and reinforcement anchor (details TBD).
  - Resource drop-off point for harvested cargo.
  - Potential source of local support effects (details TBD).

## Card System (Draft)
- MVP uses premade decks only.
- Deck construction/deck editor is post-MVP.
- You can only cast cards currently in your hand.
- Flavor framing: cards in hand are downloaded operational plans from an orbiting satellite network.
- Cards have costs and effects.
- Candidate card types:
  - Unit (resource, combat, utility)
  - Structure
  - Tactic/Spell
  - Instant (reaction-speed effects)
  - Upgrade/Attachment

## Instant-Speed Interaction (Draft)
- Instants are reaction cards playable during response windows, including the opponent turn.
- Example instant patterns:
  - Counter an enemy card/ability.
  - Destroy or heavily damage a target unit.
  - Temporary combat boost (+attack, +range, +armor, etc.).
  - Defensive reaction (shield/barrier/prevent damage).
- Design goals:
  - Increase tactical depth and mind games.
  - Prevent deterministic "goldfish" turns with no interaction.
  - Keep pacing readable with clear UI timing prompts.

## Battlefield System (Draft)
- Hex-grid map.
- Units move and interact with enemies, allies, and terrain.
- Terrain/environment should create tactical opportunities (cover, hazards, resource nodes, chokepoints).
- Resource nodes are key strategic objectives and should shape movement/combat decisions every turn.
- Different maps can remap node visuals/names while preserving resource mechanics.

## Unit Action Economy (Draft)
- Civilization-like unit cadence:
  - Movement budget per turn (range/move points).
  - Attack budget per turn (default target: one attack action).
- Summoning sickness is enabled for MVP:
  - Newly summoned units cannot move or attack on the turn they enter play unless a card grants an exception.
- Unit stats should include:
  - Move range
  - Attack range
  - Attack actions per turn
  - Defensive profile
- This keeps turns tactical and readable while allowing strong faction/unit identity through stat differences.

## Combat Modifiers (Draft)
- Attack outcomes should be modified by multiple factors:
  - Landscape and terrain features.
  - Tile type the attacker/defender occupies.
  - Distance from friendly base (supply/projection pressure concept).
  - Faction type and faction-specific combat traits.
- Design goal:
  - Positioning and map control should matter as much as raw card value.
- MVP formula/order (locked):
  - `rawAttack = unitAttack + temporaryAttackBuffs + factionAttackBonus`
  - `defense = defenderArmor + terrainDefenseBonus + tileDefenseBonus + factionDefenseBonus`
  - `supplyPenalty = max(0, ceil((distanceFromFriendlyBase - 6) / 3))`
  - `finalDamage = max(1, rawAttack - defense - supplyPenalty)`
  - Apply damage to target HP.
  - Notes:
    - Distance is measured in hexes from attacker to its own base.
    - Penalty is 0 within 6 hexes, then increases by 1 per 3 additional hexes.
    - `finalDamage` always deals at least 1 on a successful hit.

## Economy System (Draft)
- Income is primarily generated through StarCraft-style harvesting trips:
  - Resource units harvest from controlled nodes.
  - Resource units return cargo to friendly base.
  - Resources are added only when cargo is deposited.
- Node control grants extraction access, not immediate auto-income.
- Resource gathering units/structures improve extraction speed, route safety, or carrying efficiency.
- Resources are spent to cast cards and potentially activate abilities.
- Costs are faction-sensitive (color-like requirements tied to faction resource).
- Economy pressure should force tradeoffs between expansion, node defense, and aggression.

## Node Control Rules (MVP Locked)
- Capture method: occupy the node tile with a unit at end of turn.
- No extractor construction is required for node capture.
- Ownership flips immediately when the opposing player ends turn occupying that node.
- Control enables harvesting rights for that node's resource type.

## Resource Harvesting Flow (MVP Locked)
- Harvesters are resource-tagged units.
- A harvester on a controlled node may take a harvest action to load 1 cargo of that node's resource type.
- Carry limit: 1 cargo per harvester.
- Cargo is banked when the harvester reaches any friendly base-adjacent tile (drop-off zone).
- Deposit timing: deposits resolve during the Economy Phase.
- If a loaded harvester is destroyed, its cargo is lost.

## Synergy and Combo Design
- Synergies should come from tags, triggers, archetypes, and board state interactions.
- We want "engine-building" moments where multiple permanents/cards create high-value sequences.
- Combo moments should trigger unique and satisfying animations.
- Balance target: powerful combos are fun, but must remain interactable/counterable.

## MVP Scope (First Playable)
- Single map only, 1v1 skirmish (likely vs AI first).
- Turn-based match with hex movement.
- Premade decks only (no deck-builder/deck-editor UI in MVP).
- 3 starter faction decks (one per faction).
- Multiple resource node types placed on map (Credits + faction resources).
- MVP map target: Frontier Belt.
- Both players start with a base.
- Hand/deck mechanics:
  - Opening hand of 7.
  - Draw 1 per turn.
  - Play cards from hand with resource costs.
  - Deck size: 60 cards.
  - Copy limit: max 4 copies per card name/id.
- Three base unit roles:
  - Resource unit
  - Combat unit
  - Utility/support unit
- Resource units use a node-to-base harvest loop (StarCraft-style), not passive node income.
- Include instant cards in starter decks:
  - At least one counter-style instant.
  - At least one unit-removal instant.
  - At least one combat-boost instant.
- Civ-like tactical cadence:
  - Per-unit movement range per turn.
  - Per-unit attack action per turn.
- Basic synergy system:
  - At least 2-3 explicit combo interactions.
- Clear win condition: destroy opponent base with combat units.

## UX/Presentation Goals
- Readable board state and intent clarity.
- Distinct animation beats for:
  - Satellite download / plan uplink (card draw)
  - Card cast
  - Instant response window / interrupt prompt
  - Counterspell / negation event
  - Unit summon
  - Resource gain
  - Synergy trigger/combo chain
- Fast feedback on legal actions, costs, and outcomes.

## Technical Design Notes (Current Codebase)
- Renderer uses a canvas game loop.
- Runtime architecture now supports HMR with persistent game state and hot-swappable update/render systems.
- This supports rapid iteration on gameplay logic without losing in-memory match state on refresh.

## Open Questions
- Final faction names and fantasy themes?
- Keep Credits + faction resource, or pure faction-only costs?
- Should neutral nodes be capturable by any faction at baseline?
- Which actions are legally counterable vs uncounterable?
- How large should the hex map be for MVP?
- Do players have a commander/hero card?
- How often should mulligan be allowed, if at all?
- How do we cap infinite loops while keeping combo creativity?
- Should fog of war exist?
- Target audience: deep strategy niche or broader accessibility?

## Decision Log
- 2026-03-18: Direction set to CCG + army tactics + turn-based hex grid.
- 2026-03-18: Opening hand target set to 7 cards (draft).
- 2026-03-18: Resource gathering + card casting from hand confirmed.
- 2026-03-18: Strong emphasis on synergy/combo interactions and animations.
- 2026-03-18: MVP will use premade decks only; deck builder/editor deferred.
- 2026-03-18: Three-faction model added with faction-specific resource requirements.
- 2026-03-18: Resource economy shifted to map-based multi-type resource nodes.
- 2026-03-18: Map-specific resource supplier flavor approved (different node names/art can feed same canonical resource).
- 2026-03-18: Primary win condition set to destroying the opponent base with combat units.
- 2026-03-18: Card draw flavor set to downloading plans from an orbiting satellite.
- 2026-03-18: Added draft multi-map resource skin roster for flavor planning.
- 2026-03-18: MVP scope locked to a single playable map (Frontier Belt).
- 2026-03-18: Match start now includes a home base for each player.
- 2026-03-18: Unit action model set to Civ-like move range + attack budget per turn.
- 2026-03-18: Combat modifier direction set around terrain, tile type, base distance, and faction traits.
- 2026-03-18: Instant-speed cards confirmed (counter, removal, combat buff patterns).
- 2026-03-18: Node control for MVP locked to occupancy capture (no extractor requirement).
- 2026-03-18: Instants for MVP locked to full stack (LIFO) resolution.
- 2026-03-18: Summoning sickness enabled for newly summoned units.
- 2026-03-18: Combat modifier formula/order locked for MVP implementation.
- 2026-03-18: Base objective locked to HP attrition by combat units (MVP target HP 100).
- 2026-03-18: Deck rules locked to 60 cards with max 4 copies per card.
- 2026-03-18: Resource economy updated to StarCraft-style harvester trips (node cargo -> base deposit).
- 2026-03-18: Harvester drop-off zone locked to base-adjacent tiles.

## Backlog Seeds
- Define canonical card schema and keyword system.
- Define unit stats schema (hp, attack, move, range, traits).
- Implement remaining turn/action economy details in code.
- Implement node control UI indicators and feedback.
- Implement harvester cargo state, routing, and base deposit feedback.
- Define map resource skin schema (node display name, art set, VFX/SFX) mapped to canonical resource types.
- Define base stats and base-adjacent gameplay rules (deploy radius, defenses, support aura).
- Implement and tune the locked combat formula (terrain, tile, base distance, faction).
- Define instant legality matrix (counterable vs uncounterable actions).
- Build deck builder/editor UI (post-MVP).
- Build simple AI opponent for tactical testing.
- Prototype 10-20 starter cards across 3 faction archetypes.
- Add event log/combat log for debugging and balance.
