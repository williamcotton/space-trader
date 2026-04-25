import * as THREE from "three";
import { getPlayableHexes, hexDistance, isWithinMapBounds, pixelToAxial } from "../model/hex";
import type { PlayerId } from "../model/ids";
import type { EntityState, GameState, HexCoord } from "../model/state";
import { findEntityAtHex } from "../model/queries";
import { getPlayerTheme, getResourceTheme } from "../presentation";
import { getAttackableEntitiesForUnit } from "../rules/directInteraction";
import { tryGetFactionPresentation, tryGetRegisteredResourceTheme } from "../registries/presentation";
import type { CanvasAnimation, GameRenderer, RuntimeFrame } from "../types";
import { THREE_HEX_RADIUS, getThreeCameraLayout, hexToWorldPoint, type ThreeCameraLayout } from "./layout3d";

const HEX_RADIUS = THREE_HEX_RADIUS;
const CAMERA_INTRO_DURATION_SECONDS = 1.65;
const VICTORY_CAMERA_DURATION_SECONDS = 2.35;

type DisposableObject = THREE.Object3D & {
  geometry?: THREE.BufferGeometry;
  material?: THREE.Material | THREE.Material[];
};

type CameraSnapshot = {
  position: THREE.Vector3;
  target: THREE.Vector3;
  left: number;
  right: number;
  top: number;
  bottom: number;
};

function hexToWorld(coord: HexCoord, y = 0): THREE.Vector3 {
  const point = hexToWorldPoint(coord, y);
  return new THREE.Vector3(point.x, point.y, point.z);
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

function makeThickLineMaterial(color: string | number, opacity: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
  });
}

function makeThickSegment(start: THREE.Vector3, end: THREE.Vector3, radius: number, material: THREE.Material): THREE.Mesh {
  const direction = new THREE.Vector3().subVectors(end, start);
  const length = direction.length();
  const segment = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 8), material);
  segment.position.copy(start).add(end).multiplyScalar(0.5);
  segment.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return segment;
}

function makeThickPolyline(points: THREE.Vector3[], radius: number, material: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  for (let index = 0; index < points.length - 1; index += 1) {
    group.add(makeThickSegment(points[index], points[index + 1], radius, material));
  }
  return group;
}

function makeCirclePoints(radius: number, y: number, segments = 32): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  for (let index = 0; index <= segments; index += 1) {
    const angle = (Math.PI * 2 * index) / segments;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius));
  }
  return points;
}

function makeHexPoints(radius: number, y: number): THREE.Vector3[] {
  const points: THREE.Vector3[] = [];
  for (let side = 0; side <= 6; side += 1) {
    const angle = -Math.PI / 6 + (Math.PI * 2 * (side % 6)) / 6;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius));
  }
  return points;
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

