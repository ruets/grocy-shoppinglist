/**
 * Integration test of the API client against a TEST Grocy instance.
 *
 *   GROCY_URL=https://grocy-test.lan GROCY_API_KEY=xxx npm run test:api
 *
 * Optional variables: GROCY_SHOPPING_LIST_ID (defaults to the first list),
 * GROCY_APPLY_FIXES=1 to let the script create the app's userfields (otherwise
 * they must already exist: open the app and tap « Réparer »).
 *
 * ⚠️ Creates a product "ZZ Test courses <timestamp>", a barcode, possibly
 * a shopping location "ZZ Magasin test", and adds stock. Only run it against a test instance.
 */
import { GrocyClient, productPresets, type StockEntry } from '../src/api/grocy';
import { runCheckout } from '../src/logic/checkout';
import { evaluateCheckup, pendingFixes } from '../src/logic/checkup';
import { addDays, NEVER_EXPIRES } from '../src/logic/dates';

const URL_ = process.env.GROCY_URL;
const KEY = process.env.GROCY_API_KEY;
if (!URL_ || !KEY) {
  console.error('Set GROCY_URL and GROCY_API_KEY (test Grocy instance).');
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

  console.log('1. Connection and metadata');
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
  check(lists.length > 0, `${lists.length} shopping list(s)`);

  console.log('1b. Checkup (userfields)');
  const checkupInput = async () => ({
    server: { ok: true as const, version: info.grocy_version?.Version ?? '' },
    lists,
    selectedListId: lists[0]?.id ?? null,
    userfields: await client.getUserfields(),
    locations,
    newProductLocationId: null,
    units: units.length,
  });
  let fixes = pendingFixes(evaluateCheckup(await checkupInput())).filter((f) => f.kind === 'createUserfields');
  if (fixes.length && process.env.GROCY_APPLY_FIXES === '1') {
    for (const f of fixes) if (f.kind === 'createUserfields') for (const uf of f.fields) await client.createUserfield(uf);
    fixes = pendingFixes(evaluateCheckup(await checkupInput())).filter((f) => f.kind === 'createUserfields');
  }
  check(fixes.length === 0, 'app userfields present (open the app and tap « Réparer », or GROCY_APPLY_FIXES=1)');
  if (fixes.length) process.exit(1);
  check(Array.isArray(products), `${products.length} active product(s)`);
  console.log(`  Currency: ${String(config.CURRENCY)}`);
  const listId = process.env.GROCY_SHOPPING_LIST_ID ? Number(process.env.GROCY_SHOPPING_LIST_ID) : lists[0].id;

  console.log('2. Reading the list');
  const before = await client.getShoppingLines(listId);
  check(Array.isArray(before), `${before.length} line(s) in list #${listId}`);

  console.log('3. Creating a test product + barcode');
  // Preferred location (« Emplacement des nouveaux produits »): the last one, so it differs from the preset when possible.
  const preferred = locations[locations.length - 1]?.id ?? null;
  const preset = productPresets(userSettings, locations, units);
  check(productPresets(userSettings, locations, units, -42).locationId === preset.locationId, 'unknown preferred location → Grocy preset');
  const { locationId, quId } = productPresets(userSettings, locations, units, preferred);
  check(locationId === preferred, `preferred location #${preferred} used`);
  if (locationId === null || quId === null) throw new Error('No location / quantity unit in Grocy');
  const stamp = Date.now();
  const name = `ZZ Test courses ${stamp}`;
  const productId = await client.createProduct({ name, locationId, quId });
  const barcode = `29${String(stamp).slice(-11)}`;
  await client.addBarcode(productId, barcode);
  const byBarcode = await client.getProductByBarcode(barcode);
  check(byBarcode?.product.id === productId, 'product found by barcode');
  check(byBarcode?.product.location_id === locationId, 'product created in the preferred location');
  const unknown = await client.getProductByBarcode('0000000000017');
  check(unknown === null, 'unknown barcode → null (no error)');

  let shopId = shoppingLocations[0]?.id ?? null;
  if (shopId === null) {
    shopId = Number((await rawPost('/objects/shopping_locations', { name: 'ZZ Magasin test' })).created_object_id);
  }

  console.log('4. Adding to the list');
  const lineId = await client.addShoppingLine({
    shopping_list_id: listId,
    product_id: productId,
    amount: 2,
    qu_id: quId,
    note: 'integration test',
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
  check(added && added.amount === 2 && !added.done && added.product_name === name, 'product line present (2, unchecked)');
  check(lines.some((l) => l.id === freeId && l.product_id === null), 'free-text line present');

  console.log('4b. Off-stock aisle (« Aisle (app) »)');
  const groups = await client.getProductGroups();
  if (groups.length) {
    await client.setLineFields(freeId, { aisleId: groups[0].id });
    let free = (await client.getShoppingLines(listId)).find((l) => l.id === freeId);
    check(free?.aisle_id === groups[0].id, `aisle set: ${free?.aisle_id} (expected ${groups[0].id})`);
    await client.setLineFields(freeId, { aisleId: null });
    free = (await client.getShoppingLines(listId)).find((l) => l.id === freeId);
    check(free?.aisle_id === null, 'aisle cleared');
  } else console.log('  (no product group in Grocy: skipped)');
  // Off-stock price is counted but never stocked.
  await client.setLineFields(freeId, { paidPrice: 3.5 });

  console.log('5. Checking off with a price');
  const price = 1.2345;
  const bestBefore = addDays(10);
  await client.updateShoppingLine(lineId, { done: true, amount: 3 });
  await client.setLineFields(lineId, { paidPrice: price, bestBefore });
  await client.updateShoppingLine(freeId, { done: true });
  // « Autre prix »: a second checked line of the same product.
  const price2 = 2.5;
  const bestBefore2 = addDays(20);
  const lineId2 = await client.addShoppingLine({
    shopping_list_id: listId,
    product_id: productId,
    amount: 1,
    qu_id: quId,
    note: '',
    done: true,
  });
  await client.setLineFields(lineId2, { paidPrice: price2, bestBefore: bestBefore2 });
  lines = await client.getShoppingLines(listId);
  const checkedLine = lines.find((l) => l.id === lineId);
  check(checkedLine?.done && checkedLine.amount === 3, 'line checked, amount 3');
  check(close(checkedLine?.paid_price, price) && checkedLine?.best_before === bestBefore, `userfields read back: ${checkedLine?.paid_price} / ${checkedLine?.best_before}`);
  check(lines.find((l) => l.id === lineId2)?.paid_price === price2, 'second price line read back');

  console.log('6. Checkout');
  const entriesBefore = await client.getStockEntries(productId);
  const ours = lines.filter((l) => [lineId, lineId2, freeId].includes(l.id)); // leave other checked lines alone
  const stocked = new Set<number>();
  const result = await runCheckout(ours, shopId, {
    client,
    isStocked: (id) => stocked.has(id),
    markStocked: async (id) => {
      stocked.add(id);
    },
    clearStocked: async () => {}, // keep markers: step 7 re-runs on the same lines
  });
  check(result.errors.length === 0, `checkout without errors ${result.errors.map((e) => e.message).join(' | ')}`);
  check(stocked.has(lineId) && stocked.has(lineId2), 'stocked markers set');

  const entriesAfter = await client.getStockEntries(productId);
  const newEntries: StockEntry[] = entriesAfter.filter((e) => !entriesBefore.some((b) => b.id === e.id));
  const qty = newEntries.reduce((s, e) => s + e.amount, 0);
  check(close(qty, 4), `stock added: ${qty} (expected 4)`);
  const first = newEntries.filter((e) => e.best_before_date === bestBefore);
  const second = newEntries.filter((e) => e.best_before_date === bestBefore2);
  check(close(first.reduce((s, e) => s + e.amount, 0), 3) && first.every((e) => close(e.price, price)), `first line: 3 at ${price} until ${bestBefore}`);
  check(close(second.reduce((s, e) => s + e.amount, 0), 1) && second.every((e) => close(e.price, price2)), `second line: 1 at ${price2} until ${bestBefore2}`);
  check(newEntries.length > 0 && newEntries.every((e) => e.shopping_location_id === shopId), `shopping location ${newEntries.map((e) => e.shopping_location_id)} (expected ${shopId})`);

  lines = await client.getShoppingLines(listId);
  check(!lines.some((l) => l.id === lineId || l.id === lineId2), 'product lines removed from the list');
  check(!lines.some((l) => l.id === freeId), 'free-text line removed from the list');

  console.log('7. Idempotent re-checkout (stocked)');
  const again = await runCheckout([{ ...checkedLine!, done: true }], shopId, {
    client,
    isStocked: (id) => stocked.has(id),
    markStocked: async () => {},
    clearStocked: async () => {},
  });
  const entriesFinal = await client.getStockEntries(productId);
  check(entriesFinal.length === entriesAfter.length, 'no double stock entry');
  check(again.errors.length === 1, 'deleting an already deleted line → per-item error reported');

  console.log('8. Never expires (2999-12-31)');
  const beforeNever = await client.getStockEntries(productId);
  await client.purchase(productId, { amount: 1, bestBeforeDate: NEVER_EXPIRES, shoppingLocationId: shopId });
  const neverEntries = (await client.getStockEntries(productId)).filter((e) => !beforeNever.some((b) => b.id === e.id));
  check(neverEntries.length === 1 && neverEntries[0].best_before_date === NEVER_EXPIRES, `best-before ${neverEntries.map((e) => e.best_before_date)} (expected ${NEVER_EXPIRES})`);

  console.log(failures ? `\n✗ ${failures} check(s) failed` : '\n✓ All good');
  console.log(`(Test product left in Grocy: "${name}", id ${productId})`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error('Error:', e?.message ?? e);
  process.exit(1);
});
