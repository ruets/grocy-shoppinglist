import React from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { sizes, useColors } from '../theme';
import { formatInput, parseDecimal, round2 } from '../logic/numbers';
import { ToastHost } from './ToastHost';

// ---------- Button ----------

export function BigButton(props: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  compact?: boolean;
}) {
  const c = useColors();
  const v = props.variant ?? 'primary';
  const bg = v === 'primary' ? c.primary : v === 'danger' ? c.danger : v === 'secondary' ? c.card : 'transparent';
  const fg = v === 'primary' ? c.primaryText : v === 'danger' ? '#FFFFFF' : v === 'ghost' ? c.primary : c.text;
  const disabled = props.disabled || props.loading;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={props.onPress}
      disabled={disabled}
      style={({ pressed }) => [
        {
          minHeight: props.compact ? 44 : sizes.touch,
          borderRadius: sizes.radius,
          backgroundColor: bg,
          borderWidth: v === 'secondary' ? 1 : 0,
          borderColor: c.border,
          paddingHorizontal: 12,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          opacity: disabled ? 0.5 : pressed ? 0.75 : 1,
        },
        props.style,
      ]}
    >
      {props.loading ? <ActivityIndicator color={fg} style={{ marginRight: 8 }} /> : null}
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        style={{ color: fg, fontSize: props.compact ? 16 : sizes.font, fontWeight: '700', flexShrink: 1 }}
      >
        {props.title}
      </Text>
    </Pressable>
  );
}

// ---------- Text field ----------

export function Field(props: TextInputProps & { label?: string; hint?: string; ref?: React.Ref<React.ComponentRef<typeof TextInput>> }) {
  const c = useColors();
  const { label, hint, style, ...rest } = props;
  return (
    <View style={{ marginBottom: 14 }}>
      {label ? <Text style={[styles.label, { color: c.muted }]}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={c.muted}
        {...rest}
        style={[
          {
            minHeight: sizes.touch,
            borderRadius: sizes.radius,
            borderWidth: 1,
            borderColor: c.border,
            backgroundColor: c.input,
            color: c.text,
            fontSize: sizes.font,
            paddingHorizontal: 14,
          },
          style,
        ]}
      />
      {hint ? <Text style={{ color: c.muted, marginTop: 4, fontSize: 13 }}>{hint}</Text> : null}
    </View>
  );
}

// ---------- Quantity stepper ----------

export function Stepper(props: { value: number; onChange: (v: number) => void; step?: number; min?: number; unit?: string }) {
  const c = useColors();
  const step = props.step ?? 1;
  const min = props.min ?? 0;
  const [text, setText] = React.useState(formatInput(props.value));
  React.useEffect(() => {
    if (parseDecimal(text) !== props.value) setText(formatInput(props.value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.value]);

  const btn = (label: string, delta: number) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={delta > 0 ? 'Augmenter' : 'Diminuer'}
      onPress={() => props.onChange(Math.max(min, round2(props.value + delta)))}
      style={({ pressed }) => [
        styles.stepBtn,
        { backgroundColor: c.card, borderColor: c.border, opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <Text style={{ fontSize: 30, fontWeight: '700', color: c.text }}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {btn('−', -step)}
      <View style={{ flex: 1 }}>
        <TextInput
          value={text}
          keyboardType="decimal-pad"
          selectTextOnFocus
          onChangeText={(t) => {
            setText(t);
            const n = parseDecimal(t);
            if (n !== null && n >= min) props.onChange(n);
          }}
          onBlur={() => setText(formatInput(props.value))}
          style={{
            minHeight: 64,
            textAlign: 'center',
            fontSize: 26,
            fontWeight: '700',
            color: c.text,
            backgroundColor: c.input,
            borderRadius: sizes.radius,
            borderWidth: 1,
            borderColor: c.border,
          }}
        />
        {props.unit ? <Text style={{ textAlign: 'center', color: c.muted, marginTop: 4 }}>{props.unit}</Text> : null}
      </View>
      {btn('+', step)}
    </View>
  );
}

// ---------- Choice chips ----------

export function Chip(props: { label: string; selected?: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={props.onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        paddingHorizontal: 14,
        justifyContent: 'center',
        borderRadius: 22,
        borderWidth: 1,
        borderColor: props.selected ? c.primary : c.border,
        backgroundColor: props.selected ? c.primary : c.card,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text style={{ color: props.selected ? c.primaryText : c.text, fontSize: 16, fontWeight: '600' }}>
        {props.label}
      </Text>
    </Pressable>
  );
}

// ---------- Full-screen modal ----------

export function Sheet(props: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  scroll?: boolean;
}) {
  const c = useColors();
  return (
    <Modal visible={props.visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={props.onClose}>
      {/* A Modal is a new native window: it needs its own safe-area insets provider. */}
      <SafeAreaProvider>
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'bottom', 'left', 'right']}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={[styles.sheetHeader, { borderBottomColor: c.border }]}>
            <Text style={{ flex: 1, fontSize: sizes.fontLarge, fontWeight: '800', color: c.text }} numberOfLines={2}>
              {props.title}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Fermer"
              onPress={props.onClose}
              hitSlop={12}
              style={({ pressed }) => [styles.close, { backgroundColor: c.card, opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={{ fontSize: 22, color: c.text, fontWeight: '700' }}>✕</Text>
            </Pressable>
          </View>
          {props.scroll === false ? (
            <View style={{ flex: 1 }}>{props.children}</View>
          ) : (
            <ScrollView contentContainerStyle={{ padding: sizes.pad }} keyboardShouldPersistTaps="handled">
              {props.children}
            </ScrollView>
          )}
          {props.footer ? (
            <View style={{ padding: sizes.pad, borderTopWidth: 1, borderTopColor: c.border, gap: 10 }}>
              {props.footer}
            </View>
          ) : null}
        </KeyboardAvoidingView>
        <ToastHost />
      </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  const c = useColors();
  return <Text style={[styles.label, { color: c.muted }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  stepBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: sizes.pad,
    paddingVertical: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  close: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
