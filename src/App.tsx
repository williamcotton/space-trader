import "./App.css";
import { GameCanvas } from "./GameCanvas";
import { DebugStackControls } from "./ui/DebugStackControls";

function App() {
  return (
    <main className="app-shell">
      <GameCanvas width={1024} height={768} />
      <DebugStackControls />
    </main>
  );
}

export default App;
