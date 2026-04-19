type HomeScreenProps = {
  callsignDraft: string;
  hasSavedCallsign: boolean;
  isEditingCallsign: boolean;
  lastFactionLabel: string | null;
  canPlayOnline: boolean;
  showOnlineExperimental: boolean;
  onCallsignChange: (value: string) => void;
  onStartEditingCallsign: () => void;
  onSaveCallsign: () => void;
  onCancelEditingCallsign: () => void;
  onPlayVsAi: () => void;
  onPlayOnline: () => void;
  onLearnToPlay: () => void;
};

export function HomeScreen({
  callsignDraft,
  hasSavedCallsign,
  isEditingCallsign,
  lastFactionLabel,
  canPlayOnline,
  showOnlineExperimental,
  onCallsignChange,
  onStartEditingCallsign,
  onSaveCallsign,
  onCancelEditingCallsign,
  onPlayVsAi,
  onPlayOnline,
  onLearnToPlay,
}: HomeScreenProps) {
  const showCallsignEditor = isEditingCallsign || !hasSavedCallsign;

  return (
    <main className="menu-shell">
      <section className="menu-hero">
        <p className="menu-kicker">Space Trader</p>
        <h1>Choose your route.</h1>
        <p className="menu-hero-copy">
          Start a skirmish against the bot, queue for an online match, or review the basics before you launch.
        </p>
        <div className="menu-primary-actions">
          <button type="button" className="menu-cta primary" onClick={onPlayVsAi}>
            Play vs AI
          </button>
          {canPlayOnline ? (
            <button type="button" className="menu-cta" onClick={onPlayOnline}>
              Play Online
              {showOnlineExperimental ? <span className="menu-cta-tag">Experimental</span> : null}
            </button>
          ) : null}
          <button type="button" className="menu-cta secondary" onClick={onLearnToPlay}>
            Learn to Play
          </button>
        </div>
      </section>

      <section className="menu-side-panel">
        <article className="menu-card profile-card">
          <div className="menu-card-head">
            <div>
              <p className="menu-card-eyebrow">Profile</p>
              <h2>Callsign</h2>
            </div>
            {hasSavedCallsign && !showCallsignEditor ? (
              <button type="button" className="menu-inline-button" onClick={onStartEditingCallsign}>
                Edit
              </button>
            ) : null}
          </div>

          {showCallsignEditor ? (
            <div className="menu-form-block">
              <label className="menu-field">
                <span className="menu-field-label">Callsign</span>
                <input
                  className="menu-input"
                  type="text"
                  value={callsignDraft}
                  maxLength={24}
                  onChange={(event) => onCallsignChange(event.target.value)}
                  placeholder="Captain"
                />
              </label>
              <div className="menu-form-actions">
                <button type="button" className="menu-small-button primary" onClick={onSaveCallsign}>
                  Save
                </button>
                {hasSavedCallsign ? (
                  <button type="button" className="menu-small-button" onClick={onCancelEditingCallsign}>
                    Cancel
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="menu-profile-value">{callsignDraft}</p>
          )}

          <p className="menu-muted">
            {lastFactionLabel ? `Last skirmish faction: ${lastFactionLabel}` : "No skirmish preference saved yet."}
          </p>
        </article>

        <article className="menu-card menu-card-muted">
          <p className="menu-card-eyebrow">Recommended Start</p>
          <h2>Play vs AI</h2>
          <p className="menu-muted">
            Fastest path into a real match. Pick a faction and launch in two clicks.
          </p>
        </article>

        <article className="menu-card menu-card-muted">
          <p className="menu-card-eyebrow">Learn</p>
          <h2>Need a refresher?</h2>
          <p className="menu-muted">
            Review the battlefield, phases, harvesting loop, and stack rules before you commit to a match.
          </p>
        </article>
      </section>
    </main>
  );
}
