import type { CardSet } from "../types";
import { FOUNDATION_STACK_EFFECTS } from "./stackEffects";
import { FOUNDATION_RUNTIME_INSTALLER } from "./installers/runtime";

export const FOUNDATION_SET: CardSet = {
  id: "foundation",
  name: "Foundation",
  installers: [FOUNDATION_RUNTIME_INSTALLER],
  stackEffects: FOUNDATION_STACK_EFFECTS,
};
