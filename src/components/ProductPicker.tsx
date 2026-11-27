import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { pickerSections } from '../logic/picker';
import { useStore } from '../store/useStore';
import { sizes, useColors } from '../theme';
import { BigButton, Field, SectionLabel } from './ui';

/**
 * Grocy products grouped by aisle (empty search) or accent-insensitive search,
 * with « create in Grocy » and, when onOffStock is given, « add off-stock ».
 */
export function ProductPicker(props: {
  productId: number | null;
  onChange: (id: number | null) => void;
  /** Offers « Ajouter … hors stock » for a name not found (item editor). */
  onOffStock?: (name: string) => void;
}) {
  const c = useColors();
  const meta = useStore((s) => s.meta);
  const createProduct = useStore((s) => s.createProduct);
  const showToast = useStore((s) => s.showToast);
  const [query, setQuery] = React.useState('');
  const [creating, setCreating] = React.useState(false);

  const products = meta?.products ?? [];
  const selected = props.productId !== null ? meta?.productsById.get(props.productId) : undefined;
  const groups = meta?.productGroups;
  const sections = React.useMemo(() => pickerSections(products, query, groups ?? []), [products, query, groups]);
  const exact = products.some((p) => p.name.trim().toLowerCase() === query.trim().toLowerCase());

  if (selected) {
    return (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: c.card,
          borderColor: c.primary,
          borderWidth: 2,
          borderRadius: sizes.radius,
          padding: 12,
          marginBottom: 14,
        }}
      >
        <Text style={{ flex: 1, fontSize: sizes.font, fontWeight: '700', color: c.text }}>{selected.name}</Text>
        <BigButton title="Changer" variant="ghost" compact onPress={() => props.onChange(null)} />
      </View>
    );
  }

  const create = async () => {
    const name = query.trim();
    if (!name) return;
    setCreating(true);
    try {
      const id = await createProduct(name);
      showToast(`Produit « ${name} » créé dans Grocy`, 'success');
      setQuery('');
      props.onChange(id);
    } catch {
      // toast already shown
    } finally {
      setCreating(false);
    }
  };

  return (
    <View style={{ marginBottom: 6 }}>
      <Field
        label="Produit Grocy"
        placeholder="Rechercher (ex. « pates », « creme »)"
        value={query}
        onChangeText={setQuery}
        autoCorrect={false}
        hint="Introuvable ? Tapez son nom : vous pourrez le créer."
      />
      {query.trim() && !exact ? (
        <View style={{ gap: 8, marginBottom: 12 }}>
          <BigButton
            title={`＋ Créer « ${query.trim()} » dans Grocy`}
            variant="secondary"
            loading={creating}
            onPress={create}
          />
          {props.onOffStock ? (
            <BigButton
              title={`＋ Ajouter « ${query.trim()} » hors stock`}
              variant="secondary"
              onPress={() => props.onOffStock!(query.trim().replace(/\s+/g, ' '))}
            />
          ) : null}
        </View>
      ) : null}
      {sections.map((section) => (
        <View key={section.title ?? 'results'} style={{ marginBottom: 8 }}>
          {section.title ? <SectionLabel>{section.title}</SectionLabel> : null}
          {section.data.map((p) => (
        <Pressable
          key={p.id}
          onPress={() => {
            props.onChange(p.id);
            setQuery('');
          }}
          style={({ pressed }) => ({
            minHeight: 52,
            justifyContent: 'center',
            paddingHorizontal: 14,
            borderBottomWidth: 1,
            borderBottomColor: c.border,
            backgroundColor: pressed ? c.done : c.card,
          })}
        >
          <Text style={{ fontSize: sizes.font, color: c.text }}>{p.name}</Text>
        </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}
