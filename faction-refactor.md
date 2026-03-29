# Plan: Extensible Content Architecture with Sets, Mechanics, and Factions

## Context

The game engine currently has mechanic-specific logic (bloom triggers, cascade propagation, salvage rewards, surge detection, stealth blocking, sprout sickness bypass) hardcoded into core system files via switch statements. Adding a new mechanic or faction requires edits across 5-10 core files. The goal is an **open/closed architecture** where:

1. **Core engine** provides dispatch frameworks with registration points — closed for modification
2. **Mechanics** register their keyword behaviors, trigger conditions, instruction handlers, and effect factories — open for extension
3. **Sets** bundle cards + mechanics + factions into self-contained content packs — zero core file changes to add one
4. A new set can introduce new factions, new mechanics (keywords, trigger conditions, instruction types), and new cards without touching engine files

## Current Hardcoded Dispatch Points (the problem)

These are the switch statements / hardcoded checks that must become registry-driven:

### Trigger Condition Evaluation — `triggerEngine.ts:133-215`
13-case switch in `doesEventMatchCondition()`. The mechanic-specific ones:
- `on_owner_tactic_played` — checks CARD_PLAYED_TO_STACK + card kind
- `on_owner_surged_tactic_played` — checks surgeActive flag
- `on_owner_salvaged` — checks UNIT_ATTACK_DECLARED + targetDestroyed + SALVAGE_KEYWORD
- `on_cascaded` — checks STACK_ITEM_RESOLVED + cascade hex intersection
- `on_self_bloomed` — checks lastBloomSourceItemId + lastBloomedUnitIds
- `on_owner_unit_bloomed` — checks lastBloomedUnitIds + owner match

### Auto-Target Strategy Resolution — `triggerEngine.ts:38-106`
2-case switch in `resolveAutoTarget()`:
- `weakest_enemy_unit` — sort by damaged → HP → id
- `weakest_enemy_unit_in_range_2` — same with range constraint

### Instruction Handler Dispatch — `instructionHandlers.ts:294-324`
9-case switch in `executeSingleInstruction()`. Mechanic-specific:
- `TRIGGER_BLOOM` → handleTriggerBloom (biomass)

Core instructions (stay registered by engine):
- `DEAL_DAMAGE`, `DESTROY_ENTITY`, `DEPLOY_UNIT`, `APPLY_CONTINUOUS_EFFECT`, `DRAW_CARDS`, `GAIN_RESOURCES`, `COUNTER_STACK_ITEM`, `LOG`

### Keyword Behavior Dispatch — `keywords.ts` (scattered functions)
Each keyword's behavior is a hardcoded function:
- **Sprout**: `isUnitBlockedFromMovingBySummoningSickness()`, `isUnitBlockedFromAttackingBySummoningSickness()` — checked in validators.ts:213,236 + autoFlow.ts:39,45 + cards.ts:72 + instructionHandlers.ts:61
- **Stealth**: `getTargetingKeywordBlockReason()`, `getAttackKeywordBlockReason()` — checked in validators.ts:77,243 + triggerEngine.ts auto-target + mvpBot.ts:547,572
- **Uncounterable**: checked in cards.ts:256
- **Relay**: checked in cascade.ts:88 (cascade propagation)
- **Salvage**: checked in combat.ts:138 (resource gain on kill)

### Stack Effect Definitions — `stackEffects.ts:365-712`
Hardcoded `STACK_EFFECTS` object with 20+ entries. Already closest to a registry pattern.

### Play Effect Config Resolution — `stackEffects.ts:261-278`
9-case switch in `createInstructionsForPlayEffectConfig()` mapping config types to instruction factories.

### Combat Hooks — `combat.ts:137-145`
Salvage keyword resource gain hardcoded inline in `reduceUnitAttackDeclared()`.

## Architecture: Registry-Based Engine + Content Sets

### Registration Points

The core engine exposes these registries that mechanics plug into:

```typescript
// Engine provides these registration functions
type GameEngine = {
  // Trigger conditions: "on_cascaded", "on_self_bloomed", etc.
  registerTriggerCondition(type: string, evaluator: TriggerConditionEvaluator): void;

  // Auto-target strategies: "weakest_enemy_unit", etc.
  registerAutoTargetStrategy(name: string, resolver: AutoTargetResolver): void;

  // Instruction handlers: "TRIGGER_BLOOM", etc.
  registerInstructionHandler(type: string, handler: InstructionHandler): void;

  // Keyword behaviors: sprout bypasses sickness, stealth blocks targeting, etc.
  registerKeywordBehavior(keyword: string, hooks: KeywordBehaviorHooks): void;

  // Stack effect definitions: "cascade_unit_buff", "mass_damage", etc.
  registerStackEffect(id: string, definition: StackEffectDefinition): void;

  // Play effect config resolvers: "cascade_unit_buff" → instruction factory
  registerPlayEffectResolver(type: string, resolver: PlayEffectConfigResolver): void;

  // Combat hooks: salvage, lifesteal, etc.
  registerCombatHook(hook: CombatHook): void;
};
```

