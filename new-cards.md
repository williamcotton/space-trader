# New Cards

## Purpose

This is the single planning document for card design and faction expansion.

It replaces the old split between:
- `new-faction-cards.md`
- `card-faction-update.md`

`faction-identity.md` remains as the companion document for the faction pie itself. This file is the broader card roadmap, implementation backlog, and design-notes capture.

## Current Snapshot

The game is no longer in the “only efficient midrange cards” phase.

It already has:
- faction haymakers
- named combo mechanics
- faction-specific payoff units
- card-owned effect configs and animations
- enough engine support to keep adding more content without hardcoding card-by-card resolver branches

### Implemented Haymakers And Bombs

- `orbital_purge`
- `scorched_protocol`
- `meteor_chain`
- `ion_surge_archive`
- `overgrowth_wave`
- `war_protocol`
- `iron_formation`
- `emergency_war_chest`
- `spore_harvest`

### Implemented Combo / Engine Keywords

- `relay`
- `surge`
- `bloom`
- `salvage`
- `bastion`
- `sprout`
- `stealth`
- `uncounterable`

### Current Faction Read

- `alloy_clan`
  - formation / armor / siege / damaged-matters
  - now also has `salvage` and `bastion`
- `flux_collective`
  - stack play / spellchain / cascade / spatial tactics
  - now has both `relay` and `surge`
- `biomass_swarm`
  - sprout / go-wide buffs / board-to-economy conversion
  - now has `bloom` as a real engine keyword
- `neutral`
  - glue, staples, catch-all tools, simple units, symmetrical haymakers

## What The Game Already Supports Well

The current instruction/stack architecture is strong enough for these families without major redesign:

- board wipes and global damage
- global buffs
- multi-damage spatial spells
- draw plus resource burst
- “destroy all damaged units” reset effects
- faction-specific resource conversion payoffs
- keyword-granting buffs
- trigger-driven payoff units

In practice that means we can usually add a new card by:
- defining metadata in `catalog.ts`
- using an existing generic effect family
- adding bot scoring only when the effect family is new

## Current Generic Effect Families

These are already present and should stay generic:

- `mass_damage`
- `global_unit_buff`
- `destroy_damaged_units`
- `draw_and_gain_resources`
- `resources_by_unit_count`
- `resources_by_bloom_count`
- `resources_by_salvage_count`
- `hex_area_damage`
- `cascade_unit_buff`

## Current Trigger Surface

The trigger engine already supports:

- `on_owner_tactic_played`
- `on_owner_surged_tactic_played`
- `on_owner_salvaged`
- `on_cascaded`
- `on_self_bloomed`
- `on_owner_unit_bloomed`

That is enough to keep building out Flux, Biomass, and Alloy without another trigger refactor right away.

## Faction Progress

### Alloy Clan

Alloy now has a real shell instead of just “solid combat cards.”

Current live packages:
- formation buffs
  - `forge_captain_card`
  - `linebreak_marshal_card`
  - `war_protocol`
  - `iron_formation`
- durable siege / armored pressure
  - `alloy_guard_card`
  - `forge_hauler_card`
  - `scorched_protocol`
- salvage engine
  - `frontline_scout_card`
  - `scrap_dividend`
  - `scrap_quartermaster_card`

What still feels missing:
- one louder signature payoff tying formation, siege, and salvage into a truly explosive turn
- possibly one more damaged-enemy finisher

### Flux Collective

Flux is the most complete faction right now.

Current live packages:
- stack / tempo control
  - `counter_pulse`
  - `echo_recall`
  - `arc_snap`
  - `overload_finish`
- relay / cascade combo
  - `ion_shower`
  - `signal_fork`
  - `phase_coil`
  - `relay_savant_card`
  - `arc_repeater_card`
  - `meteor_chain`
- surge spellchain
  - `static_insight`
  - `surge_matrix`
  - `arc_bloom`
  - `surge_archivist_card`
  - `overcharge_savant_card`
  - `ion_surge_archive`

What still feels missing:
- a true top-end Relay payoff
- maybe `resonance` as the next layer after Relay + Surge

### Biomass Swarm

Biomass now has a coherent primary engine.

Current live packages:
- sprout tempo
  - `spore_tender_card`
  - `swarm_harvester_card`
  - `support_drone_card`
- swarm anthem / growth
  - `spore_bloom`
  - `neural_echo`
  - `overgrowth_wave`
- bloom engine
  - `bloom_archivist_card`
  - `compost_broker_card`
  - `canopy_dividend`
- board-to-economy conversion
  - `spore_harvest`

What still feels missing:
- a real secondary death/regrowth lane
- a comeback / recursion package that is fun when Biomass gets wiped

### Neutral

Neutral is in a healthier place than before, but still needs discipline.

Healthy roles:
- `expedition_harvester_card`
- `salvage_hauler_card`
- `null_intercept`
- `failsafe_redirect`
- `orbital_purge`
- `emergency_war_chest`

