import { useEffect, useRef } from "react";
import { getGameRuntime } from "./game/runtime";

type GameCanvasProps = {
  width: number;
  height: number;
  message?: string;
};

export function GameCanvas({ width, height, message = "hello, world!" }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const runtimeRef = useRef(getGameRuntime());

  useEffect(() => {
    const runtime = runtimeRef.current;
    runtime.setViewport(width, height);
  }, [height, width]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    runtime.setMessage(message);
  }, [message]);

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
    runtime.setMessage(message);

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

  return <canvas ref={canvasRef} className="game-canvas" width={width} height={height} />;
}
