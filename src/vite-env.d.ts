/// <reference types="vite/client" />

interface Window {
  electron: {
    versions: Record<string, string>;
  };
}
