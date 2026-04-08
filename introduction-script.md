# Space Trader - Introduction Script

## Purpose

Step-by-step tutorial walkthrough for new players. Each step describes:
- what the player should see and understand
- the exact game state needed for the screenshot
- the screenshot filename

Screenshots will be captured via Playwright against the Electron app with injected game states.

## Screenshot Automation Notes

Each step specifies a `State Setup` block describing the exact `GameState` configuration to inject via `getGameRuntime()` before capturing the screenshot. The Playwright script should:

1. Launch the Electron app
2. For each step: inject state via `page.evaluate()`, wait for one render frame, then capture a screenshot of the relevant UI region
3. Save screenshots to `docs/introduction/`

---

## Step 1: The Battlefield

**What the player learns:**
You command a faction base on a hex grid. Your goal is to destroy the enemy base.

**Screenshot: `01-battlefield-overview.png`**
Shows the full game view at the start of a match: two bases, resource nodes visible, empty battlefield, hand tray with opening hand.

**State Setup:**
- Fresh match start, turn 1, start phase (after opening draw)
- Player 1: Alloy Clan, Player 2: Flux Collective
- Default `frontier_belt` map
- Player 1 opening hand: 5 cards
- Player 1 resources: 2 Credits, 2 Alloy
- No units deployed yet
- Bot disabled for both players

**Callouts:**
- "Your base" (arrow to player 1 base)
- "Enemy base" (arrow to player 2 base)
- "Resource nodes" (arrows to nearby nodes)
- "Your hand" (arrow to hand tray)
- "Resources" (arrow to resource display in top bar)

---

## Step 2: Understanding Resources

**What the player learns:**
You have Credits (universal) and a faction resource. Cards cost a combination of both. You earn Credits each turn and harvest faction resources from the map.

**Screenshot: `02-resources.png`**
Close-up of the top bar showing player resources and a card in hand with its cost visible.

**State Setup:**
- Same as Step 1
- Ensure a card with mixed cost (e.g., `C2 A1`) is visible in hand

