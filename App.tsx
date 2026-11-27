import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CheckupScreen } from './src/screens/CheckupScreen';
import { ListScreen } from './src/screens/ListScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { useStore } from './src/store/useStore';
import { useColors } from './src/theme';
import { t } from './src/i18n';

function Root() {
  const c = useColors();
  const phase = useStore((s) => s.phase);
  const client = useStore((s) => s.client);
  const init = useStore((s) => s.init);
  const [showSettings, setShowSettings] = React.useState(false);
  const [showDoctor, setShowDoctor] = React.useState(false);

  React.useEffect(() => {
    init().catch((e) => useStore.getState().showToast(String(e?.message ?? e), 'error'));
  }, [init]);

  if (phase === 'init' || phase === 'checking') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg, gap: 16 }}>
        <ActivityIndicator size="large" color={c.primary} />
        {phase === 'checking' ? (
          <Text style={{ fontSize: 17, color: c.muted }}>{t().checkup.checking}</Text>
        ) : null}
      </View>
    );
  }
  if (!client || showSettings) {
    return (
      <>
        <StatusBar style="auto" />
        <SettingsScreen
          canClose={!!client}
          onDone={() => setShowSettings(false)}
          onOpenDoctor={() => {
            setShowSettings(false);
            setShowDoctor(true);
          }}
        />
      </>
    );
  }
  if (phase === 'blocked' || showDoctor) {
    return (
      <>
        <StatusBar style="auto" />
        <CheckupScreen
          blocking={phase === 'blocked'}
          onClose={() => setShowDoctor(false)}
          onOpenSettings={() => {
            setShowDoctor(false);
            setShowSettings(true);
          }}
        />
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
