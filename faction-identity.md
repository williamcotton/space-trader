# Faction Identity

## Purpose

This document is the current source of truth for the faction pie.

It should answer:
- what each faction is supposed to feel like
- what kinds of decks a mostly monofaction player should be able to build
- where neutral fits
- what still feels missing from the live card pool

For broader roadmap and implementation planning, see `new-cards.md`.

## Design Standard

The goal is not “one mechanic per faction.”

The goal is:
- each faction has a clear emotional identity
- each faction supports 2-3 internal deck directions over time
- neutral supports decks without replacing faction identity

## Faction Pie V2

### Alloy Clan

Core identity:
- armor
- battlefield formations
- siege
- durable combat units
- damaged-matters finishing
- disciplined, board-facing tactics
- salvage / battlefield conversion

Live evergreen hooks:
- `bastion`
- `salvage`

What Alloy should feel like:
- set up a line
- make units hard to trade with
- reward adjacency and formation shape
- turn battlefield control into base pressure
- punish weakened enemies and win through disciplined force

Current archetype directions:
- formation midrange
- armored siege
- damaged-control / salvage pressure

Current live packages:
- formation / attack scaling
  - `forge_captain_card`
  - `war_protocol`
- formation / siege scaling
  - `linebreak_marshal_card`
  - `iron_formation`
- durable siege shell
  - `alloy_guard_card`
  - `forge_hauler_card`
  - `scorched_protocol`
- signature finisher
  - `market_exit_mandate`
- salvage shell
  - `frontline_scout_card`
  - `scrap_dividend`
  - `scrap_quartermaster_card`

Current gap:
- Alloy now has a loud siege payoff in `market_exit_mandate`; the next gap is making sure the finisher creates exciting closing turns without making early formation play feel optional.

### Flux Collective

Core identity:
- stack interaction
- spell chaining
- precise removal
- spatial and hex-based tactics
- tempo
- card flow and selection

Live evergreen hooks:
- `relay`
- `surge`

What Flux should feel like:
- play at instant speed
- use the stack better than other factions
- set up tactical sequences
- create big turns out of spell order and board geometry
- convert setup into explosive spell payoffs

Current archetype directions:
- stack control
- relay / cascade combo
- surge spellchain tempo

Current live packages:
- stack / interaction
  - `counter_pulse`
  - `echo_recall`
  - `arc_snap`
  - `overload_finish`
- relay / cascade
  - `ion_shower`
  - `signal_fork`
  - `phase_coil`
  - `relay_savant_card`
  - `arc_repeater_card`
  - `foldline_cutter_card`
  - `meteor_chain`
- surge
  - `static_insight`
  - `surge_matrix`
  - `arc_bloom`
  - `surge_archivist_card`
  - `overcharge_savant_card`
  - `ion_surge_archive`

Current gap:
- Flux is the clearest faction right now and now has a top-end Relay payoff in `foldline_cutter_card`. Its next natural step is a `resonance` layer, not basic identity cleanup.

### Biomass Swarm

Core identity:
- sprout / immediate board presence
- go-wide play
- global buffs
- growth over time
- board-based resource generation
- snowballing from buffs and clustered board states

Secondary identity:
- death payoffs
- battlefield churn
- regrowth / rebuilding after trades

Live evergreen hooks:
- `sprout`
- `bloom`

What Biomass should feel like:
- flood the board early
- scale from already having units
- turn buffs into engines, not just stat bumps
- cash in a wide board for resources
- eventually rebuild after attrition

Current archetype directions:
- sprout aggro
- swarm anthem
- bloom growth engine

Current live packages:
- sprout tempo
  - `spore_tender_card`
  - `swarm_harvester_card`
  - `support_drone_card`
- anthem / growth
  - `spore_bloom`
  - `neural_echo`
  - `overgrowth_wave`
  - `worldroot_colossus_card`
- bloom engine
  - `bloom_archivist_card`
  - `compost_broker_card`
  - `canopy_dividend`
- board-to-economy
  - `spore_harvest`

Current gap:
- Biomass now has a coherent primary engine, but its regrowth / death-value secondary lane is still thin and is the clearest future opportunity.

### Neutral

Core identity:
- generic staples
- simple bodies
- symmetrical effects
- expensive catch-all tools

What Neutral should feel like:
- support, not define
- smooth rough edges
- offer baseline answers
- remain worse than faction cards at synergy and ceiling

## Neutral Tax

Neutral cards should usually be intentionally under-rate relative to faction cards.

That is the cost of going outside the faction pie.

Design principle:
- faction cards get efficiency and synergy
- neutral cards get flexibility and accessibility
- splashing outside the pie should cost tempo, rate, ceiling, or all three

### Healthy Neutral Roles

- generic combat body
- generic harvester
- generic defensive piece
- baseline counterspell
- baseline resource smoothing
- symmetrical high-cost haymaker

### Unhealthy Neutral Roles

- best-rate removal
- best-rate counterspell
- best-rate finisher
- archetype-defining engine
- faction-quality payoff with no faction commitment

### Current Healthy Neutral Cards

- `expedition_harvester_card`
- `salvage_hauler_card`
- `null_intercept`
- `failsafe_redirect`
- `orbital_purge`
- `emergency_war_chest`

## Monofaction Deck Principle

Each faction should support multiple coherent mostly-monofaction builds.

Current targets:
- Alloy: formation midrange, armored siege, damaged/salvage pressure
- Flux: stack control, relay combo, surge spellchain
- Biomass: sprout aggro, swarm anthem, bloom engine, later regrowth

This is the standard for evaluating new cards.

## Cost Philosophy

Credits should usually gate:
- unconditional removal
- hard counters
- direct base burn
- card draw/refill
- board wipes
- generically powerful haymakers

Primary-only cards should usually be:
- narrower
- more synergy-dependent
- more board-state dependent
- higher ceiling, lower floor
- weaker when behind or empty-boarded

Good primary-only shapes:
- friendly-only buffs
- setup pieces
- archetype payoffs
- resource conversion cards
- conditional finishers

Bad primary-only shapes:
- hard counterspells
- generic direct burn
- efficient generic bodies
- large raw draw
- sweepers

## Current Assessment

On paper:
- Flux has the deepest and splashiest gameplay options.
- Biomass has a coherent primary engine and wants a second lane.
- Alloy is much healthier than before, but still wants one standout payoff that pushes its excitement ceiling upward.

That is a good place for the game to be in. The faction pie is now visible in the live catalog instead of existing only in theory.

## Open Questions

- Should spell damage remain raw HP loss, or should some spell families respect armor?
- How much of Biomass should become true graveyard / regrowth gameplay?
- Does Alloy need another evergreen keyword beyond `bastion` and `salvage`, or just better payoffs?
- Should Flux own most stack interaction permanently, with Alloy and Biomass using narrower forms of interaction?
- How much true infinite-combo support do we eventually want versus bounded combo engines?
