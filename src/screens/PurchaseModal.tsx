import React from 'react';
import { Text, View } from 'react-native';
import type { ShoppingLine } from '../api/grocy';
import { BestBeforeInput, bestBeforeToText, parseBestBeforeText } from '../components/BestBeforeInput';
import { BigButton, Field, SectionLabel, Sheet, Stepper } from '../components/ui';
import { lineLabel } from '../logic/grouping';
import { effectiveTotal, effectiveUnitPrice, initPriceLink, priceLinkReducer } from '../logic/priceLink';
import { stockUnitName, useStore } from '../store/useStore';
import { useColors } from '../theme';

export type PurchaseTarget =
  | { kind: 'line'; line: ShoppingLine; amount: number }
  | { kind: 'offList'; productId: number; amount: number; lastPrice: number | null };

/** Add to cart: amount, unit price ↔ total, optional best-before date. */
export function PurchaseModal(props: { target: PurchaseTarget | null; onClose: () => void }) {
  const c = useColors();
  const meta = useStore((s) => s.meta);
  const money = useStore((s) => s.money);
  const markPurchased = useStore((s) => s.markPurchased);
  const unmark = useStore((s) => s.unmark);
  const purchaseOffList = useStore((s) => s.purchaseOffList);
  const addPriceLine = useStore((s) => s.addPriceLine);

  // « Autre prix » switches the modal to the newly created line.
  // Tied to the target it was made from, so a new target drops it.
  const [override, setOverrideFor] = React.useState<{ from: PurchaseTarget | null; t: PurchaseTarget } | null>(null);
  const setOverride = (next: PurchaseTarget) => setOverrideFor({ from: props.target, t: next });
  const t = override && override.from === props.target ? override.t : props.target;
  const productId = t ? (t.kind === 'line' ? t.line.product_id : t.productId) : null;
  const free = t?.kind === 'line' && t.line.product_id === null;

  const [price, dispatch] = React.useReducer(priceLinkReducer, initPriceLink(1, null));
  const [dateText, setDateText] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  // (Re)initialize on open
  React.useEffect(() => {
    if (!t) return;
    let unit: number | null = null;
    let bb: string | null = null;
    if (t.kind === 'line') {
      unit = t.line.paid_price ?? t.line.last_price;
      bb = t.line.best_before;
    } else {
      unit = t.lastPrice;
    }
    dispatch({ type: 'reset', state: initPriceLink(t.amount, unit) });
    setDateText(bestBeforeToText(bb));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t]);

  if (!t) return <Sheet visible={false} title="" onClose={props.onClose}>{null}</Sheet>;

  const title =
    t.kind === 'line'
      ? lineLabel(t.line)
      : (meta?.productsById.get(t.productId)?.name ?? `Produit #${t.productId}`);
  const unitName = stockUnitName(meta, productId, price.qty);
  const parsedRaw = parseBestBeforeText(dateText);
  const dateInvalid = parsedRaw === 'invalid';
  const parsedDate = dateInvalid ? null : parsedRaw;
  const total = effectiveTotal(price);
  const alreadyDone = t.kind === 'line' && t.line.done;

  const confirm = async () => {
    setSaving(true);
    try {
      const input = {
        amount: free ? 1 : price.qty,
        unitPrice: free ? null : effectiveUnitPrice(price),
        bestBefore: parsedDate,
      };
      if (t.kind === 'line') await markPurchased(t.line.id, input);
      else await purchaseOffList(t.productId, input);
      props.onClose();
    } catch {
      /* toast */
    } finally {
      setSaving(false);
    }
  };

  /** Saves this line, then creates a second checked line of the same product at the same price. */
  const otherPrice = async () => {
    if (t.kind !== 'line') return;
    setSaving(true);
    try {
      const unitPrice = effectiveUnitPrice(price);
      await markPurchased(t.line.id, { amount: price.qty, unitPrice, bestBefore: parsedDate });
      const id = await addPriceLine(t.line.id, { amount: 1, unitPrice, bestBefore: null });
      const line = useStore.getState().lines.find((l) => l.id === id);
      if (line) setOverride({ kind: 'line', line, amount: 1 });
      else props.onClose();
    } catch {
      /* toast */
    } finally {
      setSaving(false);
    }
  };

  const removeFromCart = async () => {
    if (t.kind !== 'line') return;
    setSaving(true);
    try {
      await unmark(t.line.id);
      props.onClose();
    } catch {
      /* toast */
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible
      title={`${t.kind === 'offList' ? 'Hors liste · ' : ''}${title}`}
      onClose={props.onClose}
      footer={
        <>
          <BigButton
            title={
              (alreadyDone ? 'Mettre à jour' : 'Mettre dans le panier') +
              (total !== null && !free ? ` · ${money(total)}` : '')
            }
            onPress={confirm}
            loading={saving}
            disabled={(!free && !(price.qty > 0)) || dateInvalid}
          />
          {t.kind === 'line' && !free ? (
            <BigButton
              title="＋ Autre prix"
              variant="secondary"
              onPress={otherPrice}
              disabled={saving || !(price.qty > 0) || dateInvalid}
            />
          ) : null}
          {alreadyDone ? (
            <BigButton title="Retirer du panier" variant="secondary" onPress={removeFromCart} disabled={saving} />
          ) : null}
        </>
      }
    >
      {t.kind === 'offList' ? (
        <Text style={{ color: c.warn, fontSize: 15, marginBottom: 12, fontWeight: '600' }}>
          Ce produit n’est pas sur la liste : il y sera ajouté, déjà coché, à la validation.
        </Text>
      ) : null}

      {free ? (
        <Text style={{ color: c.muted, fontSize: 16, marginBottom: 12 }}>
          Article texte libre : il sera simplement retiré de la liste à la validation des achats.
        </Text>
      ) : (
        <>
          <SectionLabel>Quantité</SectionLabel>
          <Stepper value={price.qty} onChange={(q) => dispatch({ type: 'qty', qty: q })} min={0} unit={unitName} />

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 20 }}>
            <View style={{ flex: 1 }}>
              <Field
                label={`Prix / ${stockUnitName(meta, productId, 1) || 'unité'}`}
                value={price.unitText}
                onChangeText={(text) => dispatch({ type: 'unit', text })}
                keyboardType="decimal-pad"
                placeholder="0,00"
                selectTextOnFocus
                style={price.anchor === 'unit' ? { borderColor: c.primary, borderWidth: 2 } : undefined}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Field
                label="Total ligne"
                value={price.totalText}
                onChangeText={(text) => dispatch({ type: 'total', text })}
                keyboardType="decimal-pad"
                placeholder="0,00"
                selectTextOnFocus
                style={price.anchor === 'total' ? { borderColor: c.primary, borderWidth: 2 } : undefined}
              />
            </View>
          </View>
          {t.kind === 'line' && t.line.last_price !== null ? (
            <Text style={{ color: c.muted, marginTop: -6, marginBottom: 14 }}>
              Dernier prix connu : {money(t.line.last_price)} / {stockUnitName(meta, productId, 1) || 'unité'}
            </Text>
          ) : null}

          <BestBeforeInput
            productId={productId}
            text={dateText}
            onChangeText={setDateText}
            label="Date de péremption (facultative ici)"
            placeholder="JJMM — à remplir plus tard si besoin"
            allowEmpty
          />
        </>
      )}
    </Sheet>
  );
}