### Registry Types

```typescript
type TriggerConditionEvaluator = {
  evaluate(ctx: {
    state: GameState;
    event: GameEvent;
    condition: TriggerCondition;
    unit: UnitEntity;
  }): boolean;
};

type AutoTargetResolver = {
  resolve(ctx: {
    state: GameState;
    controllerId: PlayerId;
    preferredTargetId: string | null;
    sourceUnit?: UnitEntity;
  }): string | null;
};

type InstructionHandler = {
  execute(state: GameState, instruction: GameInstruction): void;
};

type KeywordBehaviorHooks = {
  bypassSummoningSickness?: boolean;
  blockEnemyTargeting?: boolean;     // stealth-style blocking
  blockEnemyAttack?: boolean;        // stealth-style blocking
  preventCountering?: boolean;       // uncounterable
  // Extendable: future keywords add new hook types here
};

type PlayEffectConfigResolver = {
  createInstructions(context: InstructionContext, config: CardPlayEffectConfig): GameInstruction[];
};

type CombatHook = {
  // Runs after attack resolves, before logging
  onAttackResolved?(ctx: {
    state: GameState;
    attacker: UnitEntity;
    target: EntityState;
    targetDestroyed: boolean;
  }): void;
};
```

### Core Engine Dispatch (replaces switch statements)

**Trigger conditions** — `doesEventMatchCondition()` becomes:
```typescript
function doesEventMatchCondition(state, event, condition, unit): boolean {
  const evaluator = triggerConditionRegistry.get(condition.type);
  if (!evaluator) return false;
  return evaluator.evaluate({ state, event, condition, unit });
}
```

**Instruction handlers** — `executeSingleInstruction()` becomes:
```typescript
function executeSingleInstruction(state, instr): void {
  const handler = instructionHandlerRegistry.get(instr.type);
  if (handler) handler.execute(state, instr);
}
```

**Keyword behaviors** — validators query the registry:
```typescript
function isUnitBlockedFromMovingBySummoningSickness(state, unit): boolean {
  if (!unit.hasSummoningSickness) return false;
  for (const keyword of getEffectiveKeywordsForUnit(state, unit)) {
    if (keywordBehaviorRegistry.get(keyword)?.bypassSummoningSickness) return false;
  }
  return true;
}
```

**Combat hooks** — after attack resolution:
```typescript
for (const hook of combatHookRegistry) {
  hook.onAttackResolved?.({ state, attacker, target, targetDestroyed });
}
```

## Content Organization: Sets

### What is a Set?

A **Set** is a self-contained content package. It declares everything it brings to the game:

```typescript
type CardSet = {
  id: string;
  name: string;
  mechanics: MechanicRegistration[];          // new mechanics to register
  factions?: FactionModule[];                  // new factions (optional)
  cards: Record<string, CardDefinition>;       // card pool
  starterDeckOverrides?: Record<Faction, DeckEntry[]>;  // updated decks (optional)
};

type MechanicRegistration = {
  id: string;
  name: string;
  description: string;
  register(engine: GameEngine): void;   // self-registers everything it needs
};
```

### The Base Set

All existing content becomes the "Base Set":

