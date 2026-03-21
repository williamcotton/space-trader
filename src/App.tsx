import "./App.css";
import { GameCanvas } from "./GameCanvas";
import { CommandStackPanel } from "./ui/CommandStackPanel";
import { GameHudPanels } from "./ui/GameHudPanels";
import { GameTopBar } from "./ui/GameTopBar";
import { HandTray } from "./ui/HandTray";

function App() {
  return (
    <main className="app-shell">
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
    </main>
  );
}

export default App;
