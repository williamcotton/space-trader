import type { MatchResultSummary } from "../app/types";

type ResultsScreenProps = {
  result: MatchResultSummary;
  onReturnHome: () => void;
  onPlayAgain?: () => void;
};

export function ResultsScreen({ result, onReturnHome, onPlayAgain }: ResultsScreenProps) {
  const outcomeLabel = result.outcome.charAt(0).toUpperCase() + result.outcome.slice(1);

  return (
    <main className="menu-shell">
      <section className="results-panel">
        <p className="menu-kicker">Results</p>
        <h1>{result.headline}</h1>
        <p className="menu-hero-copy">
          {result.modeLabel ? `${result.modeLabel} · ` : ""}
          {result.detail ?? "Match complete."}
        </p>

        <div className="results-summary-grid">
          <article className="menu-card menu-card-muted">
            <p className="menu-card-eyebrow">Source</p>
            <strong>{result.source === "local" ? "Local Match" : "Online Match"}</strong>
          </article>
          <article className="menu-card menu-card-muted">
            <p className="menu-card-eyebrow">Outcome</p>
            <strong>{outcomeLabel}</strong>
          </article>
          {result.matchId ? (
            <article className="menu-card menu-card-muted">
              <p className="menu-card-eyebrow">Match ID</p>
              <strong>{result.matchId}</strong>
            </article>
          ) : null}
        </div>

        <div className="setup-actions">
          {onPlayAgain ? (
            <button type="button" className="menu-cta primary" onClick={onPlayAgain}>
              Play Again
            </button>
          ) : null}
          <button type="button" className={onPlayAgain ? "menu-cta secondary" : "menu-cta primary"} onClick={onReturnHome}>
            Return Home
          </button>
        </div>
      </section>
    </main>
  );
}
