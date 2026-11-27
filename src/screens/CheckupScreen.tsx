import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BigButton } from '../components/ui';
import { ToastHost } from '../components/ToastHost';
import { describeFix, isBlocking, pendingFixes, type CheckStatus } from '../logic/checkup';
import { useStore } from '../store/useStore';
import { sizes, useColors, type Colors } from '../theme';
import { t } from '../i18n';

const ICON: Record<CheckStatus, string> = { ok: '✓', warning: '⚠', missing: '✕', error: '✕' };

function statusColor(c: Colors, s: CheckStatus): string {
  return s === 'ok' ? c.primary : s === 'warning' ? c.warn : c.danger;
}

/**
 * « Vérification de Grocy »: shows each check and offers the fixes, which are
 * applied only when the user taps « Réparer ».
 * - blocking: shown at startup when something must be fixed before the list.
 * - otherwise: opened from Settings (« Grocy Doctor »).
 */
export function CheckupScreen(props: { blocking: boolean; onClose: () => void; onOpenSettings: () => void }) {
  const c = useColors();
  const results = useStore((s) => s.checkup);
  const runCheckup = useStore((s) => s.runCheckup);
  const applyFixes = useStore((s) => s.applyFixes);
  // From Settings: fresh check on open. At startup it has just run.
  const [busy, setBusy] = React.useState<'check' | 'fix' | null>(props.blocking ? null : 'check');

  React.useEffect(() => {
    if (!props.blocking) runCheckup().finally(() => setBusy(null));
  }, [props.blocking, runCheckup]);

  const fixes = results ? pendingFixes(results) : [];
  const blocked = results ? isBlocking(results) : true;
  const serverDown = results?.some((r) => r.id === 'server' && r.status === 'error') ?? false;

  const recheck = async () => {
    setBusy('check');
    try {
      const r = await runCheckup();
      if (props.blocking && !isBlocking(r)) await useStore.getState().applyFixes([]);
    } catch {
      /* toast */
    } finally {
      setBusy(null);
    }
  };

  const repair = async () => {
    setBusy('fix');
    try {
      await applyFixes(fixes);
    } catch {
      /* toast */
    } finally {
      setBusy(null);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }}>
      <ScrollView contentContainerStyle={{ padding: sizes.pad }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <Text style={{ flex: 1, fontSize: 28, fontWeight: '800', color: c.text }}>{t().checkup.title}</Text>
          {!props.blocking ? <BigButton title={t().common.close} variant="ghost" compact onPress={props.onClose} /> : null}
        </View>
        {props.blocking ? (
          <Text style={{ fontSize: 16, color: c.muted, marginBottom: 16 }}>
            {t().checkupScreen.intro}
          </Text>
        ) : null}

        {results === null ? (
          <Text style={{ color: c.muted, fontSize: 16 }}>{t().checkupScreen.checking}</Text>
        ) : (
          results.map((r) => (
            <View
              key={r.id}
              style={{
                flexDirection: 'row',
                backgroundColor: c.card,
                borderRadius: sizes.radius,
                padding: 14,
                marginBottom: 8,
                gap: 12,
              }}
            >
              <Text style={{ fontSize: 22, fontWeight: '800', color: statusColor(c, r.status), width: 24 }}>
                {ICON[r.status]}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: sizes.font, fontWeight: '700', color: c.text }}>{r.label}</Text>
                {r.detail ? <Text style={{ fontSize: 15, color: c.muted, marginTop: 2 }}>{r.detail}</Text> : null}
              </View>
            </View>
          ))
        )}

        {fixes.length > 0 ? (
          <View
            style={{
              borderWidth: 2,
              borderColor: c.primary,
              borderRadius: sizes.radius,
              padding: 14,
              marginTop: 12,
            }}
          >
            <Text style={{ fontSize: sizes.font, fontWeight: '800', color: c.text, marginBottom: 6 }}>
              {t().checkupScreen.willDo}
            </Text>
            {fixes.map((f, i) => (
              <Text key={i} style={{ fontSize: 16, color: c.text, marginBottom: 2 }}>
                • {describeFix(f)}
              </Text>
            ))}
            <Text style={{ fontSize: 14, color: c.muted, marginTop: 6 }}>
              {fixes.some((f) => f.kind === 'renameUserfields')
                ? t().checkupScreen.captionsOnly
                : t().checkupScreen.onlyAdds}
            </Text>
            <BigButton title={t().checkupScreen.repair} loading={busy === 'fix'} onPress={repair} style={{ marginTop: 12 }} />
          </View>
        ) : null}

        <View style={{ gap: 10, marginTop: 20 }}>
          <BigButton title={t().checkupScreen.rerun} variant="secondary" loading={busy === 'check'} onPress={recheck} />
          {props.blocking && results && !blocked ? (
            <BigButton title={t().checkupScreen.continue} onPress={recheck} />
          ) : null}
          {props.blocking || serverDown ? (
            <BigButton title={t().common.settings} variant="ghost" onPress={props.onOpenSettings} />
          ) : null}
        </View>
      </ScrollView>
      <ToastHost />
    </SafeAreaView>
  );
}
