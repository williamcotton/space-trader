import type { CSSProperties } from "react";
import type { ResourceType } from "../game/model/enums";
import { getRegisteredCurrencyResourceId, getRegisteredResourceModule } from "../game/content/registry";
import type { ResourceGlyphShape } from "../game/content/sets/types";
import { getResourceTheme } from "../game/presentation";

type ResourceIconProps = {
  resource: ResourceType;
  size?: number;
  className?: string;
};

function renderGlyphShape(shape: ResourceGlyphShape, index: number) {
  switch (shape.type) {
    case "polygon":
      return <polygon key={index} points={shape.points} fill={shape.fill} stroke={shape.stroke} strokeWidth={shape.strokeWidth} />;
    case "circle":
      return <circle key={index} cx={shape.cx} cy={shape.cy} r={shape.r} fill={shape.fill} stroke={shape.stroke} strokeWidth={shape.strokeWidth} />;
    case "rect":
      return (
        <rect
          key={index}
          x={shape.x}
          y={shape.y}
          width={shape.width}
          height={shape.height}
          rx={shape.rx}
          fill={shape.fill}
          stroke={shape.stroke}
          strokeWidth={shape.strokeWidth}
        />
      );
    case "path":
      return (
        <path
          key={index}
          d={shape.d}
          fill={shape.fill}
          stroke={shape.stroke}
          strokeWidth={shape.strokeWidth}
          strokeLinecap={shape.strokeLinecap}
          strokeLinejoin={shape.strokeLinejoin}
        />
      );
    case "line":
      return (
        <line
          key={index}
          x1={shape.x1}
          y1={shape.y1}
          x2={shape.x2}
          y2={shape.y2}
          stroke={shape.stroke}
          strokeWidth={shape.strokeWidth}
          strokeLinecap={shape.strokeLinecap}
        />
      );
  }
}

function ResourceGlyph({ resource }: { resource: ResourceType }) {
  const module = getRegisteredResourceModule(resource);
  if (!module?.glyph) {
    return (
      <text x="12" y="12" textAnchor="middle" dominantBaseline="central" fill="currentColor" fontSize="11" fontWeight="700">
        {getResourceTheme(resource).shortLabel.toUpperCase().slice(0, 2)}
      </text>
    );
  }

  return <>{module.glyph.shapes.map(renderGlyphShape)}</>;
}

export function ResourceIcon({ resource, size = 14, className }: ResourceIconProps) {
  const theme = getResourceTheme(resource);
  const module = getRegisteredResourceModule(resource);
  const fallbackModule = getRegisteredResourceModule(getRegisteredCurrencyResourceId());
  const viewBox = module?.glyph?.viewBox ?? fallbackModule?.glyph?.viewBox ?? { width: 24, height: 24 };
  return (
    <span
      className={["resource-icon", className ?? ""].join(" ").trim()}
      style={
        {
          "--resource-color": theme.color,
          width: `${size}px`,
          height: `${size}px`,
        } as CSSProperties
      }
      aria-label={theme.label}
      title={theme.label}
    >
      <svg viewBox={`0 0 ${viewBox.width} ${viewBox.height}`} aria-hidden="true">
        <ResourceGlyph resource={resource} />
      </svg>
    </span>
  );
}