```
src/game/content/sets/
  base/
    index.ts              # BaseSet: CardSet definition, loadBaseSet()
    mechanics/
      cascade.ts          # registers: cascade BFS, relay keyword, on_cascaded trigger, cascade_unit_buff effect
      bloom.ts            # registers: bloom keyword, TRIGGER_BLOOM handler, on_self_bloomed + on_owner_unit_bloomed triggers
      sprout.ts           # registers: sprout keyword behavior (bypassSummoningSickness)
      stealth.ts          # registers: stealth keyword behavior (blockEnemyTargeting, blockEnemyAttack)
      surge.ts            # registers: on_owner_surged_tactic_played trigger
      salvage.ts          # registers: salvage keyword, on_owner_salvaged trigger, combat hook (alloy on kill)
      uncounterable.ts    # registers: uncounterable keyword behavior (preventCountering)
      tactic.ts           # registers: on_owner_tactic_played trigger (generic)
      core.ts             # registers: on_enter_battlefield, at_start_of_phase, on_death, on_damage_dealt, at_end_of_turn
      autoTargets.ts      # registers: weakest_enemy_unit, weakest_enemy_unit_in_range_2
      coreInstructions.ts # registers: DEAL_DAMAGE, DESTROY_ENTITY, DEPLOY_UNIT, etc.
      coreEffects.ts      # registers: deploy_unit_card, damage_enemy_base_2, counter_top_item, etc.
    factions/
      alloy_clan/
        index.ts
        cards.ts
        deck.ts
        identity.ts       # theme, altTheme, primaryResource, mechanic associations
      flux_collective/
        index.ts
        cards.ts
        deck.ts
        identity.ts
      biomass_swarm/
        index.ts
        cards.ts
        deck.ts
        identity.ts
      neutral/
        cards.ts
    instructionFactories.ts   # shared effect factories (cascade buff, mass damage, etc.)
    cardBuilders.ts           # card definition helpers (tacticPlay, unitPlay, etc.)
```

### Example: Cascade Mechanic Registration

```typescript
// src/game/content/sets/base/mechanics/cascade.ts

import { getCascadeAffectedHexes } from "./cascadeAlgorithm";
import type { MechanicRegistration } from "../../../engine/types";

export const cascadeMechanic: MechanicRegistration = {
  id: "cascade",
  name: "Cascade",
  description: "Wave-based hex effects that spread outward, extended by Relay units.",

  register(engine) {
    // Relay keyword: extends cascade waves
    engine.registerKeywordBehavior("relay", {});

    // Trigger condition: unit was in cascade wave
    engine.registerTriggerCondition("on_cascaded", {
      evaluate({ state, event, unit }) {
        if (event.type !== "STACK_ITEM_RESOLVED" || !event.targetHex || !event.sourceCardId) return false;
        if (event.controllerId !== unit.ownerId) return false;
        const sourceCard = getCardDefinition(event.sourceCardId);
        const config = getCardCascadeUnitBuffConfig(sourceCard);
        if (!config) return false;
        const hexes = getCascadeAffectedHexes(state, event.controllerId, event.targetHex, config.waves);
        return hexes.some(c => c.q === unit.coord.q && c.r === unit.coord.r);
      },
    });

    // Stack effect: cascade_unit_buff
    engine.registerStackEffect("cascade_unit_buff", { ... });

    // Play effect config resolver
    engine.registerPlayEffectResolver("cascade_unit_buff", {
      createInstructions: (ctx, config) => createCascadeUnitBuffInstructions(config)(ctx),
    });
  },
};
```

### Example: Bloom Mechanic Registration

```typescript
// src/game/content/sets/base/mechanics/bloom.ts

export const bloomMechanic: MechanicRegistration = {
  id: "bloom",
  name: "Bloom",
  description: "Gain biomass the first time a bloom unit is buffed each turn.",

  register(engine) {
    engine.registerKeywordBehavior("bloom", {});

    // Custom instruction type
    engine.registerInstructionHandler("TRIGGER_BLOOM", {
      execute(state, instr) {
        // ... handleTriggerBloom logic moves here
      },
    });

    engine.registerTriggerCondition("on_self_bloomed", {
      evaluate({ state, event, unit }) {
        return event.type === "STACK_ITEM_RESOLVED" &&
          state.lastBloomSourceItemId === event.itemId &&
          state.lastBloomedUnitIds.includes(unit.id);
      },
    });

    engine.registerTriggerCondition("on_owner_unit_bloomed", {
      evaluate({ state, event, unit }) {
        return event.type === "STACK_ITEM_RESOLVED" &&
          state.lastBloomSourceItemId === event.itemId &&
          state.lastBloomedUnitIds.some(id => {
            const u = state.entities[id];
            return u?.kind === "unit" && u.ownerId === unit.ownerId;
          });
      },
    });
  },
};
```

### Example: Salvage Mechanic Registration

