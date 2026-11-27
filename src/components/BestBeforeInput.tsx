import React from 'react';
import { TextInput, View } from 'react-native';
import { addDays, formatBestBefore, NEVER_EXPIRES, parseBestBeforeText, productDefaultBestBefore } from '../logic/dates';
import { useStore } from '../store/useStore';
import { Chip, Field } from './ui';
import { t } from '../i18n';

export { parseBestBeforeText };

/** ISO value → field text. */
export function bestBeforeToText(iso: string | null | undefined): string {
  return formatBestBefore(iso);
}

/**
 * Best-before date field + shortcuts. Quick entry: "1203" = 12/03, "120327" = 12/03/2027.
 */
export function BestBeforeInput(props: {
  productId: number | null;
  text: string;
  onChangeText: (t: string) => void;
  label?: string;
  placeholder?: string;
  autoFocus?: boolean;
  onSubmit?: () => void;
  /** Show the « Plus tard » (later) chip, i.e. leave empty. */
  allowEmpty?: boolean;
}) {
  const meta = useStore((s) => s.meta);
  const inputRef = React.useRef<React.ComponentRef<typeof TextInput>>(null);
  const parsed = parseBestBeforeText(props.text);
  const product = props.productId !== null ? meta?.productsById.get(props.productId) : undefined;
  const productDefault = productDefaultBestBefore(product?.default_best_before_days);

  const m = t().dateInput;
  const chips: [string, string | null][] = [];
  if (props.allowEmpty) chips.push([m.later, null]);
  chips.push([m.neverExpires, NEVER_EXPIRES]);
  if (productDefault && productDefault !== NEVER_EXPIRES) {
    chips.push([m.productDefault(product?.default_best_before_days ?? 0), productDefault]);
  }
  chips.push([m.plus3Days, addDays(3)], [m.plus1Week, addDays(7)], [m.plus1Month, addDays(30)]);

  React.useEffect(() => {
    if (props.autoFocus) {
      const timer = setTimeout(() => inputRef.current?.focus(), 350);
      return () => clearTimeout(timer);
    }
  }, [props.autoFocus, props.productId]);

  return (
    <View>
      <Field
        ref={inputRef}
        label={props.label ?? m.label}
        value={props.text}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder ?? m.placeholder}
        keyboardType="numbers-and-punctuation"
        returnKeyType={props.onSubmit ? 'next' : 'done'}
        onSubmitEditing={props.onSubmit}
        submitBehavior={props.onSubmit ? 'submit' : 'blurAndSubmit'}
        hint={
          parsed === 'invalid'
            ? m.invalid
            : parsed
              ? `→ ${formatBestBefore(parsed)}`
              : m.quickHint
        }
      />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {chips.map(([label, iso]) => (
          <Chip
            key={label}
            label={label}
            selected={iso === null ? !props.text.trim() : parsed === iso}
            onPress={() => props.onChangeText(iso ? formatBestBefore(iso) : '')}
          />
        ))}
      </View>
    </View>
  );
}
