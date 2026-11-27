import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GrocyClient, type NamedEntity, type ShoppingList } from '../api/grocy';
import { BigButton, Chip, Field, SectionLabel } from '../components/ui';
import { ToastHost } from '../components/ToastHost';
import { useStore } from '../store/useStore';
import { sizes, useColors } from '../theme';
import { locale, t } from '../i18n';

export function SettingsScreen(props: { onDone: () => void; canClose: boolean; onOpenDoctor: () => void }) {
  const c = useColors();
  const settings = useStore((s) => s.settings);
  const applySettings = useStore((s) => s.applySettings);
  const showToast = useStore((s) => s.showToast);
  const [url, setUrl] = React.useState(settings.url);
  const [apiKey, setApiKey] = React.useState(settings.apiKey);
  const [listId, setListId] = React.useState<number | null>(settings.shoppingListId);
  const [lists, setLists] = React.useState<ShoppingList[] | null>(useStore.getState().meta?.shoppingLists ?? null);
  const [newLocId, setNewLocId] = React.useState<number | null>(settings.newProductLocationId);
  const [locations, setLocations] = React.useState<NamedEntity[] | null>(useStore.getState().meta?.locations ?? null);
  const [testing, setTesting] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [status, setStatus] = React.useState<{ ok: boolean; text: string } | null>(null);

  // Fresh locations on open: the loaded ones may be stale (one deleted in Grocy).
  React.useEffect(() => {
    const client = useStore.getState().client;
    if (!client) return;
    let alive = true;
    client
      .getLocations()
      .then((locs) => alive && setLocations(locs))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const test = async () => {
    setTesting(true);
    setStatus(null);
    try {
      const client = new GrocyClient(url, apiKey.trim());
      const info = await client.getSystemInfo();
      const [ls, locs] = await Promise.all([client.getShoppingLists(), client.getLocations()]);
      setLists(ls);
      setLocations(locs);
      if (ls.length && !ls.some((l) => l.id === listId)) setListId(ls[0].id);
      setStatus({ ok: true, text: t().settings.connected(info.grocy_version?.Version ?? '') });
    } catch (e: any) {
      setStatus({ ok: false, text: e?.message ?? String(e) });
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    if (!url.trim() || !apiKey.trim()) {
      showToast(t().settings.required, 'error');
      return;
    }
    setSaving(true);
    try {
      await applySettings({
        url: url.trim(),
        apiKey: apiKey.trim(),
        shoppingListId: listId,
        newProductLocationId: newLocId,
      });
      const err = useStore.getState().loadError;
      if (err) showToast(err, 'error');
      else showToast(t().settings.saved, 'success');
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
          <Text style={{ flex: 1, fontSize: 28, fontWeight: '800', color: c.text }}>{t().common.settings}</Text>
          {props.canClose ? <BigButton title={t().common.close} variant="ghost" compact onPress={props.onDone} /> : null}
        </View>

        <Field
          label={t().settings.url}
          placeholder="https://grocy.maison.lan"
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          hint={t().settings.urlHint}
        />
        <Field
          label={t().settings.apiKey}
          placeholder={t().settings.apiKeyPlaceholder}
          value={apiKey}
          onChangeText={setApiKey}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />
        <BigButton title={t().settings.test} variant="secondary" loading={testing} onPress={test} />
        {status ? (
          <Text style={{ marginTop: 10, fontSize: 16, fontWeight: '600', color: status.ok ? c.primary : c.danger }}>
            {status.text}
          </Text>
        ) : null}

        <View style={{ marginTop: 24 }}>
          <SectionLabel>{t().settings.list}</SectionLabel>
          {lists === null ? (
            <Text style={{ color: c.muted, fontSize: 16 }}>{t().settings.listsHint}</Text>
          ) : lists.length === 0 ? (
            <Text style={{ color: c.muted, fontSize: 16 }}>{t().settings.noList}</Text>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {lists.map((l) => (
                <Chip key={l.id} label={l.name} selected={l.id === listId} onPress={() => setListId(l.id)} />
              ))}
            </View>
          )}
        </View>

        <View style={{ marginTop: 24 }}>
          <SectionLabel>{t().settings.newLocation}</SectionLabel>
          {locations === null ? (
            <Text style={{ color: c.muted, fontSize: 16 }}>{t().settings.locationsHint}</Text>
          ) : (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Chip label={t().settings.grocyPreset} selected={newLocId === null} onPress={() => setNewLocId(null)} />
              {[...locations]
                .sort((a, b) => a.name.localeCompare(b.name, locale()))
                .map((l) => (
                  <Chip key={l.id} label={l.name} selected={l.id === newLocId} onPress={() => setNewLocId(l.id)} />
                ))}
              {newLocId !== null && !locations.some((l) => l.id === newLocId) ? (
                <Chip label={t().settings.notFound} selected onPress={() => setNewLocId(null)} />
              ) : null}
            </View>
          )}
          <Text style={{ color: c.muted, fontSize: 14, marginTop: 6 }}>
            {t().settings.newLocationHint}
          </Text>
        </View>

        <BigButton title={t().common.save} loading={saving} onPress={save} style={{ marginTop: 28 }} />

        {props.canClose ? (
          <View style={{ marginTop: 32 }}>
            <SectionLabel>{t().settings.diagnostic}</SectionLabel>
            <BigButton title={t().settings.doctor} variant="secondary" onPress={props.onOpenDoctor} />
            <Text style={{ color: c.muted, fontSize: 14, marginTop: 6 }}>
              {t().settings.doctorHint}
            </Text>
          </View>
        ) : null}
      </ScrollView>
      <ToastHost />
    </SafeAreaView>
  );
}