**Callouts:**
- "Credits" (arrow to credit count)
- "Alloy" (arrow to faction resource count)
- "Card cost: 2 Credits + 1 Alloy" (arrow to a card's cost display)

---

## Step 3: Turn Phases

**What the player learns:**
Each turn has phases: Start (draw), Economy (deposits), Main (deploy units), Tactical (move/attack/harvest), End (node control updates). Press `N` to advance.

**Screenshot: `03-turn-phases.png`**
Show the phase indicator in the UI, currently on Main phase. The phase display should be clearly visible.

**State Setup:**
- Turn 1, Main phase
- Player 1 active
- Empty stack
- Opening hand visible

**Callouts:**
- "Current phase" (arrow to phase display)
- "Press N to advance to next phase"

---

## Step 4: Deploying a Unit

**What the player learns:**
During Main phase, click a unit card in your hand to deploy it to a tile adjacent to your base. Units have stats: HP, Attack, Move, Range.

**Screenshot: `04-deploy-unit.png`**
Show a unit card highlighted in hand, with deployment tiles highlighted around the player's base.

**State Setup:**
- Turn 1, Main phase
- Player 1 has enough resources to play a combat unit (e.g., `alloy_guard_card`)
- Empty stack
- Show deployment tile highlighting (pending card targeting state)

**Callouts:**
- "Click a unit card to deploy" (arrow to card in hand)
- "Valid deployment tiles" (arrows to highlighted base-adjacent hexes)

---

## Step 5: Unit on the Battlefield

**What the player learns:**
Once deployed, units appear on the hex grid. New units have summoning sickness and cannot act this turn.

**Screenshot: `05-unit-deployed.png`**
Show a freshly deployed Alloy Guard adjacent to the player 1 base. The unit should have a "summoning sickness" visual indicator if one exists, or at minimum show the unit stats in the HUD.

**State Setup:**
- Turn 1, Main phase (after deployment)
- One Alloy Guard deployed adjacent to Player 1 base
- Unit has summoning sickness
- Unit selected, showing stats in HUD panel

**Callouts:**
- "Your unit" (arrow to deployed unit)
- "Unit stats: HP, Attack, Armor, Move" (arrow to HUD panel)
- "New units can't act this turn (summoning sickness)"

---

## Step 6: Moving a Unit

**What the player learns:**
In the Tactical phase, select a unit and use arrow keys to move it. Units have a move budget shown in their stats.

**Screenshot: `06-move-unit.png`**
Show a unit selected with movement range overlay visible on the hex grid.

**State Setup:**
- Turn 2, Tactical phase
- Player 1 has one combat unit that is no longer summoning sick
- Unit selected, movement overlay visible
- Show reachable hexes highlighted

**Callouts:**
- "Select a unit (click or press U)"
- "Movement range" (arrows to highlighted reachable hexes)
- "Use arrow keys to move"

---

## Step 7: Attacking

**What the player learns:**
With a unit selected, press `A` to enter attack mode. Valid targets highlight. Click an enemy to attack.

**Screenshot: `07-attack-mode.png`**
Show a combat unit in attack mode with enemy units or base highlighted as valid targets.

**State Setup:**
- Turn 2 or later, Tactical phase
- Player 1 combat unit within attack range of an enemy unit or the enemy base
- Attack targeting mode active (unit selected, A pressed)
- Valid targets highlighted

**Callouts:**
- "Press A to enter attack mode"
- "Valid targets highlighted in red" (arrows to highlighted enemies)
- "Click a target to attack"

---

## Step 8: The Resource Harvesting Loop

**What the player learns:**
Resource units harvest from map nodes. The loop is: capture a node by occupying it at end of turn, harvest with `H`, move back to base, auto-deposit next Economy phase.

**Screenshot: `08-harvesting-overview.png`**
Show a resource unit (e.g., Forge Hauler) on a resource node, with the node visually controlled by Player 1.

**State Setup:**
- Turn 3 or later, Tactical phase
- Player 1 resource unit on a controlled Alloy node (Ore Mine)
- Node shows Player 1 control
- Resource unit is eligible to harvest

**Callouts:**
- "Resource unit on a controlled node"
- "Press H to harvest"
- "Then move back toward your base to deposit"

---

## Step 9: Harvesting - Loading Cargo

**What the player learns:**
When you press `H`, the resource unit loads cargo from the node. The unit now carries resources that must be delivered.

**Screenshot: `09-harvest-loaded.png`**
Show the same resource unit, now loaded with cargo, indicated visually on the unit.

**State Setup:**
- Same scenario as Step 8 but after harvesting
- Resource unit is loaded with cargo
- Cargo indicator visible on unit

**Callouts:**
- "Unit loaded with cargo" (arrow to cargo indicator)
- "Move to a tile adjacent to your base"
- "Cargo deposits automatically in the Economy phase"

---

## Step 10: Playing Instant Cards (Tactics)

**What the player learns:**
Tactic cards can be played whenever you have priority. They go onto the stack and resolve after all players pass.

**Screenshot: `10-play-tactic.png`**
Show a tactic card being played, visible on the stack in the Command Stack Panel.

**State Setup:**
- Mid-game state, any phase where priority is available
- Player 1 has an instant-speed tactic in hand (e.g., `arc_snap`)
- A valid target exists on the battlefield
- Show the card on the stack after being played

**Callouts:**
- "Tactic cards play at instant speed"
- "The card goes onto the stack" (arrow to stack panel)
- "All players get a chance to respond"

---

## Step 11: The Stack and Priority

**What the player learns:**
The stack is last-in-first-out. When you play a card, your opponent can respond. Cards resolve from top to bottom after all players pass priority.

**Screenshot: `11-stack-priority.png`**
Show a stack with 2+ items: a tactic from Player 1 and a response from Player 2. Priority indicator shows whose turn it is to act.

**State Setup:**
- Mid-game, stack has 2 items:
  - Bottom: Player 1's tactic (e.g., `arc_snap` targeting an enemy unit)
  - Top: Player 2's response (e.g., `counter_pulse` targeting the arc_snap)
- Priority currently with Player 1
- Stack panel clearly showing both items

**Callouts:**
- "Stack resolves top to bottom (LIFO)"
- "Your opponent responded with a counter!"
- "Press P to pass priority" (arrow to priority controls)
- "Top item resolves first"

---

## Step 12: Winning the Game

**What the player learns:**
Reduce the enemy base to 0 HP to win. Combat units can attack the base directly. Siege units deal bonus damage to bases.

**Screenshot: `12-base-assault.png`**
Show combat units adjacent to the enemy base, with the base at low HP. One unit in attack mode targeting the base.

**State Setup:**
- Late-game state
- Player 1 has 2-3 combat units adjacent to Player 2's base
- Player 2 base at low HP (e.g., 3-4 HP remaining)
- One unit in attack targeting mode with the base highlighted

**Callouts:**
- "Enemy base at low HP" (arrow to base HP)
- "Your units attacking the base"
- "Reduce it to 0 to win!"

---

## Step 13: Quick Reference

**What the player learns:**
Summary of key controls and concepts for reference during play.

**No screenshot needed - text only.**

**Content:**

| Key | Action |
|-----|--------|
| `N` | Advance phase |
| `U` | Select first unit |
| Arrow keys | Move selected unit |
| `A` | Enter attack mode |
| `H` | Harvest with resource unit |
| `P` | Pass priority |
| `Esc` | Cancel action |
| Click card | Play from hand |

**Core loop:**
1. Draw a card (automatic at start of turn)
2. Deploy units in Main phase
3. Move, attack, and harvest in Tactical phase
4. Build your economy by harvesting resources
5. Play tactics from hand to interact on the stack
6. Destroy the enemy base to win

---

## Playwright Automation Architecture

### Approach

The Playwright script should:

1. **Launch**: Start the Electron app via `electron .` or the dev server
2. **State Injection**: For each step, use `page.evaluate()` to:
   - Access `getGameRuntime()` from the window/global scope
   - Directly mutate `runtime.state` to match the step's State Setup
   - Call the render pipeline to update the canvas
3. **Wait**: Allow one or two animation frames for rendering to complete
4. **Capture**: Take a screenshot of the full page or a specific element region
5. **Save**: Write to `docs/introduction/{filename}`

### State Injection Pattern

```typescript
await page.evaluate(() => {
  const runtime = (window as any).__gameRuntime; // or however runtime is exposed
  const state = runtime.state;

  // Example: set phase
  state.phase = 'main';

  // Example: set resources
  state.players.player_1.resources = { credits: 2, alloy: 2 };

  // Example: place a unit
  // ... entity creation matching the state model

  // Force re-render
  runtime.bumpVersion();
});

// Wait for render
await page.waitForTimeout(200);

// Screenshot
await page.screenshot({ path: 'docs/introduction/04-deploy-unit.png' });
```

### Exposing the Runtime

The Playwright script will need the runtime accessible from the page context. Options:
- The runtime may already be on `window` via the dev tools / debug helpers
- If not, add a small bridge: `(window as any).__gameRuntime = runtime;` in the app entry point (dev mode only)

### Canvas Considerations

- The game renders on `<canvas>`, so element-specific screenshots should target the canvas element plus any overlaid HTML panels
- Full-page screenshots may be simplest for the tutorial since the layout includes the hand tray, top bar, and HUD panels alongside the canvas

---

## Post-Capture Work

After screenshots are captured:
1. Add annotation overlays (arrows, callout boxes) either in the Playwright script or in post-processing
2. Compile the final tutorial document from these steps and annotated screenshots
3. Consider an in-game tutorial mode that walks through these same steps interactively (future work)
