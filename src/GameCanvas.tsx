import { useEffect, useRef } from "react";

type GameCanvasProps = {
  width: number;
  height: number;
};

export function GameCanvas({ width, height }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const text = "hello, world!";
    const fontSize = 32;
    const font = `${fontSize}px monospace`;
    let x = 80;
    let y = 120;
    let dx = 280;
    let dy = 200;
    let frame = 0;
    let lastTime = performance.now();

    const update = (deltaSeconds: number): void => {
      context.font = font;
      const textWidth = context.measureText(text).width;
      const textHeight = fontSize;

      x += dx * deltaSeconds;
      y += dy * deltaSeconds;

      if (x <= 0) {
        x = 0;
        dx = Math.abs(dx);
      }

      if (x + textWidth >= width) {
        x = width - textWidth;
        dx = -Math.abs(dx);
      }

      if (y - textHeight <= 0) {
        y = textHeight;
        dy = Math.abs(dy);
      }

      if (y >= height) {
        y = height;
        dy = -Math.abs(dy);
      }
    };

    const render = (): void => {
      context.fillStyle = "#0a0a2e";
      context.fillRect(0, 0, width, height);

      context.font = font;
      context.fillStyle = "#00ff88";
      context.textBaseline = "alphabetic";
      context.fillText(text, x, y);
    };

    const loop = (time: number): void => {
      const deltaSeconds = Math.min((time - lastTime) / 1000, 0.05);
      lastTime = time;

      update(deltaSeconds);
      render();
      frame = window.requestAnimationFrame(loop);
    };

    render();
    frame = window.requestAnimationFrame(loop);

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [height, width]);

  return <canvas ref={canvasRef} className="game-canvas" width={width} height={height} />;
}
