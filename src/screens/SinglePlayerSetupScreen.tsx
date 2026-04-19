import { LOCAL_SKIRMISH_PRESETS, getLocalSkirmishPreset, type LocalSkirmishPresetId } from "../app/localSkirmish";
import { getRegisteredFactionIds } from "../game/content/registry";
import type { Faction } from "../game/model/enums";
import { formatFactionName } from "../game/presentation";

type SinglePlayerSetupScreenProps = {
  selectedFaction: Faction;
  selectedSkirmishPresetId: LocalSkirmishPresetId;
  onSelectFaction: (faction: Faction) => void;
  onSelectSkirmishPreset: (presetId: LocalSkirmishPresetId) => void;
  onStart: () => void;
  onBack: () => void;
};

export function SinglePlayerSetupScreen({
  selectedFaction,
  selectedSkirmishPresetId,
  onSelectFaction,
  onSelectSkirmishPreset,
  onStart,
  onBack,
}: SinglePlayerSetupScreenProps) {
  const factionIds = getRegisteredFactionIds();
  const selectedPreset = getLocalSkirmishPreset(selectedSkirmishPresetId);

  return (
    <main className="menu-shell">
      <section className="setup-panel">
        <p className="menu-kicker">Play vs AI</p>
        <h1>Start a skirmish.</h1>
        <p className="menu-hero-copy">
          This is a local skirmish against AI opponents. Pick your faction, choose the battlefield, and launch.
        </p>

        <div className="setup-grid">
          <label className="menu-field setup-field">
            <span className="menu-field-label">Faction</span>
            <select
              className="menu-select"
              value={selectedFaction}
              onChange={(event) => onSelectFaction(event.target.value as Faction)}
            >
              {factionIds.map((factionId) => (
                <option key={factionId} value={factionId}>
                  {formatFactionName(factionId)}
                </option>
              ))}
            </select>
          </label>

          <label className="menu-field setup-field">
            <span className="menu-field-label">Map</span>
            <select
              className="menu-select"
              value={selectedSkirmishPresetId}
              onChange={(event) => onSelectSkirmishPreset(event.target.value as LocalSkirmishPresetId)}
            >
              {LOCAL_SKIRMISH_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.label} · {preset.opponentCount} {preset.opponentCount === 1 ? "Opponent" : "Opponents"}
                </option>
              ))}
            </select>
          </label>
        </div>

        <p className="menu-muted">{selectedPreset.description}</p>

        <div className="setup-actions">
          <button type="button" className="menu-cta primary" onClick={onStart}>
            Start Skirmish
          </button>
          <button type="button" className="menu-cta secondary" onClick={onBack}>
            Back
          </button>
        </div>
      </section>
    </main>
  );
}
