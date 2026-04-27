import { useEffect, useRef } from "react";
import * as THREE from "three";

type HomeScreenProps = {
  callsignDraft: string;
  hasSavedCallsign: boolean;
  isEditingCallsign: boolean;
  lastFactionLabel: string | null;
  canPlayOnline: boolean;
  showOnlineExperimental: boolean;
  onCallsignChange: (value: string) => void;
  onStartEditingCallsign: () => void;
  onSaveCallsign: () => void;
  onCancelEditingCallsign: () => void;
  onPlayVsAi: () => void;
  onPlayOnline: () => void;
  onLearnToPlay: () => void;
};

const BLOCK_GLYPHS: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
};

const TITLE_LINES = ["SPACE", "TRADER"] as const;

function getGlyphLineWidth(text: string) {
  return [...text].reduce((width, character, index) => {
    const glyph = BLOCK_GLYPHS[character];
    return width + (glyph?.[0]?.length ?? 3) + (index === text.length - 1 ? 0 : 1);
  }, 0);
}

function createBlockLetterLogo() {
  const group = new THREE.Group();
  const cyan = new THREE.LineBasicMaterial({
    color: 0x63d5ff,
    transparent: true,
    opacity: 0.88,
  });
  const green = new THREE.LineBasicMaterial({
    color: 0x83f3ca,
    transparent: true,
    opacity: 0.82,
  });
  const ghost = new THREE.LineBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.22,
  });
  const cellGeometry = new THREE.BoxGeometry(1.02, 1.02, 0.72);
  const edgeGeometry = new THREE.EdgesGeometry(cellGeometry);
  const braceGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-0.42, -0.42, 0.31),
    new THREE.Vector3(0.42, 0.42, -0.31),
    new THREE.Vector3(-0.42, 0.42, 0.31),
    new THREE.Vector3(0.42, -0.42, -0.31),
  ]);
  const cellStep = 1.1;
  const letterGap = 1.24;
  const lineGap = 9;

  TITLE_LINES.forEach((line, lineIndex) => {
    const lineWidth = getGlyphLineWidth(line);
    let cursor = -lineWidth * cellStep * 0.5;
    const material = lineIndex === 0 ? cyan : green;
    const yOffset = (TITLE_LINES.length - 1) * lineGap * 0.5 - lineIndex * lineGap;

    for (const character of line) {
      const glyph = BLOCK_GLYPHS[character];
      if (!glyph) {
        cursor += 4 * cellStep;
        continue;
      }

      glyph.forEach((row, rowIndex) => {
        [...row].forEach((filled, columnIndex) => {
          if (filled !== "1") {
            return;
          }

          const x = cursor + columnIndex * cellStep;
          const y = yOffset + (glyph.length * cellStep) * 0.5 - rowIndex * cellStep;
          const z = Math.sin((columnIndex + rowIndex + lineIndex) * 0.7) * 0.08;

          const cubeEdges = new THREE.LineSegments(edgeGeometry, material);
          cubeEdges.position.set(x, y, z);
          group.add(cubeEdges);

          if ((columnIndex + rowIndex) % 2 === 0) {
            const braces = new THREE.LineSegments(braceGeometry, ghost);
            braces.position.copy(cubeEdges.position);
            group.add(braces);
          }
        });
      });

      cursor += glyph[0].length * cellStep + letterGap;
    }
  });

  group.userData.disposables = [cyan, green, ghost, cellGeometry, edgeGeometry, braceGeometry];
  return group;
}

