import * as SecureStore from 'expo-secure-store';

export interface AppSettings {
  url: string;
  apiKey: string;
  shoppingListId: number | null;
}

const K_URL = 'grocy_url';
const K_KEY = 'grocy_api_key';
const K_LIST = 'grocy_shopping_list_id';

export async function loadSettings(): Promise<AppSettings> {
  const [url, apiKey, list] = await Promise.all([
    SecureStore.getItemAsync(K_URL),
    SecureStore.getItemAsync(K_KEY),
    SecureStore.getItemAsync(K_LIST),
  ]);
  const listId = list ? Number(list) : NaN;
  return { url: url ?? '', apiKey: apiKey ?? '', shoppingListId: Number.isFinite(listId) ? listId : null };
}

export async function saveSettings(s: AppSettings): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(K_URL, s.url),
    SecureStore.setItemAsync(K_KEY, s.apiKey),
    s.shoppingListId !== null
      ? SecureStore.setItemAsync(K_LIST, String(s.shoppingListId))
      : SecureStore.deleteItemAsync(K_LIST),
  ]);
}
