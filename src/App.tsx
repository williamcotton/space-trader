import "./App.css";
import { GameCanvas } from "./GameCanvas";
import { DebugStackControls } from "./ui/DebugStackControls";
import { HandTray } from "./ui/HandTray";

function App() {
  return (
    <main className="app-shell">
      <GameCanvas width={1024} height={768} />
      <HandTray />
      <DebugStackControls />
    </main>
  );
}

export default App;
