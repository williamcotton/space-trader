import * as THREE from "three";
import { getPlayableHexes, hexDistance, isWithinMapBounds, pixelToAxial } from "../model/hex";
import type { PlayerId } from "../model/ids";
import type { EntityState, GameState, HexCoord } from "../model/state";
import { findEntityAtHex } from "../model/queries";
import { getPlayerTheme, getResourceTheme, getUnitRoleTheme } from "../presentation";
import { getAttackableEntitiesForUnit } from "../rules/directInteraction";
import { tryGetFactionPresentation, tryGetRegisteredResourceTheme } from "../registries/presentation";
import type { CanvasAnimation, GameRenderer, RuntimeFrame } from "../types";

const HEX_RADIUS = 1;
const SQRT3 = Math.sqrt(3);

type DisposableObject = THREE.Object3D & {
  geometry?: THREE.BufferGeometry;
  material?: THREE.Material | THREE.Material[];
};

function hexToWorld(coord: HexCoord, y = 0): THREE.Vector3 {
  return new THREE.Vector3(
    HEX_RADIUS * SQRT3 * (coord.q + coord.r / 2),
    y,
    HEX_RADIUS * 1.5 * coord.r
  );
}

function createHexGeometry(radius: number): THREE.BufferGeometry {
  const vertices: number[] = [0, 0, 0];
  for (let side = 0; side < 6; side += 1) {
    const angle = -Math.PI / 6 + (Math.PI * 2 * side) / 6;
    vertices.push(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
  }

  const indices: number[] = [];
  for (let side = 1; side <= 6; side += 1) {
    indices.push(0, side, side === 6 ? 1 : side + 1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createHexLineGeometry(radius: number): THREE.BufferGeometry {
  const points: THREE.Vector3[] = [];
  for (let side = 0; side <= 6; side += 1) {
    const angle = -Math.PI / 6 + (Math.PI * 2 * (side % 6)) / 6;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
  }
  return new THREE.BufferGeometry().setFromPoints(points);
}

function disposeMaterial(material: THREE.Material): void {
  const materialWithMap = material as THREE.Material & { map?: THREE.Texture };
  materialWithMap.map?.dispose();
  material.dispose();
}

function disposeObject(object: THREE.Object3D): void {
  object.traverse((child) => {
    const disposable = child as DisposableObject;
    disposable.geometry?.dispose();
    if (Array.isArray(disposable.material)) {
      disposable.material.forEach(disposeMaterial);
    } else {
      disposable.material && disposeMaterial(disposable.material);
    }
  });
}

function clearGroup(group: THREE.Group): void {
  while (group.children.length > 0) {
    const child = group.children[0];
    group.remove(child);
    disposeObject(child);
  }
}

function makeCanvasTextSprite(
  text: string,
  options: {
    color?: string;
    background?: string;
    fontSize?: number;
    padding?: number;
    scale?: number;
  } = {}
): THREE.Sprite {
  const fontSize = options.fontSize ?? 36;
  const padding = options.padding ?? 16;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) {
    return new THREE.Sprite();
  }

  context.font = `700 ${fontSize}px "Avenir Next", "Trebuchet MS", sans-serif`;
  const textWidth = Math.ceil(context.measureText(text).width);
  canvas.width = Math.max(32, textWidth + padding * 2);
  canvas.height = Math.max(32, fontSize + padding * 2);

  context.font = `700 ${fontSize}px "Avenir Next", "Trebuchet MS", sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  if (options.background) {
    context.fillStyle = options.background;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.fillStyle = options.color ?? "#eff6ff";
  context.fillText(text, canvas.width / 2, canvas.height / 2 + 1);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  const scale = options.scale ?? 0.7;
  sprite.scale.set((canvas.width / canvas.height) * scale, scale, 1);
  return sprite;
}

function makeGlowDisc(color: string, radius: number, opacity: number): THREE.Mesh {
  const geometry = new THREE.CircleGeometry(radius, 48);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  return new THREE.Mesh(geometry, material);
}

function entitySortValue(entity: EntityState): number {
  return entity.kind === "base" ? 0 : 1;
}

function resolveAccentColor(accent: string): string {
  if (accent === "neutral") {
    return "#e6edff";
  }
  if (accent.startsWith("player_")) {
    return getPlayerTheme(accent as PlayerId).primary;
  }
  return tryGetFactionPresentation(accent)?.theme.primary ?? tryGetRegisteredResourceTheme(accent)?.color ?? "#e6edff";
}

export class ThreeGameRenderer implements GameRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-8, 8, 6, -6, 0.1, 100);
  private readonly raycaster = new THREE.Raycaster();
  private readonly pointer = new THREE.Vector2();
  private readonly pickPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly boardGroup = new THREE.Group();
  private readonly entityGroup = new THREE.Group();
  private readonly overlayGroup = new THREE.Group();
  private readonly animationGroup = new THREE.Group();
  private viewportWidth = 1;
  private viewportHeight = 1;
  private boardKey = "";
  private mapCenter = new THREE.Vector3();
  private mapHalfWidth = 4;
  private mapHalfDepth = 3;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x050816, 1);

    this.scene.background = new THREE.Color(0x050816);
    this.scene.add(this.boardGroup, this.overlayGroup, this.entityGroup, this.animationGroup);

    const ambient = new THREE.AmbientLight(0xcad8ff, 1.4);
    const key = new THREE.DirectionalLight(0xffffff, 1.7);
    key.position.set(5, 8, 6);
    const fill = new THREE.DirectionalLight(0x65e0c2, 0.55);
    fill.position.set(-5, 4, -3);
    this.scene.add(ambient, key, fill);

    this.addStarfield();
  }

  setViewport(width: number, height: number, scale: number): void {
    this.viewportWidth = Math.max(1, width);
    this.viewportHeight = Math.max(1, height);
    this.renderer.setPixelRatio(scale);
    this.renderer.setSize(this.viewportWidth / scale, this.viewportHeight / scale, false);
    this.fitCamera();
  }

  render(state: GameState, frame: RuntimeFrame): void {
    const nextBoardKey = this.buildBoardKey(state);
    if (nextBoardKey !== this.boardKey) {
      this.boardKey = nextBoardKey;
      this.rebuildBoard(state);
      this.fitCamera();
    }

    this.rebuildOverlays(state, frame);
    this.rebuildEntities(state);
    this.rebuildAnimations(frame);
    this.renderer.render(this.scene, this.camera);
  }

  pickHex(clientX: number, clientY: number): HexCoord | null {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -(((clientY - rect.top) / rect.height) * 2 - 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const intersection = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.pickPlane, intersection)) {
      return null;
    }

    const coord = pixelToAxial({ x: intersection.x, y: intersection.z }, { x: 0, y: 0 }, HEX_RADIUS);
    return coord;
  }

  dispose(): void {
    clearGroup(this.boardGroup);
    clearGroup(this.overlayGroup);
    clearGroup(this.entityGroup);
    clearGroup(this.animationGroup);
    this.renderer.dispose();
  }

  private buildBoardKey(state: GameState): string {
    return [
      state.map.id,
      state.map.width,
      state.map.height,
      state.map.playableHexes?.length ?? 0,
      ...state.map.resourceNodes.map((node) => `${node.coord.q},${node.coord.r},${node.resourceType},${node.controlledBy ?? "none"}`),
      ...state.playerOrder.map((playerId) => `${playerId}:${state.players[playerId]?.faction ?? "none"}`),
    ].join("|");
  }

  private addStarfield(): void {
    const positions: number[] = [];
    for (let index = 0; index < 180; index += 1) {
      const x = ((index * 37) % 100 - 50) * 0.55;
      const y = 7 + ((index * 19) % 70) * 0.08;
      const z = ((index * 53) % 100 - 50) * 0.55;
      positions.push(x, y, z);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0xd8e8ff,
      size: 0.035,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
    });
    this.scene.add(new THREE.Points(geometry, material));
  }

  private rebuildBoard(state: GameState): void {
    clearGroup(this.boardGroup);

    const hexGeometry = createHexGeometry(HEX_RADIUS * 0.94);
    const lineGeometry = createHexLineGeometry(HEX_RADIUS * 0.95);
    const tileMaterial = new THREE.MeshStandardMaterial({
      color: 0x0b1738,
      emissive: 0x07112b,
      roughness: 0.72,
      metalness: 0.12,
      transparent: true,
      opacity: 0.92,
    });
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x42629c,
      transparent: true,
      opacity: 0.7,
    });

    const playableHexes = getPlayableHexes(state.map);
    const bounds = new THREE.Box3();
    for (const coord of playableHexes) {
      const position = hexToWorld(coord);
      bounds.expandByPoint(position);

      const tile = new THREE.Mesh(hexGeometry, tileMaterial);
      tile.position.copy(position);
      this.boardGroup.add(tile);

      const outline = new THREE.Line(lineGeometry, lineMaterial);
      outline.position.set(position.x, 0.025, position.z);
      this.boardGroup.add(outline);
    }

    for (const node of state.map.resourceNodes) {
      const theme = getResourceTheme(node.resourceType);
      const position = hexToWorld(node.coord, 0.12);
      const glow = makeGlowDisc(theme.color, 0.82, 0.2);
      glow.position.copy(hexToWorld(node.coord, 0.035));
      this.boardGroup.add(glow);

      const nodeMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.28, 0.34, 0.16, 32),
        new THREE.MeshStandardMaterial({
          color: theme.color,
          emissive: theme.color,
          emissiveIntensity: 0.35,
          roughness: 0.44,
          metalness: 0.22,
        })
      );
      nodeMesh.position.copy(position);
      this.boardGroup.add(nodeMesh);

      if (node.controlledBy) {
        const controlRing = new THREE.Line(
          createHexLineGeometry(0.48),
          new THREE.LineBasicMaterial({ color: getPlayerTheme(node.controlledBy).line })
        );
        controlRing.position.copy(hexToWorld(node.coord, 0.22));
        this.boardGroup.add(controlRing);
      }

      const label = makeCanvasTextSprite(node.displayName, {
        color: "#dbe8ff",
        fontSize: 28,
        scale: 0.42,
      });
      label.position.copy(hexToWorld(node.coord, 0.72));
      this.boardGroup.add(label);
    }

    this.mapCenter = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    this.mapHalfWidth = Math.max(1, size.x / 2);
    this.mapHalfDepth = Math.max(1, size.z / 2);
  }

  private rebuildEntities(state: GameState): void {
    clearGroup(this.entityGroup);

    const entities = Object.values(state.entities).sort((a, b) => entitySortValue(a) - entitySortValue(b));
    for (const entity of entities) {
      if (entity.kind === "base") {
        this.addBase(entity);
      } else {
        this.addUnit(state, entity);
      }
    }
  }

  private addBase(entity: EntityState): void {
    if (entity.kind !== "base") {
      return;
    }
    const theme = getPlayerTheme(entity.ownerId);
    const root = new THREE.Group();
    root.position.copy(hexToWorld(entity.coord, 0.28));

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.72, 0.86, 0.56, 6),
      new THREE.MeshStandardMaterial({
        color: theme.primary,
        emissive: theme.secondary,
        emissiveIntensity: 0.28,
        roughness: 0.38,
        metalness: 0.22,
      })
    );
    root.add(body);

    const core = new THREE.Mesh(
      new THREE.CylinderGeometry(0.34, 0.38, 0.62, 6),
      new THREE.MeshStandardMaterial({ color: 0x071026, roughness: 0.65, metalness: 0.1 })
    );
    core.position.y = 0.05;
    root.add(core);

    const hp = makeCanvasTextSprite(String(entity.hp), {
      color: "#ffffff",
      fontSize: 42,
      scale: 0.5,
    });
    hp.position.set(0, 0.78, 0);
    root.add(hp);

    this.entityGroup.add(root);
  }

  private addUnit(state: GameState, entity: EntityState): void {
    if (entity.kind !== "unit") {
      return;
    }

    const theme = getPlayerTheme(entity.ownerId);
    const roleTheme = getUnitRoleTheme(entity.role);
    const root = new THREE.Group();
    root.position.copy(hexToWorld(entity.coord, 0.34));

    const shadow = makeGlowDisc(theme.primary, 0.52, 0.18);
    shadow.position.y = -0.31;
    root.add(shadow);

    const material = new THREE.MeshStandardMaterial({
      color: theme.primary,
      emissive: theme.secondary,
      emissiveIntensity: 0.22,
      roughness: 0.42,
      metalness: 0.18,
    });

    let body: THREE.Mesh;
    if (entity.role === "combat") {
      body = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), material);
      body.scale.set(1, 0.58, 1);
    } else if (entity.role === "resource") {
      body = new THREE.Mesh(new THREE.SphereGeometry(0.36, 24, 16), material);
      body.scale.set(1, 0.72, 1);
    } else {
      body = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.38, 6), material);
      body.rotation.y = Math.PI / 6;
    }
    root.add(body);

    const role = makeCanvasTextSprite(entity.role[0].toUpperCase(), {
      color: roleTheme.accent,
      fontSize: 38,
      scale: 0.34,
    });
    role.position.set(0, 0.46, 0);
    root.add(role);

    const hp = makeCanvasTextSprite(`${entity.hp}/${entity.maxHp}`, {
      color: "#eff6ff",
      background: "rgba(6, 11, 26, 0.82)",
      fontSize: 26,
      scale: 0.36,
    });
    hp.position.set(0, 0.92, 0);
    root.add(hp);

    if (state.selectedEntityId === entity.id) {
      const ring = new THREE.Line(
        createHexLineGeometry(0.58),
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 })
      );
      ring.position.y = -0.24;
      root.add(ring);
    }

    if (entity.hasSummoningSickness) {
      const ring = new THREE.Line(
        createHexLineGeometry(0.46),
        new THREE.LineBasicMaterial({ color: 0xffc276, transparent: true, opacity: 0.78 })
      );
      ring.position.y = -0.18;
      root.add(ring);
    }

    if (entity.carries) {
      const resourceTheme = getResourceTheme(entity.carries);
      const badge = makeCanvasTextSprite(resourceTheme.shortLabel.toUpperCase().slice(0, 2), {
        color: resourceTheme.color,
        background: "rgba(8, 12, 28, 0.9)",
        fontSize: 24,
        scale: 0.28,
      });
      badge.position.set(0.46, 0.62, 0);
      root.add(badge);
    }

    this.entityGroup.add(root);
  }

  private rebuildOverlays(state: GameState, frame: RuntimeFrame): void {
    clearGroup(this.overlayGroup);

    for (const cell of frame.derived.moveRangeOverlay) {
      const overlay = new THREE.Mesh(
        createHexGeometry(HEX_RADIUS * 0.83),
        new THREE.MeshBasicMaterial({
          color: cell.occupied ? 0xff6e6e : 0x6bf5bc,
          transparent: true,
          opacity: cell.occupied ? 0.16 : 0.14,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      overlay.position.copy(hexToWorld(cell.coord, 0.075));
      this.overlayGroup.add(overlay);
    }

    const hoveredHex = frame.transients.hoveredHex;
    if (hoveredHex && isWithinMapBounds(hoveredHex, state.map)) {
      const hover = new THREE.Line(
        createHexLineGeometry(HEX_RADIUS * 0.9),
        new THREE.LineBasicMaterial({ color: 0xf6e56c, transparent: true, opacity: 0.95 })
      );
      hover.position.copy(hexToWorld(hoveredHex, 0.16));
      this.overlayGroup.add(hover);
    }

    this.addAuraOverlays(state, frame);
    this.addAttackTargetOverlays(state, frame);

    if (state.stack.length > 0) {
      const stack = makeCanvasTextSprite(`STACK ${state.stack.length}`, {
        color: "#dbe9ff",
        background: "rgba(12, 20, 49, 0.82)",
        fontSize: 26,
        scale: 0.52,
      });
      stack.position.set(this.mapCenter.x, 3.1, this.mapCenter.z - this.mapHalfDepth * 1.25);
      this.overlayGroup.add(stack);
    }
  }

  private addAuraOverlays(state: GameState, frame: RuntimeFrame): void {
    const sourceIds = new Set<string>();
    if (state.selectedEntityId) {
      sourceIds.add(state.selectedEntityId);
    }

    const hoveredHex = frame.transients.hoveredHex;
    const hoveredEntity = hoveredHex ? findEntityAtHex(state, hoveredHex) : null;
    if (hoveredEntity?.kind === "unit") {
      sourceIds.add(hoveredEntity.id);
    }

    for (const effect of state.continuousEffects) {
      if (
        effect.target.type !== "adjacent_allies" ||
        effect.payload.type !== "stat_modifier" ||
        !sourceIds.has(effect.target.sourceEntityId)
      ) {
        continue;
      }

      const source = state.entities[effect.target.sourceEntityId];
      if (!source || source.kind !== "unit") {
        continue;
      }

      const theme = getPlayerTheme(source.ownerId);
      for (const coord of getPlayableHexes(state.map)) {
        if (hexDistance(source.coord, coord) !== 1) {
          continue;
        }
        const occupant = findEntityAtHex(state, coord);
        const affected =
          occupant?.kind === "unit" &&
          occupant.ownerId === source.ownerId &&
          (!effect.target.roleFilter || occupant.role === effect.target.roleFilter);
        const mesh = new THREE.Mesh(
          createHexGeometry(HEX_RADIUS * 0.78),
          new THREE.MeshBasicMaterial({
            color: theme.primary,
            transparent: true,
            opacity: affected ? 0.18 : 0.08,
            depthWrite: false,
            side: THREE.DoubleSide,
          })
        );
        mesh.position.copy(hexToWorld(coord, 0.105));
        this.overlayGroup.add(mesh);

        const line = new THREE.Line(
          createHexLineGeometry(HEX_RADIUS * 0.78),
          new THREE.LineBasicMaterial({ color: theme.line, transparent: true, opacity: affected ? 0.78 : 0.42 })
        );
        line.position.copy(hexToWorld(coord, 0.13));
        this.overlayGroup.add(line);
      }
    }
  }

  private addAttackTargetOverlays(state: GameState, frame: RuntimeFrame): void {
    const pending = frame.transients.pendingAttackTargeting;
    if (!pending) {
      return;
    }
    const attacker = state.entities[pending.attackerId];
    if (!attacker || attacker.kind !== "unit") {
      return;
    }

    for (const target of getAttackableEntitiesForUnit(state, attacker)) {
      const isHovered = frame.transients.hoveredHex?.q === target.coord.q && frame.transients.hoveredHex?.r === target.coord.r;
      const targetRing = new THREE.Line(
        createHexLineGeometry(HEX_RADIUS * (isHovered ? 0.98 : 0.86)),
        new THREE.LineBasicMaterial({
          color: isHovered ? 0xffc46e : 0xff7e7e,
          transparent: true,
          opacity: isHovered ? 0.96 : 0.68,
        })
      );
      targetRing.position.copy(hexToWorld(target.coord, 0.18));
      this.overlayGroup.add(targetRing);

      if (isHovered) {
        this.addLine(hexToWorld(attacker.coord, 0.72), hexToWorld(target.coord, 0.72), 0x72ee9a, 0.86, 0, this.overlayGroup);
      }
    }
  }

  private rebuildAnimations(frame: RuntimeFrame): void {
    clearGroup(this.animationGroup);

    for (const animation of frame.transients.animations) {
      const progress = Math.max(0, Math.min(1, animation.ageSeconds / animation.durationSeconds));
      switch (animation.kind) {
        case "move":
          this.addMoveAnimation(animation, progress);
          break;
        case "attack":
          this.addAttackAnimation(animation, progress);
          break;
        case "harvest":
          this.addHarvestAnimation(animation, progress);
          break;
        case "deploy":
          this.addDeployAnimation(animation, progress);
          break;
        case "base_hit":
          this.addBaseHitAnimation(animation, progress);
          break;
        case "stack_cast":
          this.addStackCastAnimation(animation, progress);
          break;
        case "stack_counter":
          this.addStackCounterAnimation(animation, progress);
          break;
        case "spell_resolve":
          this.addSpellResolveAnimation(animation, progress);
          break;
        case "hex_shower":
          this.addHexPulseAnimation(animation.hexes, animation.origin, animation.label, animation.accent, progress);
          break;
        case "board_blast":
          this.addHexPulseAnimation(animation.hexes, animation.center, animation.label, animation.accent, progress);
          break;
        case "death_burst":
          this.addDeathBurstAnimation(animation, progress);
          break;
        case "match_intro":
          this.addTitleAnimation(animation.center, animation.label, animation.subtitle, animation.playerId, progress);
          break;
        case "victory_fanfare":
          this.addTitleAnimation(animation.textCenter, animation.label, "", animation.playerId, progress);
          this.addHexPulseAnimation(animation.hexes, animation.center, "", animation.playerId, progress);
          break;
      }
    }
  }

  private addLine(
    from: THREE.Vector3,
    to: THREE.Vector3,
    color: string | number,
    opacity: number,
    yLift = 0,
    group: THREE.Group = this.animationGroup
  ): void {
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(from.x, from.y + yLift, from.z),
      new THREE.Vector3(to.x, to.y + yLift, to.z),
    ]);
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: Math.max(0, opacity),
    });
    group.add(new THREE.Line(geometry, material));
  }

  private addRing(coord: HexCoord, radius: number, color: string | number, opacity: number, y = 0.24): void {
    const ring = new THREE.Line(
      createHexLineGeometry(radius),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: Math.max(0, opacity) })
    );
    ring.position.copy(hexToWorld(coord, y));
    this.animationGroup.add(ring);
  }

  private addFloatingText(text: string, coord: HexCoord, color: string, progress: number, y = 1.2): void {
    const sprite = makeCanvasTextSprite(text, {
      color,
      fontSize: 34,
      scale: 0.42,
    });
    sprite.material.opacity = Math.max(0, 1 - progress * 0.72);
    sprite.position.copy(hexToWorld(coord, y + progress * 0.55));
    this.animationGroup.add(sprite);
  }

  private getStackWorldAnchor(): THREE.Vector3 {
    return new THREE.Vector3(this.mapCenter.x, 3.0, this.mapCenter.z - this.mapHalfDepth * 1.25);
  }

  private addMoveAnimation(animation: Extract<CanvasAnimation, { kind: "move" }>, progress: number): void {
    const from = hexToWorld(animation.from, 0.58);
    const to = hexToWorld(animation.to, 0.58);
    const current = from.clone().lerp(to, progress);
    const theme = getPlayerTheme(animation.playerId);
    this.addLine(from, current, theme.primary, 0.7 - progress * 0.45);

    const spark = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 16, 10),
      new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.5 - progress * 0.24 })
    );
    spark.position.copy(current);
    this.animationGroup.add(spark);
  }

  private addAttackAnimation(animation: Extract<CanvasAnimation, { kind: "attack" }>, progress: number): void {
    const from = hexToWorld(animation.from, 0.82);
    const to = hexToWorld(animation.to, 0.82);
    const theme = getPlayerTheme(animation.playerId);
    this.addLine(from, to, theme.primary, 0.95 - progress * 0.55, 0.08);
    this.addRing(animation.to, 0.35 + progress * 0.52, animation.targetDestroyed ? 0xff7676 : 0xffe8b2, 0.9 - progress * 0.56, 0.3);
    this.addFloatingText(`-${animation.damage}`, animation.to, "#ffefd6", progress, 1.3);
  }

  private addHarvestAnimation(animation: Extract<CanvasAnimation, { kind: "harvest" }>, progress: number): void {
    const theme = getResourceTheme(animation.resourceType);
    this.addRing(animation.coord, 0.34 + progress * 0.5, theme.color, 0.88 - progress * 0.6, 0.25);
    this.addFloatingText(theme.shortLabel.toUpperCase().slice(0, 2), animation.coord, theme.color, progress, 1.0);
  }

  private addDeployAnimation(animation: Extract<CanvasAnimation, { kind: "deploy" }>, progress: number): void {
    const theme = getPlayerTheme(animation.playerId);
    const top = hexToWorld(animation.coord, 2.2 - progress * 1.2);
    const bottom = hexToWorld(animation.coord, 0.52);
    this.addLine(top, bottom, theme.primary, 0.7 - progress * 0.36);
    this.addRing(animation.coord, 0.5 + progress * 0.62, theme.line, 0.86 - progress * 0.52, 0.22);
  }

  private addBaseHitAnimation(animation: Extract<CanvasAnimation, { kind: "base_hit" }>, progress: number): void {
    this.addRing(animation.coord, 0.62 + progress * 0.94, 0xff7070, 0.86 - progress * 0.54, 0.3);
    this.addFloatingText(`-${animation.damage}`, animation.coord, "#ffd3b8", progress, 1.55);
  }

  private addStackCastAnimation(animation: Extract<CanvasAnimation, { kind: "stack_cast" }>, progress: number): void {
    const from = hexToWorld(animation.from, 0.9);
    const anchor = this.getStackWorldAnchor();
    const theme = getPlayerTheme(animation.playerId);
    this.addLine(from, anchor, theme.primary, 0.82 - progress * 0.48);
    const label = makeCanvasTextSprite(animation.label, { color: "#e4efff", fontSize: 28, scale: 0.44 });
    label.material.opacity = Math.max(0, 0.95 - progress * 0.54);
    label.position.copy(anchor.clone().add(new THREE.Vector3(0, 0.48, 0)));
    this.animationGroup.add(label);
  }

  private addStackCounterAnimation(animation: Extract<CanvasAnimation, { kind: "stack_counter" }>, progress: number): void {
    const from = hexToWorld(animation.from, 0.9);
    const anchor = this.getStackWorldAnchor();
    const theme = getPlayerTheme(animation.playerId);
    this.addLine(from, anchor, theme.primary, 0.86 - progress * 0.5);
    const color = animation.returnToHand ? 0x72f4c6 : 0xff7e7e;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.3 + progress * 0.36, 0.018, 8, 36),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 - progress * 0.56, depthWrite: false })
    );
    ring.position.copy(anchor);
    ring.rotation.x = Math.PI / 2;
    this.animationGroup.add(ring);
    const label = makeCanvasTextSprite(`${animation.returnToHand ? "Recall" : "Counter"} ${animation.targetLabel}`, {
      color: animation.returnToHand ? "#b4ffde" : "#ffdbdb",
      fontSize: 24,
      scale: 0.42,
    });
    label.material.opacity = Math.max(0, 0.95 - progress * 0.58);
    label.position.copy(anchor.clone().add(new THREE.Vector3(0, 0.56, 0)));
    this.animationGroup.add(label);
  }

  private addSpellResolveAnimation(animation: Extract<CanvasAnimation, { kind: "spell_resolve" }>, progress: number): void {
    const anchor = this.getStackWorldAnchor();
    const target = hexToWorld(animation.coord, 0.86);
    const theme = getPlayerTheme(animation.playerId);
    this.addLine(anchor, target, theme.primary, 0.86 - progress * 0.46);

    if (animation.visual === "buff") {
      this.addRing(animation.coord, 0.4 + progress * 0.48, 0x6ff5c3, 0.88 - progress * 0.52, 0.32);
      this.addFloatingText(animation.label, animation.coord, "#beffe5", progress, 1.34);
    } else if (animation.visual === "destroy") {
      this.addRing(animation.coord, 0.36 + progress * 0.44, 0xff7878, 0.92 - progress * 0.52, 0.32);
      this.addFloatingText("Destroy", animation.coord, "#ffd7d7", progress, 1.34);
    } else {
      this.addRing(animation.coord, 0.32 + progress * 0.5, animation.visual === "base_damage" ? 0xff8974 : 0xffe8b2, 0.9 - progress * 0.56, 0.32);
      this.addFloatingText(`-${animation.amount ?? 0}`, animation.coord, animation.visual === "base_damage" ? "#ffd6c2" : "#fff4d6", progress, 1.34);
    }
  }

  private addHexPulseAnimation(hexes: HexCoord[], center: HexCoord, label: string, accent: string, progress: number): void {
    const color = resolveAccentColor(accent);
    this.addRing(center, 0.5 + progress * 0.82, color, 0.88 - progress * 0.5, 0.28);
    for (let index = 0; index < hexes.length; index += 1) {
      const stagger = (index % 8) * 0.035;
      const localProgress = Math.max(0, Math.min(1, (progress - stagger) / Math.max(0.001, 1 - stagger)));
      if (localProgress <= 0) {
        continue;
      }
      this.addRing(hexes[index], 0.5 + localProgress * 0.12, color, 0.72 - localProgress * 0.42, 0.23);
      const from = hexToWorld(hexes[index], 1.5 - localProgress * 0.3);
      const to = hexToWorld(hexes[index], 0.35);
      this.addLine(from, to, color, 0.72 - localProgress * 0.44);
    }
    if (label) {
      this.addFloatingText(label, center, color, progress, 1.55);
    }
  }

  private addDeathBurstAnimation(animation: Extract<CanvasAnimation, { kind: "death_burst" }>, progress: number): void {
    this.addRing(animation.coord, 0.48 + progress * 0.16, 0xffaaaa, 0.82 - progress * 0.46, 0.3);
    this.addRing(animation.coord, 0.18 + progress * 0.26, 0xffd2d2, 0.72 - progress * 0.42, 0.42);
  }

  private addTitleAnimation(center: HexCoord, label: string, subtitle: string, playerId: string, progress: number): void {
    const theme = playerId.startsWith("player_") ? getPlayerTheme(playerId as PlayerId) : getPlayerTheme("player_1");
    this.addRing(center, 1 + progress * 1.2, theme.primary, 0.56 - progress * 0.28, 0.35);
    const title = makeCanvasTextSprite(label, {
      color: "#eff6ff",
      fontSize: 52,
      scale: 1.0,
    });
    title.material.opacity = Math.max(0, 1 - progress * 0.78);
    title.position.copy(hexToWorld(center, 2.4 - progress * 0.42));
    this.animationGroup.add(title);
    if (subtitle) {
      const subtitleSprite = makeCanvasTextSprite(subtitle.toUpperCase(), {
        color: "#b6cdff",
        fontSize: 28,
        scale: 0.48,
      });
      subtitleSprite.material.opacity = Math.max(0, 0.8 - progress * 0.52);
      subtitleSprite.position.copy(hexToWorld(center, 1.78 - progress * 0.18));
      this.animationGroup.add(subtitleSprite);
    }
  }

  private fitCamera(): void {
    const aspect = this.viewportWidth / Math.max(1, this.viewportHeight);
    const verticalSize = Math.max(3.6, this.mapHalfDepth * 1.18 + 1.3, (this.mapHalfWidth * 1.1 + 1.4) / aspect);
    const horizontalSize = verticalSize * aspect;
    this.camera.left = -horizontalSize;
    this.camera.right = horizontalSize;
    this.camera.top = verticalSize;
    this.camera.bottom = -verticalSize;
    this.camera.position.set(this.mapCenter.x, 8.5, this.mapCenter.z + 8.5);
    this.camera.lookAt(this.mapCenter.x, 0, this.mapCenter.z);
    this.camera.updateProjectionMatrix();
  }
}

export function createThreeGameRenderer(canvas: HTMLCanvasElement): ThreeGameRenderer {
  return new ThreeGameRenderer(canvas);
}
