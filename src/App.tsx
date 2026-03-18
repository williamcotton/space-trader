import "./App.css";
import { GameCanvas } from "./GameCanvas";

function App() {
  return (
    <main className="app-shell">
      <GameCanvas width={1024} height={768} />
    </main>
  );
}

export default App;
