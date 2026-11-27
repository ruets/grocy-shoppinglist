import React from 'react';
import { Alert, Text, View } from 'react-native';
import type { ShoppingLine } from '../api/grocy';
import { ProductPicker } from '../components/ProductPicker';
import { BigButton, Chip, Field, SectionLabel, Sheet, Stepper } from '../components/ui';
import { stockUnitName, useStore } from '../store/useStore';
import { sizes, useColors } from '../theme';
import { locale, t } from '../i18n';

/** Off-stock item: exists only on the list (free-text line), never in Grocy's stock. */
interface OffStock {
  name: string;
  aisleId: number | null;
}

/** Add (line = null) or edit an item: a Grocy product or an off-stock item. */
export function ItemEditorModal(props: { visible: boolean; line: ShoppingLine | null; onClose: () => void }) {
  const c = useColors();
  const meta = useStore((s) => s.meta);
  const addItem = useStore((s) => s.addItem);
  const updateItem = useStore((s) => s.updateItem);
  const deleteItem = useStore((s) => s.deleteItem);
  const [productId, setProductId] = React.useState<number | null>(null);
  const [offStock, setOffStock] = React.useState<OffStock | null>(null);
  const [amount, setAmount] = React.useState(1);
  const [note, setNote] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!props.visible) return;
    const l = props.line;
    setProductId(l?.product_id ?? null);
    setOffStock(l && l.product_id === null ? { name: l.note, aisleId: l.aisle_id } : null);
    setAmount(l?.amount && l.amount > 0 ? l.amount : 1);
    setNote(l && l.product_id !== null ? l.note : '');
  }, [props.visible, props.line]);

  const name = offStock?.name.replace(/\s+/g, ' ').trim() ?? '';
  const canSave = amount > 0 && (offStock ? name.length > 0 : productId !== null);

  const save = async () => {
    setSaving(true);
    try {
      const payload = offStock
        ? { productId: null, amount, note: name, aisleId: offStock.aisleId }
        : { productId, amount, note: note.trim() };
      if (props.line) await updateItem(props.line.id, payload);
      else await addItem(payload);
      props.onClose();
    } catch {
      // toast shown by the store
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    if (!props.line) return;
    Alert.alert(t().editor.deleteTitle, t().editor.deleteMessage, [
      { text: t().common.cancel, style: 'cancel' },
      {
        text: t().common.delete,
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteItem(props.line!.id);
            props.onClose();
          } catch {
            /* toast */
          }
        },
      },
    ]);
  };

  const groups = [...(meta?.productGroups ?? [])].sort((a, b) => a.name.localeCompare(b.name, locale()));
  const showQuantity = offStock !== null || productId !== null;

  return (
    <Sheet
      visible={props.visible}
      title={props.line ? t().editor.editTitle : t().editor.addTitle}
      onClose={props.onClose}
      footer={
        <>
          <BigButton
            title={props.line ? t().common.save : t().editor.addToList}
            onPress={save}
            loading={saving}
            disabled={!canSave}
          />
          {props.line ? <BigButton title={t().common.delete} variant="danger" onPress={remove} /> : null}
        </>
      }
    >
      {offStock ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: c.warn }}>
              {t().editor.offStockBanner}
            </Text>
            <BigButton
              title={t().editor.grocyProduct}
              variant="ghost"
              compact
              onPress={() => {
                setOffStock(null);
                setProductId(null);
              }}
            />
          </View>
          <Field
            label={t().editor.name}
            placeholder={t().editor.namePlaceholder}
            value={offStock.name}
            onChangeText={(t) => setOffStock({ ...offStock, name: t.replace(/\n/g, ' ') })}
          />
          <SectionLabel>{t().editor.aisle}</SectionLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: sizes.pad }}>
            <Chip
              label={t().editor.noAisle}
              selected={offStock.aisleId === null}
              onPress={() => setOffStock({ ...offStock, aisleId: null })}
            />
            {groups.map((g) => (
              <Chip
                key={g.id}
                label={g.name}
                selected={offStock.aisleId === g.id}
                onPress={() => setOffStock({ ...offStock, aisleId: g.id })}
              />
            ))}
          </View>
        </>
      ) : (
        <ProductPicker
          productId={productId}
          onChange={setProductId}
          onOffStock={(n) => setOffStock({ name: n, aisleId: null })}
        />
      )}
      {showQuantity ? (
        <>
          <SectionLabel>{t().common.quantity}</SectionLabel>
          <Stepper
            value={amount}
            onChange={setAmount}
            min={0}
            unit={offStock ? t().common.units(amount) : stockUnitName(meta, productId, amount)}
          />
        </>
      ) : null}
      {!offStock && productId !== null ? (
        <Field label={t().editor.note} placeholder={t().editor.optional} value={note} onChangeText={setNote} multiline />
      ) : null}
    </Sheet>
  );
}
