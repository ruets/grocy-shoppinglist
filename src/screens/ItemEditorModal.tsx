import React from 'react';
import { Alert, Text, View } from 'react-native';
import type { ShoppingLine } from '../api/grocy';
import { ProductPicker } from '../components/ProductPicker';
import { BigButton, Chip, Field, SectionLabel, Sheet, Stepper } from '../components/ui';
import { stockUnitName, useStore } from '../store/useStore';
import { sizes, useColors } from '../theme';

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
    Alert.alert('Supprimer l’article ?', 'La ligne sera retirée de la liste Grocy.', [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
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

  const groups = [...(meta?.productGroups ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const showQuantity = offStock !== null || productId !== null;

  return (
    <Sheet
      visible={props.visible}
      title={props.line ? 'Modifier l’article' : 'Ajouter un article'}
      onClose={props.onClose}
      footer={
        <>
          <BigButton
            title={props.line ? 'Enregistrer' : 'Ajouter à la liste'}
            onPress={save}
            loading={saving}
            disabled={!canSave}
          />
          {props.line ? <BigButton title="Supprimer" variant="danger" onPress={remove} /> : null}
        </>
      }
    >
      {offStock ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ flex: 1, fontSize: 15, fontWeight: '700', color: c.warn }}>
              Hors stock : n’entre pas dans le stock Grocy
            </Text>
            <BigButton
              title="Produit Grocy"
              variant="ghost"
              compact
              onPress={() => {
                setOffStock(null);
                setProductId(null);
              }}
            />
          </View>
          <Field
            label="Nom"
            placeholder="ex. « Bonbons »"
            value={offStock.name}
            onChangeText={(t) => setOffStock({ ...offStock, name: t.replace(/\n/g, ' ') })}
          />
          <SectionLabel>Rayon</SectionLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: sizes.pad }}>
            <Chip
              label="Aucun"
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
          <SectionLabel>Quantité</SectionLabel>
          <Stepper
            value={amount}
            onChange={setAmount}
            min={0}
            unit={offStock ? (amount > 1 ? 'unités' : 'unité') : stockUnitName(meta, productId, amount)}
          />
        </>
      ) : null}
      {!offStock && productId !== null ? (
        <Field label="Note" placeholder="Optionnel" value={note} onChangeText={setNote} multiline />
      ) : null}
    </Sheet>
  );
}
