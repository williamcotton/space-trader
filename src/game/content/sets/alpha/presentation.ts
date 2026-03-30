import type { RoleTheme } from "../../../registries/presentation";
import type { UnitRole } from "../../../model/enums";

export const ALPHA_SET_ROLE_THEMES: Record<UnitRole, RoleTheme> = {
  combat: {
    label: "Combat",
    accent: "#ff9680",
  },
  resource: {
    label: "Resource",
    accent: "#8ff2be",
  },
  utility: {
    label: "Utility",
    accent: "#d5b4ff",
  },
};
