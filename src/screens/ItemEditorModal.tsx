import React from 'react';
import { Alert, Text } from 'react-native';
import type { ShoppingLine } from '../api/grocy';
import { ProductPicker } from '../components/ProductPicker';
import { BigButton, Field, SectionLabel, Sheet, Stepper } from '../components/ui';
import { stockUnitName, useStore } from '../store/useStore';
import { useColors } from '../theme';

/** Ajout (line = null) ou modification d'un article. */
export function ItemEditorModal(props: { visible: boolean; line: ShoppingLine | null; onClose: () => void }) {
  const c = useColors();
  const meta = useStore((s) => s.meta);
  const addItem = useStore((s) => s.addItem);
  const updateItem = useStore((s) => s.updateItem);
  const deleteItem = useStore((s) => s.deleteItem);
  const [productId, setProductId] = React.useState<number | null>(null);
  const [amount, setAmount] = React.useState(1);
  const [note, setNote] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!props.visible) return;
    setProductId(props.line?.product_id ?? null);
    setAmount(props.line?.amount && props.line.amount > 0 ? props.line.amount : 1);
    setNote(props.line?.note ?? '');
  }, [props.visible, props.line]);

  const free = productId === null;
  const canSave = free ? note.trim().length > 0 : amount > 0;

  const save = async () => {
    setSaving(true);
    try {
      const payload = { productId, amount: free ? 1 : amount, note: note.trim() };
      if (props.line) await updateItem(props.line.id, payload);
      else await addItem(payload);
      props.onClose();
    } catch {
      // toast affiché par le store
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
      <ProductPicker productId={productId} onChange={setProductId} />
      {!free ? (
        <>
          <SectionLabel>Quantité</SectionLabel>
          <Stepper value={amount} onChange={setAmount} min={0} unit={stockUnitName(meta, productId, amount)} />
        </>
      ) : null}
      <Field
        label={free ? 'Texte libre (obligatoire)' : 'Note'}
        placeholder={free ? 'ex. « Fleurs pour mamie »' : 'Optionnel'}
        value={note}
        onChangeText={setNote}
        style={{ marginTop: 0 }}
        multiline
      />
      {free ? (
        <Text style={{ color: c.muted, fontSize: 14 }}>
          Aucun produit choisi : l’article sera enregistré en texte libre et simplement supprimé à la validation.
        </Text>
      ) : null}
    </Sheet>
  );
}
