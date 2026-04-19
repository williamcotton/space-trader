type InMatchMenuProps = {
  open: boolean;
  isNetworkMatch: boolean;
  onResume: () => void;
  onReturnToMenu: () => void;
  onQuitMatch: () => void;
  onDisconnect: () => void;
};

export function InMatchMenu({
  open,
  isNetworkMatch,
  onResume,
  onReturnToMenu,
  onQuitMatch,
  onDisconnect,
}: InMatchMenuProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="match-menu-backdrop" role="presentation" onClick={onResume}>
      <section
        className="match-menu"
        aria-label="Match menu"
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="menu-kicker">Match Menu</p>
        <h2>Session controls</h2>
        <div className="match-menu-actions">
          <button type="button" className="menu-cta primary" onClick={onResume}>
            Resume
          </button>
          <button type="button" className="menu-cta secondary" onClick={onReturnToMenu}>
            Return to Menu
          </button>
          {isNetworkMatch ? (
            <>
              <button type="button" className="menu-cta secondary" onClick={onQuitMatch}>
                Quit Match
              </button>
              <button type="button" className="menu-cta secondary" onClick={onDisconnect}>
                Disconnect
              </button>
            </>
          ) : null}
        </div>
      </section>
    </div>
  );
}
