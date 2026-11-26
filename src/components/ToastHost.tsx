import React from 'react';
import { Pressable, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useStore } from '../store/useStore';

/** Toast global (au-dessus de tout sauf des modales natives). */
export function ToastHost() {
  const toast = useStore((s) => s.toast);
  const hide = useStore((s) => s.hideToast);
  const insets = useSafeAreaInsets();
  if (!toast) return null;
  const bg = toast.kind === 'error' ? '#B3261E' : toast.kind === 'success' ? '#1F7A4D' : '#333740';
  return (
    <Pressable
      onPress={hide}
      accessibilityRole="alert"
      style={{
        position: 'absolute',
        left: 12,
        right: 12,
        bottom: insets.bottom + 90,
        backgroundColor: bg,
        borderRadius: 14,
        padding: 16,
        elevation: 6,
        shadowColor: '#000',
        shadowOpacity: 0.3,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
      }}
    >
      <Text style={{ color: '#FFF', fontSize: 16, fontWeight: '600' }}>{toast.text}</Text>
    </Pressable>
  );
}
