import * as SecureStore from 'expo-secure-store';

export interface AppSettings {
  url: string;
  apiKey: string;
  shoppingListId: number | null;
  /** « Emplacement des nouveaux produits »; null = Grocy preset. */
  newProductLocationId: number | null;
}

const K_URL = 'grocy_url';
const K_KEY = 'grocy_api_key';
const K_LIST = 'grocy_shopping_list_id';
const K_NEW_LOC = 'grocy_new_product_location_id';

export async function loadSettings(): Promise<AppSettings> {
  const [url, apiKey, list, newLoc] = await Promise.all([
    SecureStore.getItemAsync(K_URL),
    SecureStore.getItemAsync(K_KEY),
    SecureStore.getItemAsync(K_LIST),
    SecureStore.getItemAsync(K_NEW_LOC),
  ]);
  const listId = list ? Number(list) : NaN;
  const newLocId = newLoc ? Number(newLoc) : NaN;
  // Development only: prefill from the environment when nothing is saved
  // (e.g. simulator without copy-paste). Never set these variables for a distributed build.
  const devUrl = __DEV__ ? process.env.EXPO_PUBLIC_GROCY_URL : undefined;
  const devKey = __DEV__ ? process.env.EXPO_PUBLIC_GROCY_API_KEY : undefined;
  return {
    url: url || devUrl || '',
    apiKey: apiKey || devKey || '',
    shoppingListId: Number.isFinite(listId) ? listId : null,
    newProductLocationId: Number.isFinite(newLocId) ? newLocId : null,
  };
}

export async function saveSettings(s: AppSettings): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(K_URL, s.url),
    SecureStore.setItemAsync(K_KEY, s.apiKey),
    s.shoppingListId !== null
      ? SecureStore.setItemAsync(K_LIST, String(s.shoppingListId))
      : SecureStore.deleteItemAsync(K_LIST),
    s.newProductLocationId !== null
      ? SecureStore.setItemAsync(K_NEW_LOC, String(s.newProductLocationId))
      : SecureStore.deleteItemAsync(K_NEW_LOC),
  ]);
}
