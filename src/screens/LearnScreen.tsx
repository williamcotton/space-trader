import { LEARN_SECTIONS } from "../app/learnContent";

type LearnScreenProps = {
  onBack: () => void;
  onStartPracticeMatch: () => void;
};

export function LearnScreen({ onBack, onStartPracticeMatch }: LearnScreenProps) {
  return (
    <main className="learn-shell">
      <header className="learn-header">
        <div>
          <p className="menu-kicker">Learn to Play</p>
          <h1>Frontier briefing.</h1>
          <p className="menu-hero-copy">
            This overview turns the current intro guide into an in-game primer so new players can learn without leaving the client.
          </p>
        </div>
        <div className="learn-header-actions">
          <button type="button" className="menu-cta primary" onClick={onStartPracticeMatch}>
            Start Practice Match
          </button>
          <button type="button" className="menu-cta secondary" onClick={onBack}>
            Back to Menu
          </button>
        </div>
      </header>

      <section className="learn-content">
        {LEARN_SECTIONS.map((section, index) => (
          <article key={section.id} className="learn-section">
            <div className="learn-copy">
              <p className="menu-card-eyebrow">Step {index + 1}</p>
              <h2>{section.title}</h2>
              {section.body.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
            {section.imageSrc ? (
              <div className="learn-image-frame">
                <img src={section.imageSrc} alt={section.imageAlt ?? section.title} className="learn-image" />
              </div>
            ) : null}
          </article>
        ))}
      </section>
    </main>
  );
}
