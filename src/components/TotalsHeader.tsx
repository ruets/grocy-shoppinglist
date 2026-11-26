import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { formatBucket, type Totals } from '../logic/totals';
import { useColors } from '../theme';

export function TotalsHeader(props: {
  totals: Totals;
  money: (n: number) => string;
  listName: string;
  onSettings: () => void;
  loading?: boolean;
}) {
  const c = useColors();
  const { cart, remaining, list } = props.totals;
  const cell = (label: string, value: string, sub: string | null, accent?: boolean) => (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ color: c.headerText, opacity: 0.75, fontSize: 13, fontWeight: '700', textTransform: 'uppercase' }}>
        {label}
      </Text>
      <Text
        style={{ color: accent ? '#7CE0A8' : c.headerText, fontSize: 22, fontWeight: '800' }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      {sub ? <Text style={{ color: c.headerText, opacity: 0.7, fontSize: 12 }}>{sub}</Text> : null}
    </View>
  );
  const noPrice = (n: number) => (n > 0 ? `${n} sans prix` : null);
  return (
    <View style={{ backgroundColor: c.header, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
        <Text style={{ flex: 1, color: c.headerText, fontSize: 20, fontWeight: '800' }} numberOfLines={1}>
          {props.listName}
          {props.loading ? '  ⟳' : ''}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Réglages"
          onPress={props.onSettings}
          hitSlop={10}
          style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontSize: 26, color: c.headerText }}>⚙︎</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row' }}>
        {cell(`Panier (${cart.count})`, formatBucket(cart, props.money), noPrice(cart.withoutPrice), true)}
        {cell(
          `Reste (${remaining.count})`,
          formatBucket(remaining, props.money),
          noPrice(remaining.withoutPrice),
        )}
        {cell('Liste', formatBucket(list, props.money), noPrice(list.withoutPrice))}
      </View>
    </View>
  );
}
