export type LocalSkirmishPresetId = "alpha_default" | "alpha_three_player" | "alpha_four_player";

export type LocalSkirmishPreset = {
  id: LocalSkirmishPresetId;
  label: string;
  opponentCount: number;
  description: string;
  modeLabel: string;
};

export const DEFAULT_LOCAL_SKIRMISH_PRESET_ID: LocalSkirmishPresetId = "alpha_default";

export const LOCAL_SKIRMISH_PRESETS: LocalSkirmishPreset[] = [
  {
    id: "alpha_default",
    label: "Frontier Belt",
    opponentCount: 1,
    description: "Classic 1v1 battlefield with one AI commander.",
    modeLabel: "Skirmish · 1 Opponent",
  },
  {
    id: "alpha_three_player",
    label: "Frontier Triad",
    opponentCount: 2,
    description: "Three-way free-for-all with two AI commanders.",
    modeLabel: "Skirmish · 2 Opponents",
  },
  {
    id: "alpha_four_player",
    label: "Frontier Crossroads",
    opponentCount: 3,
    description: "Full free-for-all with three AI commanders.",
    modeLabel: "Skirmish · 3 Opponents",
  },
];

export function getLocalSkirmishPreset(presetId: LocalSkirmishPresetId | null | undefined): LocalSkirmishPreset {
  return LOCAL_SKIRMISH_PRESETS.find((preset) => preset.id === presetId) ?? LOCAL_SKIRMISH_PRESETS[0];
}
