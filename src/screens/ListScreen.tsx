import React from 'react';
import { ActivityIndicator, AppState, Platform, RefreshControl, SectionList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ShoppingLine } from '../api/grocy';
import { LineRow } from '../components/LineRow';
import { ToastHost } from '../components/ToastHost';
import { TotalsHeader } from '../components/TotalsHeader';
import { BigButton } from '../components/ui';
import { aisleNameMap, groupLines } from '../logic/grouping';
import { decideScan } from '../logic/scan';
import { computeTotals } from '../logic/totals';
import { stockUnitName, useStore } from '../store/useStore';
import { sizes, useColors } from '../theme';
import { CheckoutModal } from './CheckoutModal';
import { ItemEditorModal } from './ItemEditorModal';
import { PurchaseModal, type PurchaseTarget } from './PurchaseModal';
import { ScannerModal } from './ScannerModal';
import { UnknownBarcodeModal } from './UnknownBarcodeModal';
import { t } from '../i18n';

const AUTO_REFRESH_MS = 20_000;
/** iOS cannot present a modal while another one is being dismissed. */
const waitModalDismiss = () => new Promise((r) => setTimeout(r, Platform.OS === 'ios' ? 500 : 50));

export function ListScreen(props: { onOpenSettings: () => void }) {
  const c = useColors();
  const lines = useStore((s) => s.lines);
  const meta = useStore((s) => s.meta);
  const money = useStore((s) => s.money);
  const settings = useStore((s) => s.settings);
  const loading = useStore((s) => s.loading);
  const refreshing = useStore((s) => s.refreshing);
  const loadError = useStore((s) => s.loadError);
  const refreshLines = useStore((s) => s.refreshLines);
  const loadAll = useStore((s) => s.loadAll);
  const showToast = useStore((s) => s.showToast);

  const [editor, setEditor] = React.useState<{ line: ShoppingLine | null } | null>(null);
  const [purchase, setPurchase] = React.useState<PurchaseTarget | null>(null);
  const [scanner, setScanner] = React.useState(false);
  const [unknownCode, setUnknownCode] = React.useState<string | null>(null);
  const [checkoutOpen, setCheckoutOpen] = React.useState(false);
  const [lookup, setLookup] = React.useState<string | null>(null);

  const anyModal = !!editor || !!purchase || scanner || unknownCode !== null || checkoutOpen || lookup !== null;
  const anyModalRef = React.useRef(anyModal);
  anyModalRef.current = anyModal;

  // Auto refresh: app in foreground, no modal open, no mutation in flight.
  React.useEffect(() => {
    const id = setInterval(() => {
      if (AppState.currentState !== 'active' || anyModalRef.current || useStore.getState().busy > 0) return;
      refreshLines({ silent: true });
    }, AUTO_REFRESH_MS);
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active' && !anyModalRef.current) refreshLines({ silent: true });
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [refreshLines]);

  const sections = React.useMemo(() => groupLines(lines, aisleNameMap(meta)), [lines, meta]);
  const totals = React.useMemo(
    () =>
      computeTotals(
        lines.map((l) => ({
          amount: l.amount,
          done: l.done,
          freeText: l.product_id === null,
          lastPrice: l.last_price,
          paidUnitPrice: l.paid_price,
        })),
      ),
    [lines],
  );
  const listName = meta?.shoppingLists.find((l) => l.id === settings.shoppingListId)?.name ?? t().list.defaultName;
  const doneCount = lines.filter((l) => l.done).length;

  const onCheck = React.useCallback((line: ShoppingLine) => {
    setPurchase({ kind: 'line', line, amount: line.amount > 0 ? line.amount : 1 });
  }, []);
  const onEdit = React.useCallback((line: ShoppingLine) => setEditor({ line }), []);

  // ---------- Scan ----------

  const openForProduct = async (productId: number, lastPrice: number | null) => {
    const current = useStore.getState().lines;
    const d = decideScan(productId, current);
    await waitModalDismiss();
    if (d.kind === 'offList') setPurchase({ kind: 'offList', productId, amount: d.amount, lastPrice });
    else setPurchase({ kind: 'line', line: d.line, amount: d.amount });
  };

  const onScanned = async (code: string) => {
    setScanner(false);
    setLookup(code);
    const { client } = useStore.getState();
    try {
      if (!client) throw new Error(t().errors.notConfigured);
      const details = await client.getProductByBarcode(code);
      setLookup(null);
      if (!details) {
        await waitModalDismiss();
        setUnknownCode(code);
        return;
      }
      await openForProduct(details.product.id, details.last_price);
    } catch (e: any) {
      setLookup(null);
      showToast(e?.message ?? String(e), 'error');
    }
  };

  const onBarcodeAssociated = async (productId: number) => {
    const code = unknownCode;
    setUnknownCode(null);
    showToast(t().list.codeAssociated(code ?? ''), 'success');
    // Last known price, read back through the newly associated barcode.
    const client = useStore.getState().client;
    const details = code && client ? await client.getProductByBarcode(code).catch(() => null) : null;
    await openForProduct(productId, details?.last_price ?? null);
  };

  // ---------- Render ----------

  let body: React.ReactNode;
  if (loading && !meta) {
    body = (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={c.primary} />
        <Text style={{ color: c.muted, marginTop: 12, fontSize: 16 }}>{t().common.loading}</Text>
      </View>
    );
  } else if (!meta && loadError) {
    body = (
      <View style={{ flex: 1, padding: sizes.pad, justifyContent: 'center', gap: 12 }}>
        <Text style={{ color: c.danger, fontSize: 18, fontWeight: '700' }}>{loadError}</Text>
        <BigButton title={t().common.retry} onPress={loadAll} />
        <BigButton title={t().common.settings} variant="secondary" onPress={props.onOpenSettings} />
      </View>
    );
  } else {
    body = (
      <SectionList
        sections={sections}
        keyExtractor={(l) => String(l.id)}
        stickySectionHeadersEnabled
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => refreshLines({ pull: true })} tintColor={c.primary} />
        }
        ListHeaderComponent={
          loadError ? (
            <Text style={{ color: c.danger, padding: 12, fontSize: 15 }}>⚠︎ {loadError}</Text>
          ) : undefined
        }
        ListEmptyComponent={
          <Text style={{ color: c.muted, textAlign: 'center', marginTop: 60, fontSize: 18 }}>
            {t().list.empty}
          </Text>
        }
        renderSectionHeader={({ section }) => (
          <Text
            style={{
              backgroundColor: c.bg,
              color: c.muted,
              fontSize: 15,
              fontWeight: '800',
              textTransform: 'uppercase',
              paddingHorizontal: 16,
              paddingTop: 14,
              paddingBottom: 4,
            }}
          >
            {section.title} · {section.data.filter((l) => l.done).length}/{section.data.length}
          </Text>
        )}
        renderItem={({ item }) => (
          <LineRow
            line={item}
            unitName={stockUnitName(meta, item.product_id, item.amount)}
            paidUnitPrice={item.paid_price}
            money={money}
            onCheck={onCheck}
            onEdit={onEdit}
          />
        )}
      />
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.header }} edges={['top', 'left', 'right']}>
      <TotalsHeader
        totals={totals}
        money={money}
        listName={listName}
        onSettings={props.onOpenSettings}
        loading={loading}
      />
      <View style={{ flex: 1, backgroundColor: c.bg }}>{body}</View>

      <SafeAreaView edges={['bottom']} style={{ backgroundColor: c.card, borderTopWidth: 1, borderTopColor: c.border }}>
        <View style={{ flexDirection: 'row', gap: 10, padding: 10 }}>
          <BigButton title={t().list.add} variant="secondary" style={{ flex: 1 }} onPress={() => setEditor({ line: null })} disabled={!meta} />
          <BigButton title={t().list.scan} variant="secondary" style={{ flex: 1 }} onPress={() => setScanner(true)} disabled={!meta} />
          <BigButton
            title={t().list.checkout(doneCount)}
            style={{ flex: 1.2 }}
            onPress={() => setCheckoutOpen(true)}
            disabled={doneCount === 0}
          />
        </View>
      </SafeAreaView>

      {lookup !== null ? (
        <View
          style={{
            position: 'absolute',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.55)',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <ActivityIndicator size="large" color="#FFF" />
          <Text style={{ color: '#FFF', marginTop: 12, fontSize: 17, textAlign: 'center' }}>{t().list.code(lookup ?? '')}</Text>
        </View>
      ) : null}

      <ToastHost />

      <ItemEditorModal visible={!!editor} line={editor?.line ?? null} onClose={() => setEditor(null)} />
      <PurchaseModal target={purchase} onClose={() => setPurchase(null)} />
      <ScannerModal visible={scanner} onClose={() => setScanner(false)} onScanned={onScanned} />
      <UnknownBarcodeModal
        barcode={unknownCode}
        onClose={() => setUnknownCode(null)}
        onAssociated={onBarcodeAssociated}
      />
      <CheckoutModal visible={checkoutOpen} onClose={() => setCheckoutOpen(false)} />
    </SafeAreaView>
  );
}
