import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GrocyClient, type ShoppingList } from '../api/grocy';
import { BigButton, Chip, Field, SectionLabel } from '../components/ui';
import { ToastHost } from '../components/ToastHost';
import { useStore } from '../store/useStore';
import { sizes, useColors } from '../theme';

export function SettingsScreen(props: { onDone: () => void; canClose: boolean }) {
  const c = useColors();
  const settings = useStore((s) => s.settings);
  const applySettings = useStore((s) => s.applySettings);
  const showToast = useStore((s) => s.showToast);
  const [url, setUrl] = React.useState(settings.url);
  const [apiKey, setApiKey] = React.useState(settings.apiKey);
  const [listId, setListId] = React.useState<number | null>(settings.shoppingListId);
  const [lists, setLists] = React.useState<ShoppingList[] | null>(useStore.getState().meta?.shoppingLists ?? null);
  const [testing, setTesting] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [status, setStatus] = React.useState<{ ok: boolean; text: string } | null>(null);

  const test = async () => {
    setTesting(true);
    setStatus(null);
    try {
      const client = new GrocyClient(url, apiKey.trim());
      const info = await client.getSystemInfo();
      const ls = await client.getShoppingLists();
      setLists(ls);
      if (ls.length && !ls.some((l) => l.id === listId)) setListId(ls[0].id);
      setStatus({ ok: true, text: `Connecté à Grocy ${info.grocy_version?.Version ?? ''} ✓` });
    } catch (e: any) {
      setStatus({ ok: false, text: e?.message ?? String(e) });
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    if (!url.trim() || !apiKey.trim()) {
      showToast('URL et clé API sont obligatoires.', 'error');
      return;
    }
    setSaving(true);
    try {
      await applySettings({ url: url.trim(), apiKey: apiKey.trim(), shoppingListId: listId });
      const err = useStore.getState().loadError;
      if (err) showToast(err, 'error');
      else showToast('Réglages enregistrés', 'success');
      props.onDone();
    } catch (e: any) {
      showToast(e?.message ?? String(e), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ padding: sizes.pad }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
          <Text style={{ flex: 1, fontSize: 28, fontWeight: '800', color: c.text }}>Réglages</Text>
          {props.canClose ? <BigButton title="Fermer" variant="ghost" compact onPress={props.onDone} /> : null}
        </View>

        <Field
          label="URL de Grocy"
          placeholder="https://grocy.maison.lan"
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          hint="Sans « /api ». HTTPS recommandé (voir README)."
        />
        <Field
          label="Clé API"
          placeholder="Grocy → Gérer les clés API"
          value={apiKey}
          onChangeText={setApiKey}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />
        <BigButton title="Tester la connexion" variant="secondary" loading={testing} onPress={test} />
        {status ? (
          <Text style={{ marginTop: 10, fontSize: 16, fontWeight: '600', color: status.ok ? c.primary : c.danger }}>
            {status.text}
          </Text>
        ) : null}

        <View style={{ marginTop: 24 }}>
          <SectionLabel>Liste de courses</SectionLabel>
          {lists === null ? (
            <Text style={{ color: c.muted, fontSize: 16 }}>Testez la connexion pour charger les listes.</Text>
          ) : lists.length === 0 ? (
            <Text style={{ color: c.muted, fontSize: 16 }}>Aucune liste dans Grocy.</Text>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {lists.map((l) => (
                <Chip key={l.id} label={l.name} selected={l.id === listId} onPress={() => setListId(l.id)} />
              ))}
            </View>
          )}
        </View>

        <BigButton title="Enregistrer" loading={saving} onPress={save} style={{ marginTop: 28 }} />
      </ScrollView>
      <ToastHost />
    </SafeAreaView>
  );
}
