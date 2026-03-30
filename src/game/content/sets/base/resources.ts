import type { ResourceModule } from "../types";

export const BASE_SET_RESOURCES: ResourceModule[] = [
  {
    id: "credits",
    label: "Credits",
    shortLabel: "C",
    color: "#e8f15e",
    glow: "rgba(232, 241, 94, 0.28)",
    kind: "currency",
    displayOrder: 0,
    glyph: {
      shapes: [
        { type: "polygon", points: "12,3 19,7 19,17 12,21 5,17 5,7", fill: "none", stroke: "currentColor", strokeWidth: 1.8 },
        { type: "circle", cx: 12, cy: 12, r: 2.7, fill: "none", stroke: "currentColor", strokeWidth: 1.8 },
      ],
    },
  },
  {
    id: "alloy",
    label: "Alloy",
    shortLabel: "A",
    color: "#b7c2d1",
    glow: "rgba(183, 194, 209, 0.24)",
    kind: "primary",
    displayOrder: 1,
    glyph: {
      shapes: [
        { type: "rect", x: 5, y: 6, width: 14, height: 4, rx: 1.4, fill: "none", stroke: "currentColor", strokeWidth: 1.8 },
        { type: "rect", x: 7, y: 13, width: 10, height: 3.6, rx: 1.2, fill: "none", stroke: "currentColor", strokeWidth: 1.8 },
      ],
    },
  },
  {
    id: "flux",
    label: "Flux",
    shortLabel: "F",
    color: "#6ea8ff",
    glow: "rgba(110, 168, 255, 0.26)",
    kind: "primary",
    displayOrder: 2,
    glyph: {
      shapes: [
        { type: "path", d: "M11.2 3 14.5 9.2 11.9 9.2 15.4 21 10.1 13.1 12.5 13.1 8.8 3Z", fill: "currentColor" },
      ],
    },
  },
  {
    id: "biomass",
    label: "Biomass",
    shortLabel: "B",
    color: "#5fe38f",
    glow: "rgba(95, 227, 143, 0.24)",
    kind: "primary",
    displayOrder: 3,
    glyph: {
      shapes: [
        { type: "path", d: "M12 20c.7-3.4.4-8.6 5.4-12.8C13.1 6 11.2 8.4 12 12.5 12.8 8.4 10.9 6 6.6 7.2 11.6 11.4 11.3 16.6 12 20Z", fill: "currentColor" },
        { type: "line", x1: 12, y1: 18.2, x2: 12, y2: 8.5, stroke: "rgba(5,10,25,0.75)", strokeWidth: 1.2, strokeLinecap: "round" },
      ],
    },
  },
];
