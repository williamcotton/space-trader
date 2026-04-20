/**
 * Captures annotated screenshots for the Space Trader introduction tutorial.
 *
 * Prerequisites:
 *   1. Start the dev server in screenshot mode:
 *      npm run dev:screenshots
 *   2. Run: npx tsx scripts/capture-introduction-screenshots.ts
 *
 * The game runtime is exposed on `window.__gameRuntime` in dev mode
 * and marks gameplay readiness on `window.__spaceTraderRuntimeReady`
 * (see src/game/runtime.ts and src/GameCanvas.tsx).
 */

import { chromium, type Page } from "playwright";
import { mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEV_SERVER_URL = "http://localhost:5173";
const OUTPUT_DIR = join(__dirname, "..", "docs", "introduction");
const VIEWPORT = { width: 1600, height: 1200 };
const RENDER_SETTLE_MS = 600;

// ---------------------------------------------------------------------------
// Annotation types
// ---------------------------------------------------------------------------

type Arrow = {
  /** Label text displayed at the tail of the arrow */
  label: string;
  /** Starting point of the arrow (where the label sits) */
  from: { x: number; y: number };
  /** Tip of the arrow (what it points to) */
  to: { x: number; y: number };
  /** Optional color override (default: #00e5ff) */
  color?: string;
};

type Annotation = {
  arrows: Arrow[];
};

// ---------------------------------------------------------------------------
// Hex-to-CSS-pixel helper
// ---------------------------------------------------------------------------

/**
 * Batch-converts hex coordinates to CSS page pixel positions using the actual
 * game layout modules via dynamic import inside the browser context.
 */
async function hexToPagePixels(
  page: Page,
  coords: Array<{ q: number; r: number }>
): Promise<Array<{ x: number; y: number }>> {
  return page.evaluate(async (coords) => {
    const runtime = (window as any).__gameRuntime;
    const canvas = document.querySelector("canvas")!;
    const rect = canvas.getBoundingClientRect();

    const { getHexMetrics } = await import("../src/game/render/layout.ts");
    const { axialToPixel } = await import("../src/game/model/hex.ts");

    const metrics = getHexMetrics(runtime.viewport, runtime.state.map);
    const cssScale = rect.width / canvas.width;

    return coords.map((c: { q: number; r: number }) => {
      const px = axialToPixel(c, metrics.origin, metrics.size);
      return {
        x: rect.left + px.x * cssScale,
        y: rect.top + px.y * cssScale,
      };
    });
  }, coords);
}

/** Convenience: convert a single hex coord. */
async function hexToPage(page: Page, q: number, r: number): Promise<{ x: number; y: number }> {
  const [pos] = await hexToPagePixels(page, [{ q, r }]);
  return pos;
}

// ---------------------------------------------------------------------------
// SVG overlay injection
// ---------------------------------------------------------------------------

async function injectAnnotations(page: Page, annotation: Annotation): Promise<void> {
  await page.evaluate((arrows: Arrow[]) => {
    // Remove any existing overlay
    document.getElementById("tutorial-overlay")?.remove();

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.id = "tutorial-overlay";
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    svg.style.cssText = "position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:99999;pointer-events:none;";

    // Arrowhead marker
    const defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");

    // Filter for label background
    const filter = document.createElementNS("http://www.w3.org/2000/svg", "filter");
    filter.setAttribute("id", "label-bg");
    filter.setAttribute("x", "-0.06");
    filter.setAttribute("y", "-0.15");
    filter.setAttribute("width", "1.12");
    filter.setAttribute("height", "1.35");
    const flood = document.createElementNS("http://www.w3.org/2000/svg", "feFlood");
    flood.setAttribute("flood-color", "rgba(0,0,0,0.82)");
    flood.setAttribute("result", "bg");
    filter.appendChild(flood);
    const composite = document.createElementNS("http://www.w3.org/2000/svg", "feComposite");
    composite.setAttribute("in", "bg");
    composite.setAttribute("in2", "SourceGraphic");
    composite.setAttribute("operator", "atop");
    filter.appendChild(composite);

    const merge = document.createElementNS("http://www.w3.org/2000/svg", "feMerge");
    const mn1 = document.createElementNS("http://www.w3.org/2000/svg", "feMergeNode");
    mn1.setAttribute("in", "bg");
    merge.appendChild(mn1);
    const mn2 = document.createElementNS("http://www.w3.org/2000/svg", "feMergeNode");
    mn2.setAttribute("in", "SourceGraphic");
    merge.appendChild(mn2);
    filter.appendChild(merge);
    defs.appendChild(filter);
    svg.appendChild(defs);

    for (const arrow of arrows) {
      const color = arrow.color ?? "#00e5ff";

      // Unique marker per arrow for color support
      const markerId = `arrowhead-${Math.random().toString(36).slice(2, 8)}`;
      const marker = document.createElementNS("http://www.w3.org/2000/svg", "marker");
      marker.setAttribute("id", markerId);
      marker.setAttribute("markerWidth", "12");
      marker.setAttribute("markerHeight", "8");
      marker.setAttribute("refX", "10");
      marker.setAttribute("refY", "4");
      marker.setAttribute("orient", "auto");
      const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      poly.setAttribute("points", "0 0, 12 4, 0 8");
      poly.setAttribute("fill", color);
      marker.appendChild(poly);
      defs.appendChild(marker);

      // Arrow line
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", String(arrow.from.x));
      line.setAttribute("y1", String(arrow.from.y));
      line.setAttribute("x2", String(arrow.to.x));
      line.setAttribute("y2", String(arrow.to.y));
      line.setAttribute("stroke", color);
      line.setAttribute("stroke-width", "2.5");
      line.setAttribute("marker-end", `url(#${markerId})`);
      svg.appendChild(line);

      // Label background rect + text
      const labelG = document.createElementNS("http://www.w3.org/2000/svg", "g");

      // Determine label position: offset from the "from" point, away from arrow direction
      const dx = arrow.to.x - arrow.from.x;
      const dy = arrow.to.y - arrow.from.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const offsetX = -(dx / len) * 8;
      const offsetY = -(dy / len) * 8;
      const labelX = arrow.from.x + offsetX;
      const labelY = arrow.from.y + offsetY;

      // Decide text-anchor based on horizontal direction
      const anchor = dx > 20 ? "end" : dx < -20 ? "start" : "middle";

      // Background rect (sized dynamically via filter)
      const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
      text.setAttribute("x", String(labelX));
      text.setAttribute("y", String(labelY));
      text.setAttribute("fill", "#ffffff");
      text.setAttribute("font-size", "14");
      text.setAttribute("font-family", "'Segoe UI', system-ui, sans-serif");
      text.setAttribute("font-weight", "600");
      text.setAttribute("text-anchor", anchor);
      text.setAttribute("dominant-baseline", "auto");
      text.setAttribute("filter", "url(#label-bg)");
      text.setAttribute("paint-order", "stroke");
      text.setAttribute("stroke", "rgba(0,0,0,0.7)");
      text.setAttribute("stroke-width", "4");
      text.textContent = arrow.label;
      labelG.appendChild(text);

      svg.appendChild(labelG);
    }

    document.body.appendChild(svg);
  }, annotation.arrows);

  // Small delay to ensure SVG renders
  await page.waitForTimeout(100);
}

async function clearAnnotations(page: Page): Promise<void> {
  await page.evaluate(() => {
    document.getElementById("tutorial-overlay")?.remove();
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resetGame(page: Page): Promise<void> {
  await clearAnnotations(page);
  await page.evaluate(() => {
    const runtime = (window as any).__gameRuntime;
    if (!runtime) throw new Error("__gameRuntime not found on window");

    runtime.resetWithContent({
      builtInSetIds: ["alpha"],
      factions: {
        player_1: "alloy_clan",
        player_2: "flux_collective",
      },
      seed: 20260408,
    });

    runtime.animations = [];
    if (runtime.automationTimer) {
      clearTimeout(runtime.automationTimer);
      runtime.automationTimer = null;
    }
    runtime.automationTimerDueAtMs = 0;

    for (const pid of runtime.state.playerOrder) {
      runtime.botAutoplayEnabled[pid] = false;
    }

    runtime.pendingCardTargeting = null;
    runtime.pendingAttackTargeting = null;
    runtime.notifyListeners();
  });

  await page.waitForTimeout(RENDER_SETTLE_MS);
}

async function settleRender(page: Page): Promise<void> {
  await page.evaluate(() => {
    const runtime = (window as any).__gameRuntime;
    runtime.animations = [];
    runtime.notifyListeners();
  });
  await page.waitForTimeout(RENDER_SETTLE_MS);
}

async function screenshot(page: Page, name: string): Promise<void> {
  const path = join(OUTPUT_DIR, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  console.log(`  captured ${name}.png`);
}

async function waitForGameReady(page: Page): Promise<void> {
  await page.waitForSelector("canvas", { timeout: 10_000 });
  await page.waitForFunction(
    () => (window as any).__gameRuntime != null && (window as any).__spaceTraderRuntimeReady === true,
    { timeout: 10_000 }
  );
}

/** Get bounding box center of a DOM element by selector (returns null if not found) */
async function elementCenter(page: Page, selector: string): Promise<{ x: number; y: number } | null> {
  const count = await page.locator(selector).count();
  if (count === 0) return null;
  const box = await page.locator(selector).first().boundingBox();
  if (!box) return null;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Get bounding box edges of a DOM element (returns null if not found) */
async function elementBox(page: Page, selector: string): Promise<{ x: number; y: number; width: number; height: number } | null> {
  const count = await page.locator(selector).count();
  if (count === 0) return null;
  return page.locator(selector).first().boundingBox();
}

// ---------------------------------------------------------------------------
// Tutorial Steps
// ---------------------------------------------------------------------------

type TutorialStep = {
  name: string;
  title: string;
  setup: (page: Page) => Promise<void>;
  annotate: (page: Page) => Promise<Annotation>;
};

const steps: TutorialStep[] = [
  // -----------------------------------------------------------------------
  // Step 1: Battlefield Overview
  // -----------------------------------------------------------------------
  {
    name: "01-battlefield-overview",
    title: "The Battlefield",
    setup: async (page) => {
      await resetGame(page);
      await page.evaluate(() => {
        const runtime = (window as any).__gameRuntime;
        const state = runtime.state;
        state.phase = "main";
        state.priorityPlayerId = "player_1";
      });
      await settleRender(page);
    },
    annotate: async (page) => {
      const [p1Base, p2Base, resourceNode] = await hexToPagePixels(page, [
        { q: -4, r: -2 }, { q: 4, r: 2 }, { q: -3, r: -1 },
      ]);
      const handBox = await elementBox(page, ".hand-tray");
      const resourceBar = await elementBox(page, ".top-bar-player-resources");

      const arrows: Arrow[] = [
        {
          label: "Your Base",
          from: { x: p1Base.x + 60, y: p1Base.y - 60 },
          to: p1Base,
        },
        {
          label: "Enemy Base",
          from: { x: p2Base.x - 60, y: p2Base.y + 60 },
          to: p2Base,
        },
        {
          label: "Resource Node",
          from: { x: resourceNode.x + 80, y: resourceNode.y + 60 },
          to: resourceNode,
          color: "#ffd740",
        },
      ];

      if (handBox) {
        arrows.push({
          label: "Your Hand",
          from: { x: handBox.x + 200, y: handBox.y - 15 },
          to: { x: handBox.x + 200, y: handBox.y + 15 },
          color: "#69f0ae",
        });
      }

      if (resourceBar) {
        arrows.push({
          label: "Resources",
          from: { x: resourceBar.x + 40, y: resourceBar.y + resourceBar.height + 35 },
          to: { x: resourceBar.x + 40, y: resourceBar.y + resourceBar.height },
          color: "#69f0ae",
        });
      }

      return { arrows };
    },
  },

  // -----------------------------------------------------------------------
  // Step 2: Resources
  // -----------------------------------------------------------------------
  {
    name: "02-resources",
    title: "Understanding Resources",
    setup: async (page) => {
      await resetGame(page);
      await page.evaluate(() => {
        const runtime = (window as any).__gameRuntime;
        const state = runtime.state;
        state.phase = "main";
        state.priorityPlayerId = "player_1";
      });
      await settleRender(page);
    },
    annotate: async (page) => {
      const resourceBar = await elementBox(page, ".top-bar-player-resources");
      const firstCard = await elementBox(page, ".hand-card");

      const arrows: Arrow[] = [];

      if (resourceBar) {
        arrows.push({
          label: "Credits (universal currency)",
          from: { x: resourceBar.x + 40, y: resourceBar.y + resourceBar.height + 40 },
          to: { x: resourceBar.x + 20, y: resourceBar.y + resourceBar.height },
          color: "#ffd740",
        });
        arrows.push({
          label: "Alloy (faction resource)",
          from: { x: resourceBar.x + 120, y: resourceBar.y + resourceBar.height + 65 },
          to: { x: resourceBar.x + 60, y: resourceBar.y + resourceBar.height },
          color: "#ff6e40",
        });
      }

      if (firstCard) {
        arrows.push({
          label: "Card cost",
          from: { x: firstCard.x + 50, y: firstCard.y + 95 },
          to: { x: firstCard.x + 20, y: firstCard.y + 78 },
          color: "#69f0ae",
        });
      }

      return { arrows };
    },
  },

  // -----------------------------------------------------------------------
  // Step 3: Turn Phases
  // -----------------------------------------------------------------------
  {
    name: "03-turn-phases",
    title: "Turn Phases",
    setup: async (page) => {
      await resetGame(page);
      await page.evaluate(() => {
        const runtime = (window as any).__gameRuntime;
        const state = runtime.state;
        state.phase = "tactical";
        state.priorityPlayerId = null;
      });
      await settleRender(page);
    },
    annotate: async (page) => {
      // Find the active phase pill (the <li> with aria-current or .active)
      const phaseTrack = await elementBox(page, ".command-stack-phase-track");
      const endPhaseBtn = await elementBox(page, ".command-stack-controls-actions button");

      const arrows: Arrow[] = [];

      if (phaseTrack) {
        arrows.push({
          label: "Phase track — current phase highlighted",
          from: { x: phaseTrack.x - 20, y: phaseTrack.y + phaseTrack.height / 2 },
          to: { x: phaseTrack.x + 10, y: phaseTrack.y + phaseTrack.height / 2 },
          color: "#69f0ae",
        });
      }

      if (endPhaseBtn) {
        arrows.push({
          label: "Press N or click to advance",
          from: { x: endPhaseBtn.x - 60, y: endPhaseBtn.y + endPhaseBtn.height / 2 },
          to: { x: endPhaseBtn.x + 5, y: endPhaseBtn.y + endPhaseBtn.height / 2 },
          color: "#ffd740",
        });
      }

      return { arrows };
    },
  },

  // -----------------------------------------------------------------------
  // Step 4: Deploying a Unit
  // -----------------------------------------------------------------------
  {
    name: "04-deploy-unit",
    title: "Deploying a Unit",
    setup: async (page) => {
      await resetGame(page);
      await page.evaluate(() => {
        const runtime = (window as any).__gameRuntime;
        const state = runtime.state;
        state.phase = "main";
        state.priorityPlayerId = "player_1";

        const hand = state.zones.player_1.hand;
        const unitCard = hand.find((c: any) => c.cardId.endsWith("_card"));

        if (unitCard) {
          runtime.pendingCardTargeting = {
            playerId: "player_1",
            cardInstanceId: unitCard.instanceId,
            cardName: unitCard.cardId.replace(/_card$/, "").replace(/_/g, " "),
            targetMode: "hex",
            prompt: "Choose a deployment tile adjacent to your base",
          };
        }
      });
      await settleRender(page);
    },
    annotate: async (page) => {
      const deployTile = await hexToPage(page, -3, -2); // adjacent to base
      const firstCard = await elementBox(page, ".hand-card");

      const arrows: Arrow[] = [
        {
          label: "Valid deployment tiles",
          from: { x: deployTile.x + 80, y: deployTile.y - 50 },
          to: deployTile,
          color: "#69f0ae",
        },
      ];

      if (firstCard) {
        arrows.push({
          label: "Click a unit card to deploy",
          from: { x: firstCard.x + firstCard.width / 2, y: firstCard.y - 20 },
          to: { x: firstCard.x + firstCard.width / 2, y: firstCard.y + 10 },
          color: "#ffd740",
        });
      }

      return { arrows };
    },
  },

  // -----------------------------------------------------------------------
  // Step 5: Unit on the Battlefield
  // -----------------------------------------------------------------------
  {
    name: "05-unit-deployed",
    title: "Unit on the Battlefield",
    setup: async (page) => {
      await resetGame(page);
      await page.evaluate(() => {
        const runtime = (window as any).__gameRuntime;
        const state = runtime.state;
        state.phase = "main";
        state.priorityPlayerId = "player_1";

        const deployedId = "unit_deployed_guard";
        state.entities[deployedId] = {
          id: deployedId, kind: "unit", name: "Alloy Guard",
          ownerId: "player_1", role: "combat",
          hp: 8, maxHp: 8, attackDamage: 2, siegeDamageBonus: 2,
          armor: 1, moveRange: 1, attackRange: 1, attackActionsPerTurn: 1,
          coord: { q: -3, r: -1 }, keywords: ["salvage", "bastion"],
          carries: null, sourceCardId: "alloy_guard_card",
          hasSummoningSickness: true, movesRemaining: 0, attacksRemaining: 0,
          temporaryAttackBonus: 0, temporaryArmorBonus: 0,
        };
        state.selectedEntityId = deployedId;
      });
      await settleRender(page);
    },
    annotate: async (page) => {
      const unitPos = await hexToPage(page, -3, -1);
      const hudPanel = await elementBox(page, ".selected-unit-panel");
      const sicknessChip = await elementBox(page, ".game-hud-pill.bad");

      const arrows: Arrow[] = [
        {
          label: "Newly deployed unit",
          from: { x: unitPos.x + 80, y: unitPos.y + 60 },
          to: unitPos,
        },
      ];

      if (hudPanel) {
        arrows.push({
          label: "Unit stats (HP, ATK, ARM, MOV)",
          from: { x: hudPanel.x - 20, y: hudPanel.y + 80 },
          to: { x: hudPanel.x + 15, y: hudPanel.y + 60 },
          color: "#69f0ae",
        });
      }

      if (sicknessChip) {
        arrows.push({
          label: "Summoning sickness",
          from: { x: sicknessChip.x - 20, y: sicknessChip.y + sicknessChip.height / 2 },
          to: { x: sicknessChip.x + 5, y: sicknessChip.y + sicknessChip.height / 2 },
          color: "#ff6e40",
        });
      }

      return { arrows };
    },
  },

  // -----------------------------------------------------------------------
  // Step 6: Moving a Unit
  // -----------------------------------------------------------------------
  {
    name: "06-move-unit",
    title: "Moving a Unit",
    setup: async (page) => {
      await resetGame(page);
      await page.evaluate(() => {
        const runtime = (window as any).__gameRuntime;
        const state = runtime.state;
        state.turn = 2;
        state.phase = "tactical";
        state.priorityPlayerId = null;

        const scout = state.entities["unit_player_1_scout"];
        if (scout && scout.kind === "unit") {
          scout.hasSummoningSickness = false;
          scout.movesRemaining = scout.moveRange;
          scout.attacksRemaining = scout.attackActionsPerTurn;
        }
        state.selectedEntityId = "unit_player_1_scout";
      });
      await settleRender(page);
    },
    annotate: async (page) => {
      const [scoutPos, moveTarget] = await hexToPagePixels(page, [
        { q: -3, r: -2 }, { q: -2, r: -2 },
      ]);

      return {
        arrows: [
          {
            label: "Selected unit",
            from: { x: scoutPos.x + 80, y: scoutPos.y - 70 },
            to: scoutPos,
          },
          {
            label: "Click a highlighted hex to move",
            from: { x: moveTarget.x + 100, y: moveTarget.y - 40 },
            to: moveTarget,
            color: "#69f0ae",
          },
        ],
      };
    },
  },

  // -----------------------------------------------------------------------
  // Step 7: Attacking
  // -----------------------------------------------------------------------
  {
    name: "07-attack-mode",
    title: "Attacking",
    setup: async (page) => {
      await resetGame(page);
      await page.evaluate(() => {
        const runtime = (window as any).__gameRuntime;
        const state = runtime.state;
        state.turn = 3;
        state.phase = "tactical";
        state.priorityPlayerId = null;

        const p1Scout = state.entities["unit_player_1_scout"];
        if (p1Scout && p1Scout.kind === "unit") {
          p1Scout.coord = { q: 0, r: 0 };
          p1Scout.hasSummoningSickness = false;
          p1Scout.movesRemaining = 0;
          p1Scout.attacksRemaining = 1;
        }

        const p2Scout = state.entities["unit_player_2_scout"];
        if (p2Scout && p2Scout.kind === "unit") {
          p2Scout.coord = { q: 1, r: 0 };
          p2Scout.hasSummoningSickness = false;
        }

        state.selectedEntityId = "unit_player_1_scout";

        runtime.pendingAttackTargeting = {
          playerId: "player_1",
          attackerId: "unit_player_1_scout",
          attackerName: "Frontline Scout",
          prompt: "Select an enemy to attack",
        };
      });
      await settleRender(page);
    },
    annotate: async (page) => {
      const [attacker, target] = await hexToPagePixels(page, [
        { q: 0, r: 0 }, { q: 1, r: 0 },
      ]);

      return {
        arrows: [
          {
            label: "Your unit (press A for attack mode)",
            from: { x: attacker.x - 60, y: attacker.y - 60 },
            to: attacker,
          },
          {
            label: "Click to attack",
            from: { x: target.x + 80, y: target.y - 50 },
            to: target,
            color: "#ff5252",
          },
        ],
      };
    },
  },

  // -----------------------------------------------------------------------
  // Step 8: Harvesting
  // -----------------------------------------------------------------------
  {
    name: "08-harvesting-overview",
    title: "Resource Harvesting",
    setup: async (page) => {
      await resetGame(page);
      await page.evaluate(() => {
        const runtime = (window as any).__gameRuntime;
        const state = runtime.state;
        state.turn = 2;
        state.phase = "tactical";
        state.priorityPlayerId = null;

        const harvester = state.entities["unit_player_1_harvester"];
        if (harvester && harvester.kind === "unit") {
          harvester.coord = { q: -3, r: -1 };
          harvester.hasSummoningSickness = false;
          harvester.movesRemaining = 0;
        }

        const alloyNode = state.map.resourceNodes.find(
          (n: any) => n.id === "frontier_alloy_west"
        );
        if (alloyNode) alloyNode.controlledBy = "player_1";

        state.tacticalHarvestEligibleUnitIds = ["unit_player_1_harvester"];
        state.tacticalHarvestedUnitIds = [];
        state.selectedEntityId = "unit_player_1_harvester";
      });
      await settleRender(page);
    },
    annotate: async (page) => {
      const [harvesterPos, basePos] = await hexToPagePixels(page, [
        { q: -3, r: -1 }, { q: -4, r: -2 },
      ]);

      return {
        arrows: [
          {
            label: "Harvester on controlled node — press H",
            from: { x: harvesterPos.x + 90, y: harvesterPos.y - 60 },
            to: harvesterPos,
            color: "#ffd740",
          },
          {
            label: "Return to base to deposit",
            from: { x: basePos.x + 80, y: basePos.y + 60 },
            to: basePos,
            color: "#69f0ae",
          },
        ],
      };
    },
  },

  // -----------------------------------------------------------------------
  // Step 9: Loaded Cargo
  // -----------------------------------------------------------------------
  {
    name: "09-harvest-loaded",
    title: "Loaded Cargo",
    setup: async (page) => {
      await resetGame(page);
      await page.evaluate(() => {
        const runtime = (window as any).__gameRuntime;
        const state = runtime.state;
        state.turn = 2;
        state.phase = "tactical";
        state.priorityPlayerId = null;

        const harvester = state.entities["unit_player_1_harvester"];
        if (harvester && harvester.kind === "unit") {
          harvester.coord = { q: -3, r: -1 };
          harvester.hasSummoningSickness = false;
          harvester.carries = "alloy";
          harvester.movesRemaining = harvester.moveRange;
        }

        const alloyNode = state.map.resourceNodes.find(
          (n: any) => n.id === "frontier_alloy_west"
        );
        if (alloyNode) alloyNode.controlledBy = "player_1";

        state.selectedEntityId = "unit_player_1_harvester";
      });
      await settleRender(page);
    },
    annotate: async (page) => {
      // Find the cargo pill in the HUD
      const cargoPill = await elementBox(page, ".game-hud-pill-row");

      const arrows: Arrow[] = [];
      if (cargoPill) {
        arrows.push({
          label: "Carrying cargo!",
          from: { x: cargoPill.x - 20, y: cargoPill.y + cargoPill.height / 2 },
          to: { x: cargoPill.x + 5, y: cargoPill.y + cargoPill.height / 2 },
          color: "#ffd740",
        });
      }

      return { arrows };
    },
  },

  // -----------------------------------------------------------------------
  // Step 10: Playing a Tactic
  // -----------------------------------------------------------------------
  {
    name: "10-play-tactic",
    title: "Playing Tactics",
    setup: async (page) => {
      await resetGame(page);
      await page.evaluate(() => {
        const runtime = (window as any).__gameRuntime;
        const state = runtime.state;
        state.turn = 3;
        state.phase = "tactical";
        state.priorityPlayerId = "player_1";
        state.consecutivePriorityPasses = 0;

        const p2Scout = state.entities["unit_player_2_scout"];
        if (p2Scout && p2Scout.kind === "unit") {
          p2Scout.coord = { q: 1, r: 0 };
          p2Scout.hp = 6;
        }

        state.stack = [
          {
            id: "stack_tactic_1", label: "Slag Barrage",
            controllerId: "player_1", ownerId: "player_1",
            effectId: "damage_enemy_entity_2", effectMagnitude: 2,
            targetStackItemId: null, targetEntityId: "unit_player_2_scout",
            targetHex: null, objectKind: "spell",
            counterable: true, defaultCounterDestination: "discard",
            sourceCardInstanceId: "p1_tactic_demo", sourceCardId: "slag_barrage",
            sourceCardOwnerId: "player_1", pendingUnitEntityId: null,
          },
        ];
      });
      await settleRender(page);
    },
    annotate: async (page) => {
      const stackItem = await elementBox(page, ".command-stack-item");

      const arrows: Arrow[] = [];
      if (stackItem) {
        arrows.push({
          label: "Tactic on the stack",
          from: { x: stackItem.x - 30, y: stackItem.y + stackItem.height / 2 },
          to: { x: stackItem.x + 5, y: stackItem.y + stackItem.height / 2 },
          color: "#69f0ae",
        });
        arrows.push({
          label: "Opponent can respond before it resolves",
          from: { x: stackItem.x - 30, y: stackItem.y + stackItem.height + 25 },
          to: { x: stackItem.x + 5, y: stackItem.y + stackItem.height + 5 },
          color: "#ffd740",
        });
      }

      return { arrows };
    },
  },

  // -----------------------------------------------------------------------
  // Step 11: Stack and Priority
  // -----------------------------------------------------------------------
  {
    name: "11-stack-priority",
    title: "The Stack and Priority",
    setup: async (page) => {
      await resetGame(page);
      await page.evaluate(() => {
        const runtime = (window as any).__gameRuntime;
        const state = runtime.state;
        state.turn = 3;
        state.phase = "tactical";
        state.consecutivePriorityPasses = 0;
        state.priorityPlayerId = "player_1";

        const p2Scout = state.entities["unit_player_2_scout"];
        if (p2Scout && p2Scout.kind === "unit") {
          p2Scout.coord = { q: 1, r: 0 };
        }

        state.stack = [
          {
            id: "stack_tactic_1", label: "Slag Barrage",
            controllerId: "player_1", ownerId: "player_1",
            effectId: "damage_enemy_entity_2", effectMagnitude: 2,
            targetStackItemId: null, targetEntityId: "unit_player_2_scout",
            targetHex: null, objectKind: "spell",
            counterable: true, defaultCounterDestination: "discard",
            sourceCardInstanceId: "p1_tactic_demo", sourceCardId: "slag_barrage",
            sourceCardOwnerId: "player_1", pendingUnitEntityId: null,
          },
          {
            id: "stack_counter_1", label: "Counter Pulse",
            controllerId: "player_2", ownerId: "player_2",
            effectId: "counter_stack_item", effectMagnitude: 1,
            targetStackItemId: "stack_tactic_1", targetEntityId: null,
            targetHex: null, objectKind: "spell",
            counterable: true, defaultCounterDestination: "discard",
            sourceCardInstanceId: "p2_counter_demo", sourceCardId: "counter_pulse",
            sourceCardOwnerId: "player_2", pendingUnitEntityId: null,
          },
        ];
      });
      await settleRender(page);
    },
    annotate: async (page) => {
      const stackItems = await page.locator(".command-stack-item").all();
      const arrows: Arrow[] = [];

      // The list renders bottom-of-stack first, top last
      if (stackItems.length >= 2) {
        const bottomBox = await stackItems[0].boundingBox();
        const topBox = await stackItems[1].boundingBox();

        if (topBox) {
          arrows.push({
            label: "Top resolves first (counter!)",
            from: { x: topBox.x - 30, y: topBox.y + topBox.height / 2 },
            to: { x: topBox.x + 5, y: topBox.y + topBox.height / 2 },
            color: "#ff5252",
          });
        }
        if (bottomBox) {
          arrows.push({
            label: "Original spell (will be countered)",
            from: { x: bottomBox.x - 30, y: bottomBox.y + bottomBox.height / 2 },
            to: { x: bottomBox.x + 5, y: bottomBox.y + bottomBox.height / 2 },
            color: "#ffd740",
          });
        }
      }

      const passBtn = await elementBox(page, ".command-stack-controls-actions button:last-child");
      if (passBtn) {
        arrows.push({
          label: "Press P to pass priority",
          from: { x: passBtn.x - 60, y: passBtn.y + passBtn.height / 2 },
          to: { x: passBtn.x + 5, y: passBtn.y + passBtn.height / 2 },
          color: "#69f0ae",
        });
      }

      return { arrows };
    },
  },

  // -----------------------------------------------------------------------
  // Step 12: Base Assault
  // -----------------------------------------------------------------------
  {
    name: "12-base-assault",
    title: "Winning the Game",
    setup: async (page) => {
      await resetGame(page);
      await page.evaluate(() => {
        const runtime = (window as any).__gameRuntime;
        const state = runtime.state;
        state.turn = 8;
        state.phase = "tactical";
        state.priorityPlayerId = null;

        const p2Base = state.entities["base_player_2"];
        if (p2Base) p2Base.hp = 4;

        const p1Scout = state.entities["unit_player_1_scout"];
        if (p1Scout && p1Scout.kind === "unit") {
          p1Scout.coord = { q: 3, r: 2 };
          p1Scout.hasSummoningSickness = false;
          p1Scout.movesRemaining = 0;
          p1Scout.attacksRemaining = 1;
        }

        const siegeUnitId = "unit_p1_siege_guard";
        state.entities[siegeUnitId] = {
          id: siegeUnitId, kind: "unit", name: "Alloy Guard",
          ownerId: "player_1", role: "combat",
          hp: 8, maxHp: 8, attackDamage: 2, siegeDamageBonus: 2,
          armor: 1, moveRange: 1, attackRange: 1, attackActionsPerTurn: 1,
          coord: { q: 4, r: 1 }, keywords: ["salvage", "bastion"],
          carries: null, sourceCardId: "alloy_guard_card",
          hasSummoningSickness: false, movesRemaining: 0, attacksRemaining: 1,
          temporaryAttackBonus: 0, temporaryArmorBonus: 0,
        };

        state.selectedEntityId = "unit_player_1_scout";

        runtime.pendingAttackTargeting = {
          playerId: "player_1",
          attackerId: "unit_player_1_scout",
          attackerName: "Frontline Scout",
          prompt: "Select an enemy to attack",
        };
      });
      await settleRender(page);
    },
    annotate: async (page) => {
      const [p2Base, attacker1] = await hexToPagePixels(page, [
        { q: 4, r: 2 }, { q: 3, r: 2 },
      ]);

      return {
        arrows: [
          {
            label: "Enemy base at 4 HP",
            from: { x: p2Base.x - 60, y: p2Base.y - 60 },
            to: p2Base,
            color: "#ff5252",
          },
          {
            label: "Your units — attack to win!",
            from: { x: attacker1.x - 60, y: attacker1.y + 60 },
            to: attacker1,
            color: "#69f0ae",
          },
        ],
      };
    },
  },
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log("Launching browser...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  console.log(`Navigating to ${DEV_SERVER_URL}...`);
  await page.goto(DEV_SERVER_URL, { waitUntil: "networkidle" });

  await waitForGameReady(page);

  await page.waitForTimeout(1_000);

  console.log(`Capturing ${steps.length} tutorial screenshots...\n`);

  for (const step of steps) {
    console.log(`Step: ${step.title}`);
    await step.setup(page);
    const annotation = await step.annotate(page);
    await injectAnnotations(page, annotation);
    await page.waitForTimeout(100);
    await screenshot(page, step.name);
    await clearAnnotations(page);
    console.log();
  }

  await browser.close();
  console.log(`Done. Screenshots saved to ${OUTPUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
