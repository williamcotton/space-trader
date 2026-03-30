const mechanicApis = new Map<string, unknown>();

export function registerMechanicApi<T extends object>(mechanicId: string, api: T): void {
  mechanicApis.set(mechanicId, api);
}

export function getMechanicApi<T>(mechanicId: string): T | undefined {
  const api = mechanicApis.get(mechanicId);
  return api as T | undefined;
}

export function getRegisteredMechanicApis(): Array<[string, unknown]> {
  return [...mechanicApis.entries()];
}

export function resetMechanicApiRegistry(): void {
  mechanicApis.clear();
}
