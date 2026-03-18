import { useEffect, useRef } from "react";
import { getGameRuntime } from "./game/runtime";

type GameCanvasProps = {
  width: number;
  height: number;
};

export function GameCanvas({ width, height }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeRef = useRef(getGameRuntime());

  useEffect(() => {
    const runtime = runtimeRef.current;
    runtime.setViewport(width, height);
  }, [height, width]);

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
    runtime.setViewport(width, height);

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

  return <canvas ref={canvasRef} className="game-canvas" width={width} height={height} />;
}
