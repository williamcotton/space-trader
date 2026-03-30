import type { SetMechanicModule } from "../../../mechanics/types";
import { installBastionMechanic } from "./bastion";
import { installBloomMechanic } from "./bloom";
import { installRelayMechanic } from "./relay";
import { installSalvageMechanic } from "./salvage";
import { installSproutMechanic } from "./sprout";
import { installStealthMechanic } from "./stealth";
import { installSurgeMechanic } from "./surge";
import { installUncounterableMechanic } from "./uncounterable";

export const ALPHA_SET_MECHANICS: SetMechanicModule[] = [
  { id: "sprout", install: installSproutMechanic },
  { id: "stealth", install: installStealthMechanic },
  { id: "relay", install: installRelayMechanic },
  { id: "surge", install: installSurgeMechanic },
  { id: "bloom", install: installBloomMechanic },
  { id: "salvage", install: installSalvageMechanic },
  { id: "bastion", install: installBastionMechanic },
  { id: "uncounterable", install: installUncounterableMechanic },
];
