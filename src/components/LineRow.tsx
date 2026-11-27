import React from 'react';
import { Pressable, Text, View } from 'react-native';
import type { ShoppingLine } from '../api/grocy';
import { lineLabel } from '../logic/grouping';
import { formatAmount } from '../logic/numbers';
import { linePrice } from '../logic/totals';
import { sizes, useColors } from '../theme';

export const LineRow = React.memo(function LineRow(props: {
  line: ShoppingLine;
  unitName: string;
  paidUnitPrice: number | null;
  money: (n: number) => string;
  onCheck: (l: ShoppingLine) => void;
  onEdit: (l: ShoppingLine) => void;
}) {
  const c = useColors();
  const { line } = props;
  const free = line.product_id === null;
  const price = linePrice({
    amount: line.amount,
    done: line.done,
    freeText: free,
    lastPrice: line.last_price,
    paidUnitPrice: props.paidUnitPrice,
  });
  const priceText = price.value === null ? (free ? '' : 'sans prix') : `${price.estimated ? '~' : ''}${props.money(price.value)}`;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'stretch',
        backgroundColor: line.done ? c.done : c.card,
        borderRadius: sizes.radius,
        marginHorizontal: 12,
        marginVertical: 4,
        borderWidth: 1,
        borderColor: c.border,
        minHeight: 64,
      }}
    >
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: line.done }}
        accessibilityLabel={line.done ? 'Modifier l’achat' : 'Mettre dans le panier'}
        onPress={() => props.onCheck(line)}
        style={({ pressed }) => ({
          width: 68,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.5 : 1,
        })}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            borderWidth: 3,
            borderColor: line.done ? c.primary : c.muted,
            backgroundColor: line.done ? c.primary : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {line.done ? <Text style={{ color: c.primaryText, fontSize: 22, fontWeight: '900' }}>✓</Text> : null}
        </View>
      </Pressable>
      <Pressable
        onPress={() => props.onEdit(line)}
        accessibilityLabel={`Modifier ${lineLabel(line)}`}
        style={({ pressed }) => ({ flex: 1, paddingVertical: 10, paddingRight: 14, opacity: pressed ? 0.6 : 1 })}
      >
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <Text
            style={{
              flex: 1,
              fontSize: sizes.font,
              fontWeight: '700',
              color: line.done ? c.muted : c.text,
              textDecorationLine: line.done ? 'line-through' : 'none',
            }}
            numberOfLines={2}
          >
            {lineLabel(line)}
          </Text>
          <Text style={{ fontSize: 16, fontWeight: '700', color: price.estimated ? c.muted : c.text, marginLeft: 8 }}>
            {priceText}
          </Text>
        </View>
        <Text style={{ color: c.muted, fontSize: 15, marginTop: 2 }} numberOfLines={2}>
          {free
            ? line.amount !== 1
              ? `${formatAmount(line.amount)} unités`
              : ''
            : `${formatAmount(line.amount)} ${props.unitName}`}
          {!free && line.note ? ` · ${line.note}` : ''}
        </Text>
      </Pressable>
    </View>
  );
});