```typescript
// src/game/content/sets/base/mechanics/salvage.ts

export const salvageMechanic: MechanicRegistration = {
  id: "salvage",
  name: "Salvage",
  description: "Gain alloy when a unit with Salvage destroys an enemy.",

  register(engine) {
    engine.registerKeywordBehavior("salvage", {});

    engine.registerTriggerCondition("on_owner_salvaged", {
      evaluate({ state, event, unit }) {
        if (event.type !== "UNIT_ATTACK_DECLARED" || !event.targetDestroyed) return false;
        const attacker = state.entities[event.attackerId];
        return Boolean(attacker?.kind === "unit" && attacker.ownerId === unit.ownerId &&
          unitHasActiveKeyword(state, attacker, "salvage"));
      },
    });

    // Move salvage reward from hardcoded combat.ts into a combat hook
    engine.registerCombatHook({
      onAttackResolved({ state, attacker, target, targetDestroyed }) {
        if (!targetDestroyed || target.kind !== "unit") return;
        if (target.ownerId === attacker.ownerId) return;
        if (!unitHasActiveKeyword(state, attacker, "salvage")) return;
        state.players[attacker.ownerId].resources.alloy += 1;
        state.salvageTriggersThisTurn[attacker.ownerId] += 1;
        state.log.push({ turn: state.turn, text: `${attacker.id} salvaged wreckage and generated 1 alloy.` });
      },
    });
  },
};
```

### Engine Initialization

```typescript
// src/game/engine/init.ts

import { createGameEngine } from "./engine";
import { baseSet } from "../content/sets/base";

export function initializeEngine(): GameEngine {
  const engine = createGameEngine();

  // Load base set — registers all mechanics, effects, factions, cards
  engine.loadSet(baseSet);

  // Future: engine.loadSet(expansionSet1);
  return engine;
}
```

`loadSet()` calls each mechanic's `register()`, adds faction modules to the faction registry, merges cards into the card catalog, and applies starter deck overrides.

## Directory Structure

```
src/game/
  engine/                           # Core engine — closed for modification
    types.ts                        # Registry types, GameEngine interface
    registries.ts                   # Map-based registries + registration functions
    triggerDispatch.ts              # Registry-based trigger evaluation (no switch)
    instructionDispatch.ts          # Registry-based instruction execution (no switch)
    keywordDispatch.ts              # Registry-based keyword behavior queries (no switch)
    combatHooks.ts                  # Registry-based post-combat hooks
    init.ts                         # Engine initialization + set loading
  content/
    sets/
      base/                         # Base Set — all current content
        index.ts                    # CardSet definition
        mechanics/                  # One file per mechanic, each self-registering
          cascade.ts
          cascadeAlgorithm.ts       # BFS hex propagation (moved from systems/cascade.ts)
          bloom.ts
          sprout.ts
          stealth.ts
          surge.ts
          salvage.ts
          uncounterable.ts
          tactic.ts                 # on_owner_tactic_played trigger
          core.ts                   # on_enter_battlefield, at_start_of_phase, etc.
          autoTargets.ts            # weakest_enemy_unit strategies
          coreInstructions.ts       # DEAL_DAMAGE, DESTROY_ENTITY, etc.
          coreEffects.ts            # Stack effect definitions
        factions/
          alloy_clan/{index,cards,deck,identity}.ts
          flux_collective/{index,cards,deck,identity}.ts
          biomass_swarm/{index,cards,deck,identity}.ts
          neutral/cards.ts
        instructionFactories.ts     # Shared effect instruction builders
        cardBuilders.ts             # Card definition helpers
    cards/
      catalog.ts                    # Aggregator — imports from loaded sets
    decks/
      starterDecks.ts               # Validation + deck building — imports from loaded sets
  systems/                          # Thin re-exports for backward compat
    keywords.ts                     # → engine/keywordDispatch.ts
    cascade.ts                      # → sets/base/mechanics/cascadeAlgorithm.ts
    triggerEngine.ts                # → engine/triggerDispatch.ts
    continuousEffects.ts            # Stays (generic layer system)
    replacementEngine.ts            # Stays (generic replacement system)
    combat.ts                       # Stays (formula) but hooks registered externally
    ...
```

## Dependency Flow

```
Engine types + registries (no content dependencies)
       ↓
Mechanic modules (register into engine — import engine types only)
       ↓
Instruction factories (shared builders — import engine types)
       ↓
Card builders (play helpers — import instruction factories)
       ↓
Faction identity modules (theme, primaryResource, mechanic associations)
       ↓
Faction card modules (card definitions — import card builders)
       ↓
Set index (assembles mechanics + factions + cards into CardSet)
       ↓
Engine init (loads sets into engine registries)
       ↓
Runtime, render, AI, validators (consume from engine + catalog)
```

## Implementation Steps

