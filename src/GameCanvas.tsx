import { useEffect, useRef, useState } from "react";
import { getGameRuntime } from "./game/runtime";

const FALLBACK_CANVAS_SIZE = {
  width: 1024,
  height: 768,
};

export function GameCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeRef = useRef(getGameRuntime());
  const [canvasSize, setCanvasSize] = useState(FALLBACK_CANVAS_SIZE);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) {
      return;
    }

    const resize = () => {
      const rect = parent.getBoundingClientRect();
      setCanvasSize({
        width: Math.max(320, Math.floor(rect.width)),
        height: Math.max(320, Math.floor(rect.height)),
      });
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

    const runtime = runtimeRef.current;
    const devicePixelRatio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(canvasSize.width * devicePixelRatio));
    canvas.height = Math.max(1, Math.floor(canvasSize.height * devicePixelRatio));
    runtime.setViewport(canvas.width, canvas.height);
  }, [canvasSize]);

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
    let lastTime = performance.now();

    const loop = (time: number): void => {
      const deltaSeconds = Math.min((time - lastTime) / 1000, 0.05);
      lastTime = time;

      runtime.step(context, deltaSeconds);
      frame = window.requestAnimationFrame(loop);
    };

    runtime.step(context, 0);
    frame = window.requestAnimationFrame(loop);

    return () => {
      window.cancelAnimationFrame(frame);
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

  return <canvas ref={canvasRef} className="game-canvas" style={{ width: `${canvasSize.width}px`, height: `${canvasSize.height}px` }} />;
}