Ongoing risk:
- neutral glue can still flatten the faction pie if it becomes too rate-efficient

## Neutral Tax

Neutral should stay:
- broader
- simpler
- more expensive
- lower-synergy
- lower-ceiling

Neutral should not be:
- the best removal
- the best counterspell
- the best payoff engine
- the best top-end finisher for monofaction decks

If an effect moves from faction space to neutral space, at least one of these should usually happen:
- cost goes up
- stats go down
- flexibility goes down
- symmetry increases
- synergy ceiling drops

## Cost Philosophy

Credits should usually gate:
- unconditional removal
- hard counters
- direct base burn
- big draw/refill
- board wipes
- generically powerful statlines
- splashy haymakers

Primary-only cards should usually be:
- narrower
- more synergy-dependent
- more board-state dependent
- higher-ceiling but lower-floor
- worse when behind or empty-boarded

Good primary-only shapes:
- friendly-only buffs
- setup pieces
- archetype payoffs
- resource conversion cards
- conditional finishers

Bad primary-only shapes:
- hard counterspells
- generic direct burn
- generic best-rate bodies
- large raw draw
- sweepers

## Combo Philosophy

The game should support named monofaction combo shells, not just incidental synergies.

Current live combo identity:
- Flux: `relay` + `surge`
- Biomass: `bloom`
- Alloy: `salvage` + `bastion`

That said, not every keyword needs to be equally combo-heavy.
- `relay`, `surge`, and `bloom` are true engine keywords
- `salvage` and `bastion` are currently more “payoff texture” than deep combo engines

## Infinite Combos

Infinite combos are valid design space, but they should not be added casually.

Right now the game should prefer bounded loop-feeling systems:
- once per turn
- once per resolution
- once per chain
- explicit depth/visit limits

That gives players combo satisfaction without risking hangs, runaway triggers, or bot-sim blowups.

If true infinite combos are pursued later, the engine will need:
- deterministic loop detection
- loop shortcut rules
- explicit player choice handling for repeat counts
- AI handling for infinite or arbitrarily large lines

## Major Overhaul Design Spaces

These are worth pursuing eventually, but they are not cheap.

### Graveyard / Reanimation / Recursion

This is the clearest major-overhaul candidate.

Simple “return card from discard to hand” is manageable.

But real graveyard design would want:
- card-type-aware discard selection
- targeting / preview UX for discard piles
- zone-move instructions for discard -> hand / battlefield / exile
- rules around reanimating units versus replaying cards
- AI valuation for recursion lines
- probably more visible graveyard UI

Full reanimation or deep graveyard value should be treated as a dedicated feature wave, not just a few isolated cards.

### Tokens

True token gameplay likely wants either:
- token card templates
- or a dedicated deploy-from-template instruction

The engine can fake a little of this today, but a real token strategy deserves proper support.

### Multi-Target Choice Cards

Current targeting is clean for:
- none
- entity
- stack item
- hex

Cards like “choose two units” or “choose up to three hexes” would want another targeting layer and should be treated deliberately.

## Open Rules Questions

### Spell Damage Versus Armor

Current `DEAL_DAMAGE` is raw HP loss, not combat-style damage.

That means spell damage bypasses armor right now.

This is still an important design choice:
- keeping it raw makes wipes and removal cleaner and more swingy
- making it respect armor would make Alloy’s identity feel more intuitive but would materially change balance and card evaluation

### Graveyard Commitment

Do we want:
- light recursion only
- or a real graveyard subgame

This should be decided before building Biomass too far into regrowth.

### True Infinite Combos

Do we want only bounded engines, or actual deterministic infinite lines?

The answer affects how aggressively we expand Relay/Surge/Bloom and future combo keywords.

## Recommended Next Card Work

### Alloy

Best next additions:
- one signature formation/siege/salvage payoff
- one more damaged-unit finisher or artillery-style tactic

Good direction:
- a card that turns an arranged formation into a sudden base-cracking turn

### Flux

Best next additions:
- a louder top-end Relay payoff
- `resonance` as the next spatial-combo payoff keyword

Good direction:
- cards that reward multiple relayed/cascaded units in one resolution

### Biomass

Best next additions:
- one regrowth / recursion card
- one death-payoff card

Good direction:
- cards that let Biomass recover from wipes and turn attrition into advantage

### Neutral

Best next additions:
- only if they serve a real glue purpose
- preferably symmetrical or taxed utility

Good direction:
- avoid new neutral payoff engines

## Recommended Delivery Order

1. Finish one more signature payoff card for Alloy.
2. Add the next Flux combo layer after Relay + Surge, probably `resonance`.
3. Add Biomass regrowth / death-value support.
4. Only then consider graveyard-feature work if the Biomass direction still clearly wants it.

## Current Assessment

On paper:
- Flux has the deepest and splashiest gameplay options right now.
- Biomass has a coherent primary engine and wants a second lane.
- Alloy is much healthier than before, but still wants one louder payoff to match Flux’s spectacle.

That is the current state the next card wave should build on.