function makeBoardBackgroundTexture(): THREE.CanvasTexture {
  const width = 1024;
  const height = 640;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    return new THREE.CanvasTexture(canvas);
  }

  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#071121");
  gradient.addColorStop(0.5, "#05091a");
  gradient.addColorStop(1, "#040612");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  const blueGlow = context.createRadialGradient(width * 0.32, height * 0.22, 0, width * 0.32, height * 0.22, width * 0.58);
  blueGlow.addColorStop(0, "rgba(70, 123, 223, 0.18)");
  blueGlow.addColorStop(1, "rgba(70, 123, 223, 0)");
  context.fillStyle = blueGlow;
  context.fillRect(0, 0, width, height);

  const tealGlow = context.createRadialGradient(width * 0.76, height * 0.2, 0, width * 0.76, height * 0.2, width * 0.48);
  tealGlow.addColorStop(0, "rgba(90, 214, 180, 0.14)");
  tealGlow.addColorStop(1, "rgba(90, 214, 180, 0)");
  context.fillStyle = tealGlow;
  context.fillRect(0, 0, width, height);

  context.fillStyle = "rgba(214, 232, 255, 0.52)";
  for (let index = 0; index < 72; index += 1) {
    const x = (index * 187) % width;
    const y = ((index * 113) % height) * 0.92 + (index % 3) * 7;
    const radius = 0.55 + (index % 4) * 0.32;
    context.globalAlpha = 0.18 + ((index * 17) % 100) / 480;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
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

function easeOutCubic(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return 1 - Math.pow(1 - clamped, 3);
}

function lerp(start: number, end: number, progress: number): number {
  return start + (end - start) * progress;
}

function makeResourceUnitBody(color: string, accentColor: string): THREE.Group {
  const group = new THREE.Group();
  const ringMaterial = makeThickLineMaterial(color, 0.95);
  const accentMaterial = makeThickLineMaterial(accentColor, 0.54);

  const ringHeights = [-0.22, -0.06, 0.1, 0.26, 0.42];
  for (const y of ringHeights) {
    group.add(makeThickPolyline(makeCirclePoints(0.42, y), 0.024, ringMaterial));
  }

  for (let index = 0; index < 4; index += 1) {
    const angle = Math.PI / 4 + index * (Math.PI / 2);
    const x = Math.cos(angle) * 0.42;
    const z = Math.sin(angle) * 0.42;
    group.add(
      makeThickSegment(
        new THREE.Vector3(x, ringHeights[0], z),
        new THREE.Vector3(x, ringHeights[ringHeights.length - 1], z),
        0.018,
        accentMaterial
      )
    );
  }

  return group;
}

function makeCombatUnitBody(color: string, accentColor: string): THREE.Group {
  const group = new THREE.Group();
  const ringMaterial = makeThickLineMaterial(color, 0.96);
  const accentMaterial = makeThickLineMaterial(accentColor, 0.56);

  const rings = [
    { y: -0.22, radius: 0.48 },
    { y: -0.04, radius: 0.4 },
    { y: 0.14, radius: 0.31 },
    { y: 0.32, radius: 0.22 },
    { y: 0.5, radius: 0.1 },
  ];
  for (const ringSpec of rings) {
    group.add(makeThickPolyline(makeCirclePoints(ringSpec.radius, ringSpec.y), 0.024, ringMaterial));
  }

  const base = rings[0];
  const top = rings[rings.length - 1];
  for (let index = 0; index < 4; index += 1) {
    const angle = Math.PI / 4 + index * (Math.PI / 2);
    group.add(
      makeThickSegment(
        new THREE.Vector3(Math.cos(angle) * base.radius, base.y, Math.sin(angle) * base.radius),
        new THREE.Vector3(Math.cos(angle) * top.radius, top.y, Math.sin(angle) * top.radius),
        0.018,
        accentMaterial
      )
    );
  }

  return group;
}

function makeUtilityUnitBody(color: string, accentColor: string): THREE.Group {
  const group = new THREE.Group();
  const ringMaterial = makeThickLineMaterial(color, 0.95);
  const accentMaterial = makeThickLineMaterial(accentColor, 0.54);

  const hexHeights = [-0.2, -0.02, 0.16, 0.34, 0.52];
  for (const y of hexHeights) {
    group.add(makeThickPolyline(makeHexPoints(0.46, y), 0.024, ringMaterial));
  }

  for (let side = 0; side < 6; side += 1) {
    const angle = -Math.PI / 6 + (Math.PI * 2 * side) / 6;
    const x = Math.cos(angle) * 0.46;
    const z = Math.sin(angle) * 0.46;
    group.add(
      makeThickSegment(
        new THREE.Vector3(x, hexHeights[0], z),
        new THREE.Vector3(x, hexHeights[hexHeights.length - 1], z),
        0.018,
        accentMaterial
      )
    );
  }

  return group;
}

function makeBaseBody(color: string, accentColor: string): THREE.Group {
  const group = new THREE.Group();
  const primaryMaterial = makeThickLineMaterial(color, 0.94);
  const accentMaterial = makeThickLineMaterial(accentColor, 0.58);

  const bottomY = -0.35;
  const topY = 0.35;
  group.add(makeThickPolyline(makeHexPoints(1.02, bottomY), 0.034, primaryMaterial));
  group.add(makeThickPolyline(makeHexPoints(0.86, topY), 0.034, primaryMaterial));

  for (let side = 0; side < 6; side += 1) {
    const angle = -Math.PI / 6 + (Math.PI * 2 * side) / 6;
    group.add(
      makeThickSegment(
        new THREE.Vector3(Math.cos(angle) * 1.02, bottomY, Math.sin(angle) * 1.02),
        new THREE.Vector3(Math.cos(angle) * 0.86, topY, Math.sin(angle) * 0.86),
        0.024,
        primaryMaterial
      )
    );
  }

  group.add(makeThickPolyline(makeHexPoints(0.45, bottomY + 0.05), 0.022, accentMaterial));
  group.add(makeThickPolyline(makeHexPoints(0.4, topY + 0.05), 0.022, accentMaterial));

  for (let side = 0; side < 6; side += 1) {
    const angle = -Math.PI / 6 + (Math.PI * 2 * side) / 6;
    group.add(
      makeThickSegment(
        new THREE.Vector3(Math.cos(angle) * 0.45, bottomY + 0.05, Math.sin(angle) * 0.45),
        new THREE.Vector3(Math.cos(angle) * 0.4, topY + 0.05, Math.sin(angle) * 0.4),
        0.016,
        accentMaterial
      )
    );
  }

  return group;
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
  private readonly backgroundTexture = makeBoardBackgroundTexture();
  private viewportWidth = 1;
  private viewportHeight = 1;
  private boardKey = "";
  private cameraIntroKey = "";
  private victoryCameraKey = "";
  private victoryCameraElapsed = VICTORY_CAMERA_DURATION_SECONDS;
  private victoryCameraStart: CameraSnapshot | null = null;
  private cameraLookAtTarget = new THREE.Vector3();
  private mapCenter = new THREE.Vector3();
  private mapHalfDepth = 3;
  private currentState: GameState | null = null;
  private cameraLayout: ThreeCameraLayout | null = null;
  private cameraIntroElapsed = CAMERA_INTRO_DURATION_SECONDS;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x071121, 1);

    this.scene.background = this.backgroundTexture;
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
    this.currentState = state;
    const nextBoardKey = this.buildBoardKey(state);
    const nextCameraIntroKey = this.buildCameraIntroKey(state);
    const nextVictoryCameraKey = state.winner ? `${state.matchId}:${state.winner}` : "";
    if (nextCameraIntroKey !== this.cameraIntroKey) {
      this.cameraIntroKey = nextCameraIntroKey;
      this.cameraIntroElapsed = 0;
    }
    if (nextVictoryCameraKey !== this.victoryCameraKey) {
      this.victoryCameraKey = nextVictoryCameraKey;
      this.victoryCameraElapsed = nextVictoryCameraKey ? 0 : VICTORY_CAMERA_DURATION_SECONDS;
      this.victoryCameraStart = nextVictoryCameraKey ? this.captureCameraSnapshot() : null;
    }
    if (nextBoardKey !== this.boardKey) {
      this.boardKey = nextBoardKey;
      this.rebuildBoard(state);
      this.fitCamera();
    }

    this.rebuildOverlays(state, frame);
    this.rebuildEntities(state);
    this.rebuildAnimations(frame);
    this.updateCameraEffects(state, frame.deltaSeconds);
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
    this.backgroundTexture.dispose();
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

  private buildCameraIntroKey(state: GameState): string {
    return [
      state.map.id,
      state.map.width,
      state.map.height,
      state.map.playableHexes?.length ?? 0,
      ...state.playerOrder,
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

    const hexGeometry = createHexGeometry(HEX_RADIUS * 0.96);
    const lineGeometry = createHexLineGeometry(HEX_RADIUS * 0.98);
    const tileMaterial = new THREE.MeshBasicMaterial({
      color: 0x09122e,
      side: THREE.DoubleSide,
    });
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x5d7fbd,
      transparent: true,
      opacity: 0.92,
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
      const root = new THREE.Group();
      root.position.copy(hexToWorld(node.coord, 0.08));

      const pad = new THREE.Mesh(
        new THREE.CylinderGeometry(0.54, 0.6, 0.08, 6),
        new THREE.MeshStandardMaterial({
          color: 0x071026,
          emissive: theme.color,
          emissiveIntensity: 0.14,
          roughness: 0.62,
          metalness: 0.12,
        })
      );
      root.add(pad);

      const accentRing = new THREE.Line(
        createHexLineGeometry(0.57),
        new THREE.LineBasicMaterial({
          color: theme.color,
          transparent: true,
          opacity: 0.95,
        })
      );
      accentRing.position.y = 0.13;
      root.add(accentRing);

      this.boardGroup.add(root);

      if (node.controlledBy) {
        const controlRing = new THREE.Line(
          createHexLineGeometry(0.68),
          new THREE.LineBasicMaterial({ color: getPlayerTheme(node.controlledBy).line })
        );
        controlRing.position.copy(hexToWorld(node.coord, 0.25));
        this.boardGroup.add(controlRing);
      }
    }

    this.mapCenter = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    this.mapHalfDepth = Math.max(1, size.z / 2);
  }

  private rebuildEntities(state: GameState): void {
    clearGroup(this.entityGroup);

    const entities = Object.values(state.entities).sort((a, b) => entitySortValue(a) - entitySortValue(b));
    for (const entity of entities) {
      if (entity.kind === "base") {
        this.addBase(entity);
      } else {
        this.addUnit(entity);
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

    root.add(makeBaseBody(theme.primary, theme.secondary));

    const hp = makeCanvasTextSprite(String(entity.hp), {
      color: "#ffffff",
      background: "rgba(5, 9, 22, 0.55)",
      fontSize: 52,
      scale: 0.64,
    });
    hp.position.set(0, 1.0, 0);
    root.add(hp);

    this.entityGroup.add(root);
  }

  private addUnit(entity: EntityState): void {
    if (entity.kind !== "unit") {
      return;
    }

    const theme = getPlayerTheme(entity.ownerId);
    const root = new THREE.Group();
    root.position.copy(hexToWorld(entity.coord, 0.34));

    let body: THREE.Object3D;
    if (entity.role === "combat") {
      body = makeCombatUnitBody(theme.primary, theme.secondary);
    } else if (entity.role === "resource") {
      body = makeResourceUnitBody(theme.primary, theme.secondary);
    } else {
      body = makeUtilityUnitBody(theme.primary, theme.secondary);
    }
    root.add(body);

    const hp = makeCanvasTextSprite(`${entity.hp}/${entity.maxHp}`, {
      color: "#eff6ff",
      background: "rgba(6, 11, 26, 0.9)",
      fontSize: 32,
      scale: 0.44,
    });
    hp.position.set(0, 1.08, 0);
    root.add(hp);

    if (entity.hasSummoningSickness) {
      const ring = new THREE.Line(
        createHexLineGeometry(0.46),
        new THREE.LineBasicMaterial({ color: 0xffc276, transparent: true, opacity: 0.9 })
      );
      ring.position.y = -0.18;
      root.add(ring);
    }

    if (entity.carries) {
      const resourceTheme = getResourceTheme(entity.carries);
      const badge = makeCanvasTextSprite(resourceTheme.shortLabel.toUpperCase().slice(0, 2), {
        color: resourceTheme.color,
        background: "rgba(8, 12, 28, 0.9)",
        fontSize: 30,
        scale: 0.34,
      });
      badge.position.set(0.56, 0.74, 0);
      root.add(badge);
    }

    this.entityGroup.add(root);
  }

  private rebuildOverlays(state: GameState, frame: RuntimeFrame): void {
    clearGroup(this.overlayGroup);

    for (const cell of frame.derived.moveRangeOverlay) {
      const fillColor = cell.occupied ? 0xff6e6e : 0x6bf5bc;
      const lineColor = cell.occupied ? 0xff9191 : 0x6bf5bc;
      const overlay = new THREE.Mesh(
        createHexGeometry(HEX_RADIUS * 0.83),
        new THREE.MeshBasicMaterial({
          color: fillColor,
          transparent: true,
          opacity: cell.occupied ? 0.18 : 0.16,
          depthWrite: false,
          side: THREE.DoubleSide,
        })
      );
      overlay.position.copy(hexToWorld(cell.coord, 0.075));
      this.overlayGroup.add(overlay);

      const outline = new THREE.Line(
        createHexLineGeometry(HEX_RADIUS * 0.84),
        new THREE.LineBasicMaterial({
          color: lineColor,
          transparent: true,
          opacity: cell.occupied ? 0.92 : 0.96,
        })
      );
      outline.position.copy(hexToWorld(cell.coord, 0.13));
      this.overlayGroup.add(outline);
    }

    const hoveredHex = frame.transients.hoveredHex;
    const selected = state.selectedEntityId ? state.entities[state.selectedEntityId] : null;
    if (selected) {
      const theme = getPlayerTheme(selected.ownerId);
      const selectedOutline = new THREE.Line(
        createHexLineGeometry(HEX_RADIUS * 0.99),
        new THREE.LineBasicMaterial({ color: theme.line, transparent: true, opacity: 0.98 })
      );
      selectedOutline.position.copy(hexToWorld(selected.coord, 0.155));
      this.overlayGroup.add(selectedOutline);
    }

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
      stack.position.copy(this.getStackWorldAnchor());
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
    const layout = this.cameraLayout;
    if (!layout) {
      return new THREE.Vector3(this.mapCenter.x, 3.0, this.mapCenter.z - this.mapHalfDepth);
    }

    const visibleHalfDepth = (layout.top - layout.bottom) / 2;
    return new THREE.Vector3(this.mapCenter.x, 2.7, this.mapCenter.z - visibleHalfDepth * 0.62);
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
      this.addHexPulseBeams(hexes[index], color, 0.72 - localProgress * 0.44, localProgress, index);
    }
    if (label) {
      this.addFloatingText(label, center, color, progress, 1.55);
    }
  }

  private addHexPulseBeams(coord: HexCoord, color: string | number, opacity: number, progress: number, index: number): void {
    const material = makeThickLineMaterial(color, Math.max(0, opacity));
    const base = hexToWorld(coord, 0.34);
    const beamCount = 3;
    const rise = 1.0 + progress * 0.34;
    const drift = 0.3 + progress * 0.16;

    for (let beamIndex = 0; beamIndex < beamCount; beamIndex += 1) {
      const angle = index * 0.83 + beamIndex * (Math.PI * 2 / beamCount);
      const originOffset = new THREE.Vector3(Math.cos(angle) * 0.18, 0, Math.sin(angle) * 0.18);
      const leanAngle = angle + 0.65;
      const start = base.clone().add(originOffset);
      const end = start.clone().add(new THREE.Vector3(Math.cos(leanAngle) * drift, rise, Math.sin(leanAngle) * drift));
      this.animationGroup.add(makeThickSegment(start, end, 0.024, material));
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
    if (!this.currentState) {
      return;
    }
    const layout = getThreeCameraLayout(this.currentState.map, {
      width: this.viewportWidth,
      height: this.viewportHeight,
      scale: 1,
    });
    this.cameraLayout = layout;
    this.applyCameraLayout(layout, easeOutCubic(this.cameraIntroElapsed / CAMERA_INTRO_DURATION_SECONDS));
  }

  private updateCameraIntro(deltaSeconds: number): void {
    if (!this.cameraLayout || this.cameraIntroElapsed >= CAMERA_INTRO_DURATION_SECONDS) {
      return;
    }
    this.cameraIntroElapsed = Math.min(CAMERA_INTRO_DURATION_SECONDS, this.cameraIntroElapsed + deltaSeconds);
    this.applyCameraLayout(this.cameraLayout, easeOutCubic(this.cameraIntroElapsed / CAMERA_INTRO_DURATION_SECONDS));
  }

  private updateCameraEffects(state: GameState, deltaSeconds: number): void {
    if (!this.cameraLayout) {
      return;
    }
    if (state.winner) {
      this.victoryCameraElapsed = Math.min(VICTORY_CAMERA_DURATION_SECONDS, this.victoryCameraElapsed + deltaSeconds);
      this.applyVictoryCameraLayout(state, this.cameraLayout, easeOutCubic(this.victoryCameraElapsed / VICTORY_CAMERA_DURATION_SECONDS));
      return;
    }
    this.updateCameraIntro(deltaSeconds);
  }

  private getVictoryCameraFocus(state: GameState): THREE.Vector3 {
    const winner = state.winner;
    if (winner && state.players[winner]) {
      const base = state.entities[state.players[winner].baseEntityId];
      if (base) {
        return hexToWorld(base.coord, 0.28);
      }
    }
    return new THREE.Vector3(this.cameraLayout?.center.x ?? 0, 0, this.cameraLayout?.center.z ?? 0);
  }

  private captureCameraSnapshot(): CameraSnapshot {
    return {
      position: this.camera.position.clone(),
      target: this.cameraLookAtTarget.clone(),
      left: this.camera.left,
      right: this.camera.right,
      top: this.camera.top,
      bottom: this.camera.bottom,
    };
  }

  private setCameraLookAt(target: THREE.Vector3): void {
    this.cameraLookAtTarget.copy(target);
    this.camera.lookAt(target.x, target.y, target.z);
  }

  private applyVictoryCameraLayout(state: GameState, layout: ThreeCameraLayout, progress: number): void {
    const start = this.victoryCameraStart ?? this.captureCameraSnapshot();
    const focus = this.getVictoryCameraFocus(state);
    const basePosition = new THREE.Vector3(layout.position.x, layout.position.y, layout.position.z);
    const baseCenter = new THREE.Vector3(layout.center.x, layout.center.y, layout.center.z);
    const cameraVector = basePosition.clone().sub(baseCenter);
    const endPosition = focus.clone().add(cameraVector.multiplyScalar(0.72));
    const sweep = Math.sin(progress * Math.PI) * 3.8;
    const endScale = 0.56;
    const target = new THREE.Vector3(
      lerp(start.target.x, focus.x, progress),
      lerp(start.target.y, focus.y, progress),
      lerp(start.target.z, focus.z, progress)
    );

    this.camera.left = lerp(start.left, layout.left * endScale, progress);
    this.camera.right = lerp(start.right, layout.right * endScale, progress);
    this.camera.top = lerp(start.top, layout.top * endScale, progress);
    this.camera.bottom = lerp(start.bottom, layout.bottom * endScale, progress);
    this.camera.position.set(
      lerp(start.position.x, endPosition.x, progress) + sweep,
      lerp(start.position.y, endPosition.y + 1.2, progress),
      lerp(start.position.z, endPosition.z, progress)
    );
    this.setCameraLookAt(target);
    this.camera.updateProjectionMatrix();
  }

  private applyCameraLayout(layout: ThreeCameraLayout, progress: number): void {
    const introScale = 1.42 - 0.42 * progress;
    const introOffset = 1 - progress;
    const startX = layout.position.x - 7.5;
    const startY = layout.position.y + 4.8;
    const startZ = layout.position.z + 8.2;
    const targetX = layout.center.x + 2.6 * introOffset;
    const targetY = layout.center.y;
    const targetZ = layout.center.z - 3.4 * introOffset;

    this.camera.left = layout.left;
    this.camera.right = layout.right;
    this.camera.top = layout.top;
    this.camera.bottom = layout.bottom;
    this.camera.left *= introScale;
    this.camera.right *= introScale;
    this.camera.top *= introScale;
    this.camera.bottom *= introScale;
    this.camera.position.set(
      lerp(startX, layout.position.x, progress),
      lerp(startY, layout.position.y, progress),
      lerp(startZ, layout.position.z, progress)
    );
    this.setCameraLookAt(new THREE.Vector3(targetX, targetY, targetZ));
    this.camera.updateProjectionMatrix();
  }
}

export function createThreeGameRenderer(canvas: HTMLCanvasElement): ThreeGameRenderer {
  return new ThreeGameRenderer(canvas);
}
