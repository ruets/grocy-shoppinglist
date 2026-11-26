import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ListScreen } from './src/screens/ListScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { useStore } from './src/store/useStore';
import { useColors } from './src/theme';

function Root() {
  const c = useColors();
  const ready = useStore((s) => s.ready);
  const client = useStore((s) => s.client);
  const init = useStore((s) => s.init);
  const [showSettings, setShowSettings] = React.useState(false);

  React.useEffect(() => {
    init().catch((e) => useStore.getState().showToast(String(e?.message ?? e), 'error'));
  }, [init]);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}>
        <ActivityIndicator size="large" color={c.primary} />
      </View>
    );
  }
  if (!client || showSettings) {
    return (
      <>
        <StatusBar style="auto" />
        <SettingsScreen canClose={!!client} onDone={() => setShowSettings(false)} />
      </>
    );
  }
  return (
    <>
      <StatusBar style="light" />
      <ListScreen onOpenSettings={() => setShowSettings(true)} />
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Root />
    </SafeAreaProvider>
  );
}
