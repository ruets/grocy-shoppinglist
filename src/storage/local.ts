import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LineLocalData } from '../logic/checkout';

export interface StoredLineData extends LineLocalData {
  /** Last-modified timestamp (ms), used for cleanup. */
  updatedAt: number;
}

export type StoredLineMap = Record<number, StoredLineData>;

const K_LINES = 'line_local_data_v1';
const K_LAST_LOCATION = 'last_shopping_location_id';

export async function loadLineData(): Promise<StoredLineMap> {
  try {
    const raw = await AsyncStorage.getItem(K_LINES);
    return raw ? (JSON.parse(raw) as StoredLineMap) : {};
  } catch {
    return {};
  }
}

export async function saveLineData(map: StoredLineMap): Promise<void> {
  await AsyncStorage.setItem(K_LINES, JSON.stringify(map));
}

/**
 * Drops entries for lines that no longer exist. Very recent entries are
 * kept to avoid racing with an in-flight refresh.
 */
export function pruneLineData(map: StoredLineMap, existingIds: Set<number>, now = Date.now()): StoredLineMap {
  const out: StoredLineMap = {};
  for (const [k, v] of Object.entries(map)) {
    const id = Number(k);
    if (existingIds.has(id) || now - (v.updatedAt ?? 0) < 60_000) out[id] = v;
  }
  return out;
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
