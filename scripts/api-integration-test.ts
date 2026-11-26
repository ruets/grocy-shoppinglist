/**
 * Test d'intégration du client API contre un Grocy DE TEST.
 *
 *   GROCY_URL=https://grocy-test.lan GROCY_API_KEY=xxx npm run test:api
 *
 * Variables optionnelles : GROCY_SHOPPING_LIST_ID (sinon la première liste).
 *
 * ⚠️ Crée un produit « ZZ Test courses <horodatage> », un code-barres, éventuellement
 * un magasin « ZZ Magasin test », et ajoute du stock. À n'utiliser que sur une instance de test.
 */
import { GrocyClient, productPresets, type StockEntry } from '../src/api/grocy';
import { runCheckout, type LocalDataMap } from '../src/logic/checkout';
import { addDays, NEVER_EXPIRES } from '../src/logic/dates';

const URL_ = process.env.GROCY_URL;
const KEY = process.env.GROCY_API_KEY;
if (!URL_ || !KEY) {
  console.error('Définir GROCY_URL et GROCY_API_KEY (instance Grocy de test).');
  process.exit(2);
}

let failures = 0;
function check(cond: unknown, label: string) {
  if (cond) console.log(`  ✓ ${label}`);
  else {
    failures += 1;
    console.log(`  ✗ ${label}`);
  }
}
const close = (a: number | null | undefined, b: number) => a !== null && a !== undefined && Math.abs(a - b) < 1e-4;

