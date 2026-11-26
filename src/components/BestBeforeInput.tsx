import React from 'react';
import { TextInput, View } from 'react-native';
import { addDays, formatBestBefore, NEVER_EXPIRES, parseUserDate, productDefaultBestBefore } from '../logic/dates';
import { useStore } from '../store/useStore';
import { Chip, Field } from './ui';

/** Texte saisi → ISO (ou « jamais »). null si vide, 'invalid' si illisible. */
export function parseBestBeforeText(text: string): string | null | 'invalid' {
  const t = text.trim();
  if (!t) return null;
  if (t.toLowerCase() === 'jamais') return NEVER_EXPIRES;
  return parseUserDate(t) ?? 'invalid';
}

/** Valeur ISO → texte du champ. */
export function bestBeforeToText(iso: string | null | undefined): string {
  return formatBestBefore(iso);
}

/**
 * Champ DLC + raccourcis. Saisie rapide : « 1203 » = 12/03, « 120327 » = 12/03/2027.
 */
export function BestBeforeInput(props: {
  productId: number | null;
  text: string;
  onChangeText: (t: string) => void;
  label?: string;
  placeholder?: string;
  autoFocus?: boolean;
  onSubmit?: () => void;
  /** Afficher la puce « Plus tard » (= laisser vide). */
  allowEmpty?: boolean;
}) {
  const meta = useStore((s) => s.meta);
  const inputRef = React.useRef<React.ComponentRef<typeof TextInput>>(null);
  const parsed = parseBestBeforeText(props.text);
  const product = props.productId !== null ? meta?.productsById.get(props.productId) : undefined;
  const productDefault = productDefaultBestBefore(product?.default_best_before_days);

  const chips: [string, string | null][] = [];
  if (props.allowEmpty) chips.push(['Plus tard', null]);
  chips.push(['Ne périme pas', NEVER_EXPIRES]);
  if (productDefault && productDefault !== NEVER_EXPIRES) {
    chips.push([`Défaut produit (+${product?.default_best_before_days} j)`, productDefault]);
  }
  chips.push(['+3 j', addDays(3)], ['+1 sem.', addDays(7)], ['+1 mois', addDays(30)]);

  React.useEffect(() => {
    if (props.autoFocus) {
      const t = setTimeout(() => inputRef.current?.focus(), 350);
      return () => clearTimeout(t);
    }
  }, [props.autoFocus, props.productId]);

  return (
    <View>
      <Field
        ref={inputRef}
        label={props.label ?? 'Date de péremption'}
        value={props.text}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder ?? 'JJMM ou JJ/MM/AAAA'}
        keyboardType="numbers-and-punctuation"
        returnKeyType={props.onSubmit ? 'next' : 'done'}
        onSubmitEditing={props.onSubmit}
        submitBehavior={props.onSubmit ? 'submit' : 'blurAndSubmit'}
        hint={
          parsed === 'invalid'
            ? 'Date invalide'
            : parsed
              ? `→ ${formatBestBefore(parsed)}`
              : 'Saisie rapide : 1203 = 12/03, 120327 = 12/03/2027'
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
