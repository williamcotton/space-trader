import { getRegisteredFactionIds } from "../game/content/registry";
import type { Faction } from "../game/model/enums";
import { formatFactionName } from "../game/presentation";

type SinglePlayerSetupScreenProps = {
  selectedFaction: Faction;
  onSelectFaction: (faction: Faction) => void;
  onStart: () => void;
  onBack: () => void;
};

export function SinglePlayerSetupScreen({
  selectedFaction,
  onSelectFaction,
  onStart,
  onBack,
}: SinglePlayerSetupScreenProps) {
  const factionIds = getRegisteredFactionIds();

  return (
    <main className="menu-shell">
      <section className="setup-panel">
        <p className="menu-kicker">Play vs AI</p>
        <h1>Start a skirmish.</h1>
        <p className="menu-hero-copy">
          This is a local 1v1 match against the current bot. Pick your faction and launch.
        </p>

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
