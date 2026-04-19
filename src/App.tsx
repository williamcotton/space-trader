import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import "./App.css";
import { getAppBootConfig } from "./app/boot";
import { createLocalExitResultSummary, createNetworkMatchResultSummary, deriveLocalMatchResultSummary } from "./app/resultSummary";
import { DEFAULT_CALLSIGN, getEffectiveCallsign, readProfile, writeProfile, type AppProfile } from "./app/profileStore";
import type { AppScreen, MatchResultSummary } from "./app/types";
import { getRegisteredFactionIds } from "./game/content/registry";
import type { Faction } from "./game/model/enums";
import { PLAYER_ONE, type PlayerId } from "./game/model/ids";
import { formatFactionName } from "./game/presentation";
import { destroyGameRuntime, getGameRuntime, peekGameRuntime } from "./game/runtime";
import { getMultiplayerClient } from "./network/client";
import { DEFAULT_MULTIPLAYER_SERVER_URL, ONLINE_MATCH_FORMATS, type OnlineMatchFormat } from "./network/protocol";
import { useMultiplayerSnapshot } from "./network/useMultiplayerSnapshot";
import { HomeScreen } from "./screens/HomeScreen";
import { LearnScreen } from "./screens/LearnScreen";
import { MatchScreen } from "./screens/MatchScreen";
import { MultiplayerQueueScreen } from "./screens/MultiplayerQueueScreen";
import { MultiplayerSetupScreen } from "./screens/MultiplayerSetupScreen";
import { ResultsScreen } from "./screens/ResultsScreen";
import { SinglePlayerSetupScreen } from "./screens/SinglePlayerSetupScreen";

type LocalMatchConfig = {
  faction: Faction;
  modeLabel: string;
};

type ActiveMatchContext =
  | {
      kind: "local";
      config: LocalMatchConfig;
    }
  | {
      kind: "network";
      format: OnlineMatchFormat;
      faction: Faction;
      localPlayerId: PlayerId | null;
    };

const APP_BOOT_CONFIG = getAppBootConfig({ launchScreensEnabled: true });
const DEFAULT_LOCAL_FACTION = "alloy_clan" as Faction;
const SHOW_DIRECT_MATCH_DEVELOPER_CONTROLS = import.meta.env.DEV && APP_BOOT_CONFIG.resolvedFlow === "direct_match";

function isLocalDeveloperServer(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost" || parsed.hostname === "::1";
  } catch {
    return true;
  }
}

function getPreferredLocalFaction(profile: AppProfile): Faction {
  const registeredFactions = getRegisteredFactionIds();
  return profile.lastLocalFaction ?? registeredFactions[0] ?? DEFAULT_LOCAL_FACTION;
}

function updateStoredProfile(nextProfile: AppProfile, setProfile: (profile: AppProfile) => void, setCallsignDraft: (callsign: string) => void): AppProfile {
  const stored = writeProfile(nextProfile);
  setProfile(stored);
  setCallsignDraft(getEffectiveCallsign(stored));
  return stored;
}

function buildNetworkModeLabel(match: Extract<ActiveMatchContext, { kind: "network" }>): string {
  return ONLINE_MATCH_FORMATS[match.format].label;
}

function buildInitialMatchContext(profile: AppProfile): ActiveMatchContext | null {
  if (APP_BOOT_CONFIG.initialScreen.kind !== "match") {
    return null;
  }
  return {
    kind: "local",
    config: {
      faction: getPreferredLocalFaction(profile),
      modeLabel: "Play vs AI",
    },
  };
}

function shouldWaitForMatchAnimations(result: MatchResultSummary): boolean {
  return result.outcome === "win" || result.outcome === "loss" || result.outcome === "draw";
}