async function rawPost(path: string, body: unknown): Promise<any> {
  const base = URL_!.replace(/\/+$/, '').replace(/\/api$/, '');
  const res = await fetch(`${base}/api${path}`, {
    method: 'POST',
    headers: { 'GROCY-API-KEY': KEY!, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`POST ${path} → ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  const client = new GrocyClient(URL_!, KEY!);

  console.log('1. Connexion et métadonnées');
  const info = await client.getSystemInfo();
  console.log(`  Grocy ${info.grocy_version?.Version ?? '?'}`);
  const [lists, products, units, locations, shoppingLocations, userSettings, config] = await Promise.all([
    client.getShoppingLists(),
    client.getProducts(),
    client.getQuantityUnits(),
    client.getLocations(),
    client.getShoppingLocations(),
    client.getUserSettings(),
    client.getSystemConfig(),
  ]);
  check(lists.length > 0, `${lists.length} liste(s) de courses`);
  check(Array.isArray(products), `${products.length} produit(s) actif(s)`);
  console.log(`  Devise : ${String(config.CURRENCY)}`);
  const listId = process.env.GROCY_SHOPPING_LIST_ID ? Number(process.env.GROCY_SHOPPING_LIST_ID) : lists[0].id;

  console.log('2. Lecture de la liste');
  const before = await client.getShoppingLines(listId);
  check(Array.isArray(before), `${before.length} ligne(s) dans la liste #${listId}`);

  console.log('3. Création d’un produit de test + code-barres');
  const { locationId, quId } = productPresets(userSettings, locations, units);
  if (locationId === null || quId === null) throw new Error('Aucun emplacement / unité dans Grocy');
  const stamp = Date.now();
  const name = `ZZ Test courses ${stamp}`;
  const productId = await client.createProduct({ name, locationId, quId });
  const barcode = `29${String(stamp).slice(-11)}`;
  await client.addBarcode(productId, barcode);
  const byBarcode = await client.getProductByBarcode(barcode);
  check(byBarcode?.product.id === productId, 'produit retrouvé par code-barres');
  const unknown = await client.getProductByBarcode('0000000000017');
  check(unknown === null, 'code-barres inconnu → null (pas d’erreur)');

  let shopId = shoppingLocations[0]?.id ?? null;
  if (shopId === null) {
    shopId = Number((await rawPost('/objects/shopping_locations', { name: 'ZZ Magasin test' })).created_object_id);
  }

  console.log('4. Ajout à la liste');
  const lineId = await client.addShoppingLine({
    shopping_list_id: listId,
    product_id: productId,
    amount: 2,
    qu_id: quId,
    note: 'test intégration',
    done: false,
  });
  const freeId = await client.addShoppingLine({
    shopping_list_id: listId,
    product_id: null,
    amount: 1,
    qu_id: null,
    note: `ZZ texte libre ${stamp}`,
    done: false,
  });
  let lines = await client.getShoppingLines(listId);
  const added = lines.find((l) => l.id === lineId);
  check(added && added.amount === 2 && !added.done && added.product_name === name, 'ligne produit présente (2, non cochée)');
  check(lines.some((l) => l.id === freeId && l.product_id === null), 'ligne texte libre présente');

  console.log('5. Cochage avec prix');
  const price = 1.2345;
  const bestBefore = addDays(10);
  await client.updateShoppingLine(lineId, { done: true, amount: 3 });
  await client.updateShoppingLine(freeId, { done: true });
  const local: LocalDataMap = { [lineId]: { paidUnitPrice: price, bestBefore } };
  lines = await client.getShoppingLines(listId);
  const checkedLine = lines.find((l) => l.id === lineId);
  check(checkedLine?.done && checkedLine.amount === 3, 'ligne cochée, quantité 3');

  console.log('6. Validation des achats');
  const entriesBefore = await client.getStockEntries(productId);
  const ours = lines.filter((l) => l.id === lineId || l.id === freeId); // ne touche pas aux autres lignes cochées
  const result = await runCheckout(ours, shopId, {
    client,
    getLocal: (id) => local[id],
    patchLocal: async (id, p) => {
      local[id] = { ...local[id], ...p };
    },
  });
  check(result.errors.length === 0, `validation sans erreur ${result.errors.map((e) => e.message).join(' | ')}`);
  check(local[lineId]?.stocked === true, 'flag stocked posé');

  const entriesAfter = await client.getStockEntries(productId);
  const newEntries: StockEntry[] = entriesAfter.filter((e) => !entriesBefore.some((b) => b.id === e.id));
  const qty = newEntries.reduce((s, e) => s + e.amount, 0);
  check(close(qty, 3), `stock ajouté : ${qty} (attendu 3)`);
  check(newEntries.length > 0 && newEntries.every((e) => close(e.price, price)), `prix ${newEntries.map((e) => e.price)} (attendu ${price})`);
  check(newEntries.length > 0 && newEntries.every((e) => e.best_before_date === bestBefore), `DLC ${newEntries.map((e) => e.best_before_date)} (attendu ${bestBefore})`);
  check(newEntries.length > 0 && newEntries.every((e) => e.shopping_location_id === shopId), `magasin ${newEntries.map((e) => e.shopping_location_id)} (attendu ${shopId})`);

  lines = await client.getShoppingLines(listId);
  check(!lines.some((l) => l.id === lineId), 'ligne produit supprimée de la liste');
  check(!lines.some((l) => l.id === freeId), 'ligne texte libre supprimée de la liste');

  console.log('7. Revalidation idempotente (stocked)');
  const again = await runCheckout([{ ...checkedLine!, done: true }], shopId, {
    client,
    getLocal: (id) => local[id],
    patchLocal: async () => {},
  });
  const entriesFinal = await client.getStockEntries(productId);
  check(entriesFinal.length === entriesAfter.length, 'pas de double ajout au stock');
  check(again.errors.length === 1, 'suppression d’une ligne déjà supprimée → erreur remontée par article');

  console.log('8. « Ne périme pas » (2999-12-31)');
  const beforeNever = await client.getStockEntries(productId);
  await client.purchase(productId, { amount: 1, bestBeforeDate: NEVER_EXPIRES, shoppingLocationId: shopId });
  const neverEntries = (await client.getStockEntries(productId)).filter((e) => !beforeNever.some((b) => b.id === e.id));
  check(neverEntries.length === 1 && neverEntries[0].best_before_date === NEVER_EXPIRES, `DLC ${neverEntries.map((e) => e.best_before_date)} (attendu ${NEVER_EXPIRES})`);

  console.log(failures ? `\n✗ ${failures} vérification(s) en échec` : '\n✓ Tout est OK');
  console.log(`(Produit de test laissé dans Grocy : « ${name} », id ${productId})`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error('Erreur :', e?.message ?? e);
  process.exit(1);
});
