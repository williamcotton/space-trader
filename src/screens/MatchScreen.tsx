import { useEffect } from "react";
import { GameCanvas } from "../GameCanvas";
import { CommandStackPanel } from "../ui/CommandStackPanel";
import { GameHudPanels } from "../ui/GameHudPanels";
import { GameTopBar } from "../ui/GameTopBar";
import { HandTray } from "../ui/HandTray";
import { InMatchMenu } from "./InMatchMenu";

type MatchScreenProps = {
  menuOpen: boolean;
  isNetworkMatch: boolean;
  onOpenMenu: () => void;
  onCloseMenu: () => void;
  onReturnToMenu: () => void;
  onQuitMatch: () => void;
  onDisconnect: () => void;
};

export function MatchScreen({
  menuOpen,
  isNetworkMatch,
  onOpenMenu,
  onCloseMenu,
  onReturnToMenu,
  onQuitMatch,
  onDisconnect,
}: MatchScreenProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || event.defaultPrevented) {
        return;
      }

      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      if (menuOpen) {
        onCloseMenu();
      } else {
        onOpenMenu();
      }
      event.preventDefault();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [menuOpen, onCloseMenu, onOpenMenu]);

  return (
    <main className="match-shell">
      <button type="button" className="match-menu-button" onClick={onOpenMenu}>
        Menu
      </button>
      <GameTopBar />
      <section className="game-workspace">
        <div className="game-main-column">
          <div className="game-board-shell">
            <GameCanvas />
          </div>
          <HandTray />
        </div>
        <aside className="game-sidebar">
          <GameHudPanels />
          <CommandStackPanel />
        </aside>
      </section>
      <InMatchMenu
        open={menuOpen}
        isNetworkMatch={isNetworkMatch}
        onResume={onCloseMenu}
        onReturnToMenu={onReturnToMenu}
        onQuitMatch={onQuitMatch}
        onDisconnect={onDisconnect}
      />
    </main>
  );
}
