import { useEffect, useRef } from "react";
import { getGameRuntime } from "./game/runtime";

export function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeRef = useRef(getGameRuntime());

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) {
      return;
    }

    const runtime = runtimeRef.current;
    const resize = () => {
      const rect = parent.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.floor(Math.max(320, Math.floor(rect.width)) * dpr));
      const h = Math.max(1, Math.floor(Math.max(320, Math.floor(rect.height)) * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        runtime.setViewport(w, h);
        // Immediately redraw after resize clears the buffer to prevent blank flash
        const ctx = canvas.getContext("2d");
        if (ctx) {
          runtime.step(ctx, 0);
        }
      }
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(parent);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const runtime = runtimeRef.current;
    runtime.setViewport(canvas.width, canvas.height);

    let frame = 0;
    let loopRunning = false;
    let lastTime = 0;

    const stopLoop = (): void => {
      if (frame !== 0) {
        window.cancelAnimationFrame(frame);
      }
      frame = 0;
      loopRunning = false;
      lastTime = 0;
    };

    const loop = (time: number): void => {
      if (document.hidden) {
        stopLoop();
        return;
      }

      const deltaSeconds = lastTime === 0 ? 0 : Math.min((time - lastTime) / 1000, 0.05);
      lastTime = time;

      runtime.step(context, deltaSeconds);

      if (runtime.hasActiveAnimations()) {
        frame = window.requestAnimationFrame(loop);
        return;
      }

      frame = 0;
      loopRunning = false;
    };

    const startLoop = (): void => {
      if (loopRunning || document.hidden || !runtime.hasActiveAnimations()) {
        return;
      }

      loopRunning = true;
      lastTime = 0;
      frame = window.requestAnimationFrame(loop);
    };

    const renderNow = (): void => {
      if (document.hidden) {
        return;
      }

      if (!loopRunning) {
        runtime.step(context, 0);
      }
      startLoop();
    };

    renderNow();
    const unsubscribeState = runtime.subscribe(renderNow);
    const unsubscribeTransient = runtime.subscribeTransient(renderNow);

    const onVisibilityChange = (): void => {
      if (document.hidden) {
        stopLoop();
        return;
      }
      renderNow();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      unsubscribeTransient();
      unsubscribeState();
      stopLoop();
    };
  }, []);

  useEffect(() => {
    const runtime = runtimeRef.current;
    const onKeyDown = (event: KeyboardEvent): void => {
      const key = event.key.toLowerCase();
      if (key === "n") {
        runtime.debugAdvancePhase();
        return;
      }

      if (key === "u") {
        runtime.debugSelectFirstActiveUnit();
        return;
      }

      if (key === "a") {
        runtime.debugAttackFirstTargetInRange();
        return;
      }

      if (key === "h") {
        runtime.debugHarvestSelectedUnit();
        return;
      }

      if (key === "p") {
        runtime.debugPassPriority();
        return;
      }

      if (key === "r") {
        runtime.debugRespondStack();
        return;
      }

      if (key === "t") {
        runtime.debugRespondDamageEnemyBase();
        return;
      }

      if (key === "c") {
        runtime.debugRespondCounterTopItem();
        return;
      }

      if (key === "b") {
        if (event.shiftKey) {
          runtime.toggleBotAutoplay("player_1");
          return;
        }
        runtime.toggleBotAutoplay("player_2");
        return;
      }

      if (event.key === "ArrowRight") {
        runtime.debugMoveSelectedUnit(1, 0);
        return;
      }

      if (event.key === "ArrowLeft") {
        runtime.debugMoveSelectedUnit(-1, 0);
        return;
      }

      if (event.key === "ArrowUp") {
        runtime.debugMoveSelectedUnit(0, -1);
        return;
      }

      if (event.key === "ArrowDown") {
        runtime.debugMoveSelectedUnit(0, 1);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const runtime = runtimeRef.current;

    const getCanvasPoint = (event: MouseEvent): { x: number; y: number } => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((event.clientX - rect.left) * canvas.width) / rect.width,
        y: ((event.clientY - rect.top) * canvas.height) / rect.height,
      };
    };

    const onMouseMove = (event: MouseEvent): void => {
      const point = getCanvasPoint(event);
      runtime.setHoveredHexFromScreenPoint(point.x, point.y);
    };

    const onMouseLeave = (): void => {
      runtime.clearHoveredHex();
    };

    const onClick = (event: MouseEvent): void => {
      const point = getCanvasPoint(event);
      runtime.selectUnitFromScreenPoint(point.x, point.y);
    };

    canvas.addEventListener("mousemove", onMouseMove);
    canvas.addEventListener("mouseleave", onMouseLeave);
    canvas.addEventListener("click", onClick);

    return () => {
      canvas.removeEventListener("mousemove", onMouseMove);
      canvas.removeEventListener("mouseleave", onMouseLeave);
      canvas.removeEventListener("click", onClick);
    };
  }, []);

  return <canvas ref={canvasRef} className="game-canvas" style={{ width: "100%", height: "100%", display: "block" }} />;
}
