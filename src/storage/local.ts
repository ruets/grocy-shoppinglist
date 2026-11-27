import AsyncStorage from '@react-native-async-storage/async-storage';
/** Line id → timestamp (ms) of the stock add, so a failed deletion never adds stock twice. */
export type StockedMap = Record<number, number>;

const K_STOCKED = 'stocked_lines_v1';
/** v1.0.0 stored prices/dates locally; now in Grocy userfields (not migrated). */
const K_LEGACY_LINES = 'line_local_data_v1';
const K_LAST_LOCATION = 'last_shopping_location_id';
const KEEP_MS = 7 * 86_400_000;

export async function loadStocked(): Promise<StockedMap> {
  try {
    const raw = await AsyncStorage.getItem(K_STOCKED);
    return raw ? (JSON.parse(raw) as StockedMap) : {};
  } catch {
    return {};
  }
}

export async function saveStocked(map: StockedMap): Promise<void> {
  await AsyncStorage.setItem(K_STOCKED, JSON.stringify(map));
}

/** Drops markers older than 7 days (the line is long gone by then). */
export function pruneStocked(map: StockedMap, now = Date.now()): StockedMap {
  const out: StockedMap = {};
  for (const [k, t] of Object.entries(map)) if (now - t < KEEP_MS) out[Number(k)] = t;
  return out;
}

export async function clearLegacyLineData(): Promise<void> {
  await AsyncStorage.removeItem(K_LEGACY_LINES);
}

export async function loadLastShoppingLocation(): Promise<number | null> {
  const v = await AsyncStorage.getItem(K_LAST_LOCATION);
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

export async function saveLastShoppingLocation(id: number | null): Promise<void> {
  if (id === null) await AsyncStorage.removeItem(K_LAST_LOCATION);
  else await AsyncStorage.setItem(K_LAST_LOCATION, String(id));
}