function App() {
  const multiplayerClient = getMultiplayerClient();
  const multiplayerSnapshot = useMultiplayerSnapshot();
  const [profile, setProfile] = useState<AppProfile>(() => readProfile());
  const [callsignDraft, setCallsignDraft] = useState(() => getEffectiveCallsign(readProfile()));
  const [isEditingCallsign, setIsEditingCallsign] = useState(false);
  const [screen, setScreen] = useState<AppScreen>(() => APP_BOOT_CONFIG.initialScreen);
  const [selectedLocalFaction, setSelectedLocalFaction] = useState<Faction>(() => getPreferredLocalFaction(readProfile()));
  const [activeMatch, setActiveMatch] = useState<ActiveMatchContext | null>(() => buildInitialMatchContext(readProfile()));
  const [lastReplayableLocalConfig, setLastReplayableLocalConfig] = useState<LocalMatchConfig | null>(() => {
    const initialMatch = buildInitialMatchContext(readProfile());
    return initialMatch?.kind === "local" ? initialMatch.config : null;
  });
  const [matchMenuOpen, setMatchMenuOpen] = useState(false);
  const [pendingResult, setPendingResult] = useState<MatchResultSummary | null>(null);

  const lastFactionLabel = profile.lastLocalFaction ? formatFactionName(profile.lastLocalFaction) : null;
  const canPlayOnline = import.meta.env.DEV || !isLocalDeveloperServer(multiplayerSnapshot.serverUrl || DEFAULT_MULTIPLAYER_SERVER_URL);
  const showOnlineExperimental = isLocalDeveloperServer(multiplayerSnapshot.serverUrl || DEFAULT_MULTIPLAYER_SERVER_URL);

  const commitCallsign = useCallback(
    (options?: { closeEditor?: boolean }): AppProfile => {
      const normalizedDraft = callsignDraft.trim() || DEFAULT_CALLSIGN;
      const nextProfile = updateStoredProfile(
        {
          ...profile,
          callsign: normalizedDraft,
          completedFirstRun: true,
        },
        setProfile,
        setCallsignDraft
      );
      if (options?.closeEditor !== false) {
        setIsEditingCallsign(false);
      }
      return nextProfile;
    },
    [callsignDraft, profile]
  );

  const enterResults = useCallback((result: MatchResultSummary) => {
    destroyGameRuntime();
    setMatchMenuOpen(false);
    setPendingResult(null);
    setActiveMatch(null);
    startTransition(() => {
      setScreen({ kind: "results", result });
    });
  }, []);

  const goHome = useCallback(() => {
    destroyGameRuntime();
    setMatchMenuOpen(false);
    setPendingResult(null);
    setActiveMatch(null);
    multiplayerClient.clearLastCompletion();
    startTransition(() => {
      setScreen({ kind: "home" });
    });
  }, [multiplayerClient]);

  const queueResults = useCallback((result: MatchResultSummary) => {
    setMatchMenuOpen(false);
    setPendingResult((current) => current ?? result);
  }, []);

  const startLocalMatch = useCallback(
    (config: LocalMatchConfig) => {
      updateStoredProfile(
        {
          ...profile,
          callsign: (callsignDraft.trim() || DEFAULT_CALLSIGN),
          completedFirstRun: true,
          lastLocalFaction: config.faction,
        },
        setProfile,
        setCallsignDraft
      );
      setSelectedLocalFaction(config.faction);
      setIsEditingCallsign(false);
      destroyGameRuntime();
      const runtime = getGameRuntime();
      runtime.resetWithContent({
        runtimeProfileId: "alpha_default",
        factions: {
          player_1: config.faction,
        },
      });
      setLastReplayableLocalConfig(config);
      setActiveMatch({
        kind: "local",
        config,
      });
      setMatchMenuOpen(false);
      startTransition(() => {
        setScreen({ kind: "match" });
      });
    },
    [callsignDraft, profile]
  );

  const handleFindMatch = useCallback(async () => {
    commitCallsign();
    try {
      await multiplayerClient.joinQueue(multiplayerSnapshot.selectedFaction, multiplayerSnapshot.selectedFormat);
      const latest = multiplayerClient.getSnapshot();
      if (latest.status === "queued") {
        startTransition(() => {
          setScreen({ kind: "multiplayer_queue" });
        });
      }
    } catch {
      // Client state already carries the error message.
    }
  }, [commitCallsign, multiplayerClient, multiplayerSnapshot.selectedFaction, multiplayerSnapshot.selectedFormat]);

  const handleBackFromMultiplayerSetup = useCallback(() => {
    if (multiplayerSnapshot.status !== "offline" && multiplayerSnapshot.status !== "in_match") {
      multiplayerClient.disconnect();
    }
    multiplayerClient.clearLastCompletion();
    startTransition(() => {
      setScreen({ kind: "home" });
    });
  }, [multiplayerClient, multiplayerSnapshot.status]);

  const handleCancelQueue = useCallback(async () => {
    try {
      if (multiplayerSnapshot.status === "queued") {
        await multiplayerClient.leaveQueue();
      } else {
        multiplayerClient.disconnect();
      }
    } catch {
      multiplayerClient.disconnect();
    }
    startTransition(() => {
      setScreen({ kind: "home" });
    });
  }, [multiplayerClient, multiplayerSnapshot.status]);

  const handleReturnToMenuFromMatch = useCallback(() => {
    if (!activeMatch) {
      goHome();
      return;
    }

    if (activeMatch.kind === "network") {
      multiplayerClient.disconnect();
      return;
    }

    const runtime = peekGameRuntime();
    enterResults(
      createLocalExitResultSummary({
        matchId: runtime?.state.matchId ?? null,
        localPlayerId: PLAYER_ONE,
        modeLabel: activeMatch.config.modeLabel,
      })
    );
  }, [activeMatch, enterResults, goHome, multiplayerClient]);

  const handleQuitMatch = useCallback(() => {
    void multiplayerClient.quitMatch();
  }, [multiplayerClient]);

  const handleDisconnect = useCallback(() => {
    multiplayerClient.disconnect();
  }, [multiplayerClient]);

  const canPlayAgain =
    screen.kind === "results" && screen.result.source === "local"
      ? lastReplayableLocalConfig
      : null;

  useEffect(() => {
    if (multiplayerSnapshot.status === "queued") {
      startTransition(() => {
        setScreen((current) => (current.kind === "match" ? current : { kind: "multiplayer_queue" }));
      });
      return;
    }

    if (multiplayerSnapshot.status === "in_match") {
      const nextMatch: ActiveMatchContext = {
        kind: "network",
        format: multiplayerSnapshot.selectedFormat,
        faction: multiplayerSnapshot.selectedFaction,
        localPlayerId: multiplayerSnapshot.localPlayerId,
      };
      setActiveMatch(nextMatch);
      setMatchMenuOpen(false);
      startTransition(() => {
        setScreen({ kind: "match" });
      });
    }
  }, [
    multiplayerSnapshot.localPlayerId,
    multiplayerSnapshot.selectedFaction,
    multiplayerSnapshot.selectedFormat,
    multiplayerSnapshot.status,
  ]);

  useEffect(() => {
    if (!multiplayerSnapshot.lastCompletion) {
      return;
    }

    const networkMatch = activeMatch?.kind === "network" ? activeMatch : null;
    const result = createNetworkMatchResultSummary({
      reason: multiplayerSnapshot.lastCompletion.reason,
      winnerId: multiplayerSnapshot.lastCompletion.winnerId,
      matchId: multiplayerSnapshot.lastCompletion.matchId,
      detail: multiplayerSnapshot.lastCompletion.detail,
      localPlayerId: networkMatch?.localPlayerId ?? multiplayerSnapshot.localPlayerId,
      modeLabel: networkMatch ? buildNetworkModeLabel(networkMatch) : "Play Online",
    });
    multiplayerClient.clearLastCompletion();
    queueResults(result);
  }, [
    activeMatch,
    multiplayerClient,
    multiplayerSnapshot.lastCompletion,
    multiplayerSnapshot.localPlayerId,
    queueResults,
  ]);

  useEffect(() => {
    if (screen.kind !== "match" || activeMatch?.kind !== "local" || pendingResult) {
      return;
    }

    const runtime = peekGameRuntime();
    if (!runtime) {
      return;
    }

    const handleRuntimeChange = (): void => {
      const result = deriveLocalMatchResultSummary(runtime.state, {
        localPlayerId: PLAYER_ONE,
        modeLabel: activeMatch.config.modeLabel,
      });
      if (result) {
        queueResults(result);
      }
    };

    handleRuntimeChange();
    return runtime.subscribe(handleRuntimeChange);
  }, [activeMatch, pendingResult, queueResults, screen.kind]);

  useEffect(() => {
    if (!pendingResult) {
      return;
    }

    const runtime = peekGameRuntime();
    if (!shouldWaitForMatchAnimations(pendingResult) || !runtime?.hasActiveAnimations()) {
      enterResults(pendingResult);
      return;
    }

    let frame = 0;
    const waitForAnimations = (): void => {
      const nextRuntime = peekGameRuntime();
      if (!nextRuntime || !nextRuntime.hasActiveAnimations()) {
        enterResults(pendingResult);
        return;
      }
      frame = window.requestAnimationFrame(waitForAnimations);
    };

    frame = window.requestAnimationFrame(waitForAnimations);
    return () => {
      if (frame !== 0) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [enterResults, pendingResult]);

  const screenNode = useMemo(() => {
    switch (screen.kind) {
      case "home":
        return (
          <HomeScreen
            callsignDraft={callsignDraft}
            hasSavedCallsign={Boolean(profile.callsign)}
            isEditingCallsign={isEditingCallsign}
            lastFactionLabel={lastFactionLabel}
            canPlayOnline={canPlayOnline}
            showOnlineExperimental={showOnlineExperimental}
            onCallsignChange={setCallsignDraft}
            onStartEditingCallsign={() => setIsEditingCallsign(true)}
            onSaveCallsign={() => {
              commitCallsign();
            }}
            onCancelEditingCallsign={() => {
              setIsEditingCallsign(false);
              setCallsignDraft(getEffectiveCallsign(profile));
            }}
            onPlayVsAi={() => {
              commitCallsign();
              startTransition(() => {
                setScreen({ kind: "single_player_setup" });
              });
            }}
            onPlayOnline={() => {
              commitCallsign();
              startTransition(() => {
                setScreen({ kind: "multiplayer_setup" });
              });
            }}
            onLearnToPlay={() => {
              commitCallsign();
              startTransition(() => {
                setScreen({ kind: "learn" });
              });
            }}
          />
        );
      case "single_player_setup":
        return (
          <SinglePlayerSetupScreen
            selectedFaction={selectedLocalFaction}
            onSelectFaction={setSelectedLocalFaction}
            onBack={() => {
              startTransition(() => {
                setScreen({ kind: "home" });
              });
            }}
            onStart={() => {
              startLocalMatch({
                faction: selectedLocalFaction,
                modeLabel: "Play vs AI",
              });
            }}
          />
        );
      case "multiplayer_setup":
        return (
          <MultiplayerSetupScreen
            snapshot={multiplayerSnapshot}
            onSetSelectedFaction={(faction) => multiplayerClient.setSelectedFaction(faction)}
            onSetSelectedFormat={(format) => multiplayerClient.setSelectedFormat(format)}
            onSetServerUrl={(serverUrl) => multiplayerClient.setServerUrl(serverUrl)}
            onFindMatch={handleFindMatch}
            onBack={handleBackFromMultiplayerSetup}
          />
        );
      case "multiplayer_queue":
        return <MultiplayerQueueScreen snapshot={multiplayerSnapshot} onCancel={handleCancelQueue} />;
      case "learn":
        return (
          <LearnScreen
            onBack={() => {
              startTransition(() => {
                setScreen({ kind: "home" });
              });
            }}
            onStartPracticeMatch={() => {
              startLocalMatch({
                faction: selectedLocalFaction,
                modeLabel: "Practice Match",
              });
            }}
          />
        );
      case "match":
        return (
          <MatchScreen
            menuOpen={matchMenuOpen}
            isNetworkMatch={activeMatch?.kind === "network" || multiplayerSnapshot.status === "in_match"}
            showDeveloperControls={SHOW_DIRECT_MATCH_DEVELOPER_CONTROLS}
            onOpenMenu={() => setMatchMenuOpen(true)}
            onCloseMenu={() => setMatchMenuOpen(false)}
            onReturnToMenu={handleReturnToMenuFromMatch}
            onQuitMatch={handleQuitMatch}
            onDisconnect={handleDisconnect}
          />
        );
      case "results":
        return (
          <ResultsScreen
            result={screen.result}
            onReturnHome={goHome}
            onPlayAgain={
              canPlayAgain
                ? () => {
                    startLocalMatch(canPlayAgain);
                  }
                : undefined
            }
          />
        );
      default:
        return null;
    }
  }, [
    activeMatch,
    callsignDraft,
    canPlayAgain,
    canPlayOnline,
    commitCallsign,
    goHome,
    handleBackFromMultiplayerSetup,
    handleCancelQueue,
    handleDisconnect,
    handleFindMatch,
    handleQuitMatch,
    handleReturnToMenuFromMatch,
    isEditingCallsign,
    lastFactionLabel,
    matchMenuOpen,
    multiplayerClient,
    multiplayerSnapshot,
    profile,
    screen,
    selectedLocalFaction,
    showOnlineExperimental,
    startLocalMatch,
    lastReplayableLocalConfig,
  ]);

  return screenNode;
}

export default App;
