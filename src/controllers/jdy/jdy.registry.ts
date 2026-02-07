type Op = "data_create" | "data_update" | "data_remove";
export type JdyHandler = (data: any) => Promise<void> | void;

const registry = new Map<string, JdyHandler[]>();

const keyOf = (appId: string, entryId: string, op: Op) =>
  `${appId}::${entryId}::${op}`;

export function registerJdy(
  appId: string,
  entryId: string,
  op: Op,
  handler: JdyHandler
) {
  const key = keyOf(appId, entryId, op);
  const list = registry.get(key) ?? [];
  registry.set(key, [...list, handler]);
}

export function getHandlers(appId: string, entryId: string, op: Op) {
  return registry.get(keyOf(appId, entryId, op)) ?? [];
}
