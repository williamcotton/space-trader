import type { CSSProperties } from "react";
import type { ResourceType } from "../game/model/enums";
import { getResourceTheme } from "../game/presentation";

type ResourceIconProps = {
  resource: ResourceType;
  size?: number;
  className?: string;
};

function ResourceGlyph({ resource }: { resource: ResourceType }) {
  if (resource === "credits") {
    return (
      <>
        <polygon points="12,3 19,7 19,17 12,21 5,17 5,7" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="12" cy="12" r="2.7" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </>
    );
  }

  if (resource === "alloy") {
    return (
      <>
        <rect x="5" y="6" width="14" height="4" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <rect x="7" y="13" width="10" height="3.6" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      </>
    );
  }

  if (resource === "flux") {
    return <path d="M11.2 3 14.5 9.2 11.9 9.2 15.4 21 10.1 13.1 12.5 13.1 8.8 3Z" fill="currentColor" />;
  }

  return (
    <>
      <path d="M12 20c.7-3.4.4-8.6 5.4-12.8C13.1 6 11.2 8.4 12 12.5 12.8 8.4 10.9 6 6.6 7.2 11.6 11.4 11.3 16.6 12 20Z" fill="currentColor" />
      <path d="M12 18.2V8.5" stroke="rgba(5,10,25,0.75)" strokeWidth="1.2" strokeLinecap="round" />
    </>
  );
}

export function ResourceIcon({ resource, size = 14, className }: ResourceIconProps) {
  const theme = getResourceTheme(resource);
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
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <ResourceGlyph resource={resource} />
      </svg>
    </span>
  );
}
