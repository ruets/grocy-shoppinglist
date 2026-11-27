import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { ProductPicker } from '../components/ProductPicker';
import { BigButton, SectionLabel, Sheet } from '../components/ui';
import { useStore } from '../store/useStore';
import { sizes, useColors } from '../theme';
import { locale, t } from '../i18n';

/**
 * Barcode unknown to Grocy: associate it with an existing product
 * (unchecked list items first) or create a new product.
 */
export function UnknownBarcodeModal(props: {
  barcode: string | null;
  onClose: () => void;
  /** Barcode associated with the product: continue with the purchase modal. */
  onAssociated: (productId: number) => void;
}) {
  const c = useColors();
  const lines = useStore((s) => s.lines);
  const addBarcode = useStore((s) => s.addBarcode);
  const reloadProducts = useStore((s) => s.reloadProducts);
  const [productId, setProductId] = React.useState<number | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => setProductId(null), [props.barcode]);

  // Products of unchecked lines, deduplicated, sorted by name.
  const suggestions = React.useMemo(() => {
    const seen = new Map<number, string>();
    for (const l of lines) {
      if (!l.done && l.product_id !== null && !seen.has(l.product_id)) {
        seen.set(l.product_id, l.product_name ?? t().common.productN(l.product_id));
      }
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1], locale()));
  }, [lines]);

  const associate = async () => {
    if (!props.barcode || productId === null) return;
    setSaving(true);
    try {
      await addBarcode(productId, props.barcode);
      await reloadProducts();
      props.onAssociated(productId);
    } catch {
      /* toast shown by the store */
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible={props.barcode !== null}
      title={t().unknownBarcode.title}
      onClose={props.onClose}
      footer={
        <BigButton
          title={t().unknownBarcode.associate}
          onPress={associate}
          loading={saving}
          disabled={productId === null}
        />
      }
    >
      <Text style={{ color: c.muted, fontSize: 16, marginBottom: 16 }}>
        {t().unknownBarcode.explain(props.barcode ?? '')}
      </Text>

      {productId === null && suggestions.length > 0 ? (
        <View style={{ marginBottom: 18 }}>
          <SectionLabel>{t().unknownBarcode.onList}</SectionLabel>
          {suggestions.map(([id, name]) => (
            <Pressable
              key={id}
              onPress={() => setProductId(id)}
              style={({ pressed }) => ({
                minHeight: 52,
                justifyContent: 'center',
                paddingHorizontal: 14,
                marginBottom: 6,
                borderRadius: sizes.radius,
                borderWidth: 1,
                borderColor: c.border,
                backgroundColor: pressed ? c.done : c.card,
              })}
            >
              <Text style={{ fontSize: sizes.font, color: c.text, fontWeight: '600' }}>{name}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <ProductPicker productId={productId} onChange={setProductId} />
    </Sheet>
  );
}
