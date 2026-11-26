import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { Product } from '../api/grocy';
import { searchByName } from '../logic/text';
import { useStore } from '../store/useStore';
import { sizes, useColors } from '../theme';
import { BigButton, Field } from './ui';

/**
 * Accent-insensitive Grocy product search with a
 * "create the product in Grocy" option.
 */
export function ProductPicker(props: {
  productId: number | null;
  onChange: (id: number | null) => void;
  /** Show the free-text hint (item editor). */
  allowFreeText?: boolean;
}) {
  const c = useColors();
  const meta = useStore((s) => s.meta);
  const createProduct = useStore((s) => s.createProduct);
  const showToast = useStore((s) => s.showToast);
  const [query, setQuery] = React.useState('');
  const [creating, setCreating] = React.useState(false);

  const products = meta?.products ?? [];
  const selected = props.productId !== null ? meta?.productsById.get(props.productId) : undefined;
  const results = React.useMemo(() => searchByName<Product>(products, query, 12), [products, query]);
  const exact = results.some((p) => p.name.trim().toLowerCase() === query.trim().toLowerCase());

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
        hint={
          props.allowFreeText === false
            ? 'Introuvable ? Tapez son nom puis « Créer ».'
            : 'Sans produit, l’article sera en « texte libre » (note seule).'
        }
      />
      {results.map((p) => (
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
      {query.trim() && !exact ? (
        <BigButton
          title={`＋ Créer « ${query.trim()} » dans Grocy`}
          variant="secondary"
          loading={creating}
          onPress={create}
          style={{ marginTop: 10 }}
        />
      ) : null}
    </View>
  );
}