### Phase 1: Create Engine Registries
1. Create `engine/types.ts` with all registry types
2. Create `engine/registries.ts` with Map-based registries + registration functions
3. Create `engine/triggerDispatch.ts` — replace switch with registry lookup
4. Create `engine/instructionDispatch.ts` — replace switch with registry lookup
5. Create `engine/keywordDispatch.ts` — replace hardcoded functions with registry queries
6. Create `engine/combatHooks.ts` — combat hook registry

### Phase 2: Extract Mechanics from Core
For each mechanic, create a registration module in `sets/base/mechanics/`:
1. **core.ts** — register core trigger conditions (on_enter_battlefield, on_death, on_damage_dealt, at_start_of_phase, at_end_of_turn)
2. **coreInstructions.ts** — register core instruction handlers (DEAL_DAMAGE, DESTROY_ENTITY, etc.)
3. **coreEffects.ts** — register core stack effect definitions
4. **autoTargets.ts** — register auto-target strategies
5. **sprout.ts** — register keyword behavior: `{ bypassSummoningSickness: true }`
6. **stealth.ts** — register keyword behavior: `{ blockEnemyTargeting: true, blockEnemyAttack: true }`
7. **uncounterable.ts** — register keyword behavior: `{ preventCountering: true }`
8. **cascade.ts** — move BFS algorithm, register on_cascaded trigger + cascade_unit_buff effect + relay keyword
9. **bloom.ts** — move handleTriggerBloom, register TRIGGER_BLOOM handler + on_self_bloomed + on_owner_unit_bloomed triggers
10. **salvage.ts** — register on_owner_salvaged trigger + combat hook (alloy on kill)
11. **surge.ts** — register on_owner_surged_tactic_played trigger
12. **tactic.ts** — register on_owner_tactic_played trigger

### Phase 3: Extract Faction Content
1. Create `sets/base/cardBuilders.ts` — move card builder helpers from catalog.ts
2. Create `sets/base/instructionFactories.ts` — move from content/cards/instructionFactories.ts
3. Create per-faction modules (identity + cards + deck) under `sets/base/factions/`
4. Create `sets/base/factions/neutral/cards.ts`

### Phase 4: Wire Up Set Loading
1. Create `sets/base/index.ts` — assembles all mechanics + factions + cards into a CardSet
2. Create `engine/init.ts` — creates engine, calls `loadSet(baseSet)`
3. Rewire `catalog.ts` as aggregator reading from engine's card registry
4. Rewire `starterDecks.ts` to read from engine's faction registry
5. Rewire `presentation.ts` to read themes from engine's faction registry
6. Turn `systems/keywords.ts`, `systems/cascade.ts`, `systems/triggerEngine.ts` into thin re-exports

### Phase 5: Clean Up Combat Hooks
1. Remove hardcoded salvage logic from `combat.ts:137-145`
2. Add combat hook invocation point in `reduceUnitAttackDeclared`

## What Stays in Core (Closed for Modification)
- Command → Event pipeline (`reducers.ts`, `commands.ts`, `events.ts`)
- Phase machine (`phaseMachine.ts`)
- Priority/stack system (`stack.ts`, `autoFlow.ts`)
- Continuous effect layer system (`continuousEffects.ts`)
- Replacement effect system (`replacementEngine.ts`)
- Combat formula (`combat.ts` — but hooks are external)
- Hex math (`hex.ts`)
- Entity/state types (`state.ts`, `enums.ts`)
- Render pipeline (`render/`)
- GameState shape (mechanic state uses existing extensible fields)

## What a Future Expansion Set Looks Like

```typescript
// src/game/content/sets/expansion1/index.ts
import type { CardSet } from "../../../engine/types";
import { psychicMechanic } from "./mechanics/psychic";
import { VOID_REAVERS_MODULE } from "./factions/void_reavers";
import { EXPANSION_1_CARDS } from "./cards";

export const expansion1Set: CardSet = {
  id: "expansion_1",
  name: "Void Incursion",
  mechanics: [psychicMechanic],
  factions: [VOID_REAVERS_MODULE],
  cards: EXPANSION_1_CARDS,
  starterDeckOverrides: { void_reavers: VOID_REAVERS_DECK_ENTRIES },
};

// To load: engine.loadSet(expansion1Set);
// Zero core file modifications needed.
```

## Verification
1. `npm run typecheck` — all types resolve
2. `npm test` — all existing tests pass (registry dispatch produces identical results)
3. `npm run dev` — game loads, all mechanics work identically
4. Adding a new mechanic: create one file in a set, call `register()` — no core changes
5. Adding a new faction: create 4 files (identity, cards, deck, index), add to set — no core changes
6. Adding a new set: create set directory, import in engine init — no core changes
