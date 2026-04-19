import { useState } from "react";
import "./App.css";
import { getAppBootConfig } from "./app/boot";
import type { AppScreen } from "./app/types";
import { MatchScreen } from "./screens/MatchScreen";

function App() {
  const [screen] = useState<AppScreen>(() => getAppBootConfig({ launchScreensEnabled: false }).initialScreen);

  switch (screen.kind) {
    case "match":
      return <MatchScreen />;
    default:
      return <MatchScreen />;
  }
}

export default App;