function WireframeTitleCanvas() {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return undefined;
    }

    let animationFrame = 0;
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-18, 18, 9, -9, 0.1, 100);
    camera.position.set(0, 0, 28);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    const logo = createBlockLetterLogo();
    logo.rotation.x = -0.24;
    logo.rotation.y = -0.34;
    logo.scale.setScalar(0.9);
    scene.add(logo);

    const resize = () => {
      const rect = host.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 3);
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      const aspect = width / height;
      const viewHeight = 20;
      camera.left = -viewHeight * aspect * 0.5;
      camera.right = viewHeight * aspect * 0.5;
      camera.top = viewHeight * 0.5;
      camera.bottom = -viewHeight * 0.5;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    const render = (time: number) => {
      logo.rotation.y = -0.34 + Math.sin(time * 0.00032) * 0.035;
      logo.rotation.x = -0.24 + Math.cos(time * 0.00028) * 0.018;
      renderer.render(scene, camera);

      animationFrame = window.requestAnimationFrame(render);
    };

    animationFrame = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      scene.remove(logo);
      const disposables = logo.userData.disposables as Array<{ dispose: () => void }> | undefined;
      disposables?.forEach((disposable) => disposable.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={hostRef} className="menu-title-canvas" aria-label="Space Trader" role="img" />;
}

export function HomeScreen({
  callsignDraft,
  hasSavedCallsign,
  isEditingCallsign,
  lastFactionLabel,
  canPlayOnline,
  showOnlineExperimental,
  onCallsignChange,
  onStartEditingCallsign,
  onSaveCallsign,
  onCancelEditingCallsign,
  onPlayVsAi,
  onPlayOnline,
  onLearnToPlay,
}: HomeScreenProps) {
  const showCallsignEditor = isEditingCallsign || !hasSavedCallsign;

  return (
    <main className="menu-shell">
      <section className="menu-hero">
        <WireframeTitleCanvas />
        <p className="menu-hero-copy">
          Start a skirmish against the bot, queue for an online match, or review the basics before you launch.
        </p>
        <div className="menu-primary-actions">
          <button type="button" className="menu-cta primary" onClick={onPlayVsAi}>
            Play vs AI
          </button>
          {canPlayOnline ? (
            <button type="button" className="menu-cta" onClick={onPlayOnline}>
              Play Online
              {showOnlineExperimental ? <span className="menu-cta-tag">Experimental</span> : null}
            </button>
          ) : null}
          <button type="button" className="menu-cta secondary" onClick={onLearnToPlay}>
            Learn to Play
          </button>
        </div>
      </section>

      <section className="menu-side-panel">
        <article className="menu-card profile-card">
          <div className="menu-card-head">
            <div>
              <p className="menu-card-eyebrow">Profile</p>
              <h2>Callsign</h2>
            </div>
            {hasSavedCallsign && !showCallsignEditor ? (
              <button type="button" className="menu-inline-button" onClick={onStartEditingCallsign}>
                Edit
              </button>
            ) : null}
          </div>

          {showCallsignEditor ? (
            <div className="menu-form-block">
              <label className="menu-field">
                <span className="menu-field-label">Callsign</span>
                <input
                  className="menu-input"
                  type="text"
                  value={callsignDraft}
                  maxLength={24}
                  onChange={(event) => onCallsignChange(event.target.value)}
                  placeholder="Captain"
                />
              </label>
              <div className="menu-form-actions">
                <button type="button" className="menu-small-button primary" onClick={onSaveCallsign}>
                  Save
                </button>
                {hasSavedCallsign ? (
                  <button type="button" className="menu-small-button" onClick={onCancelEditingCallsign}>
                    Cancel
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="menu-profile-value">{callsignDraft}</p>
          )}

          <p className="menu-muted">
            {lastFactionLabel ? `Last skirmish faction: ${lastFactionLabel}` : "No skirmish preference saved yet."}
          </p>
        </article>

        <article className="menu-card menu-card-muted">
          <p className="menu-card-eyebrow">Recommended Start</p>
          <h2>Play vs AI</h2>
          <p className="menu-muted">
            Fastest path into a real match. Pick a faction and launch in two clicks.
          </p>
        </article>

        <article className="menu-card menu-card-muted">
          <p className="menu-card-eyebrow">Learn</p>
          <h2>Need a refresher?</h2>
          <p className="menu-muted">
            Review the battlefield, phases, harvesting loop, and stack rules before you commit to a match.
          </p>
        </article>
      </section>
    </main>
  );
}
