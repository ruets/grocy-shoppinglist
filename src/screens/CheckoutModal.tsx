import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { BestBeforeInput, bestBeforeToText, parseBestBeforeText } from '../components/BestBeforeInput';
import { BigButton, Chip, SectionLabel, Sheet } from '../components/ui';
import { linesMissingBestBefore, type CheckoutResult } from '../logic/checkout';
import { formatBestBefore } from '../logic/dates';
import { lineLabel } from '../logic/grouping';
import { formatAmount } from '../logic/numbers';
import { computeTotals, formatBucket, linePrice } from '../logic/totals';
import { stockUnitName, useStore } from '../store/useStore';
import { sizes, useColors } from '../theme';
import { ScannerModal } from './ScannerModal';
import { t } from '../i18n';

type Phase = 'dates' | 'recap' | 'result';

export function CheckoutModal(props: { visible: boolean; onClose: () => void }) {
  const c = useColors();
  const lines = useStore((s) => s.lines);
  const stocked = useStore((s) => s.stocked);
  const meta = useStore((s) => s.meta);
  const money = useStore((s) => s.money);
  const lastLoc = useStore((s) => s.lastShoppingLocationId);
  const checkout = useStore((s) => s.checkout);
  const setBestBefore = useStore((s) => s.setBestBefore);
  const showToast = useStore((s) => s.showToast);

  const [phase, setPhase] = React.useState<Phase>('recap');
  const [locationId, setLocationId] = React.useState<number | null>(null);
  const [running, setRunning] = React.useState(false);
  const [progress, setProgress] = React.useState<[number, number] | null>(null);
  const [result, setResult] = React.useState<CheckoutResult | null>(null);

  // Date walkthrough: ids of the lines to process + current position.
  const [queue, setQueue] = React.useState<number[]>([]);
  const [index, setIndex] = React.useState(0);
  const [dateText, setDateText] = React.useState('');
  const [scanning, setScanning] = React.useState(false);

  const checked = lines.filter((l) => l.done);
  const missing = linesMissingBestBefore(lines);

  const startDates = (startId?: number) => {
    const ids = missing.map((l) => l.id);
    if (startId !== undefined && !ids.includes(startId)) ids.unshift(startId);
    setQueue(ids);
    setIndex(startId !== undefined ? ids.indexOf(startId) : 0);
    setPhase('dates');
  };

  React.useEffect(() => {
    if (!props.visible) {
      setResult(null);
      setPhase('recap');
      return;
    }
    setResult(null);
    setProgress(null);
    setScanning(false);
    const locs = meta?.shoppingLocations ?? [];
    setLocationId(lastLoc !== null && locs.some((l) => l.id === lastLoc) ? lastLoc : null);
    if (missing.length > 0) startDates();
    else setPhase('recap');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.visible]);

  // Lines still valid in the walkthrough (a line unchecked/deleted meanwhile drops out).
  const activeQueue = queue.filter((id) => lines.some((l) => l.id === id && l.done && l.product_id !== null));
  const pos = Math.min(index, Math.max(activeQueue.length - 1, 0));
  const current = phase === 'dates' ? lines.find((l) => l.id === activeQueue[pos]) : undefined;

  // Load the already entered date when switching items.
  React.useEffect(() => {
    if (current) setDateText(bestBeforeToText(current.best_before));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  // The date is saved in Grocy shortly after typing stops, and right away
  // when leaving the item (avoids one request per keystroke).
  const pending = React.useRef<{ lineId: number; iso: string | null } | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushDate = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const p = pending.current;
    pending.current = null;
    if (p) setBestBefore(p.lineId, p.iso).catch(() => undefined);
  };
  React.useEffect(() => () => flushDate(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const onDateText = (text: string) => {
    setDateText(text);
    if (!current) return;
    const p = parseBestBeforeText(text);
    if (p === 'invalid') return;
    if (timer.current) clearTimeout(timer.current);
    if (p === current.best_before) {
      pending.current = null;
      return;
    }
    pending.current = { lineId: current.id, iso: p };
    timer.current = setTimeout(flushDate, 600);
  };

  const goNext = () => {
    if (parseBestBeforeText(dateText) === 'invalid') {
      showToast(t().checkout.invalidDate, 'error');
      return;
    }
    flushDate();
    if (pos + 1 >= activeQueue.length) setPhase('recap');
    else setIndex(pos + 1);
  };

  const onScanned = async (code: string) => {
    setScanning(false);
    flushDate();
    const client = useStore.getState().client;
    try {
      const details = client ? await client.getProductByBarcode(code) : null;
      const target = details
        ? useStore.getState().lines.find((l) => l.done && l.product_id === details.product.id)
        : undefined;
      if (!target) {
        showToast(details ? t().common.notInCart(details.product.name) : t().common.unknownCode(code), 'error');
        return;
      }
      const at = activeQueue.indexOf(target.id);
      if (at >= 0) {
        setQueue(activeQueue);
        setIndex(at);
      } else {
        const next = [...activeQueue];
        next.splice(pos + 1, 0, target.id);
        setQueue(next);
        setIndex(activeQueue.length ? pos + 1 : 0);
      }
    } catch (e: any) {
      showToast(e?.message ?? String(e), 'error');
    }
  };

  const toTotals = (l: (typeof lines)[number]) => ({
    amount: l.amount,
    done: true,
    freeText: l.product_id === null,
    lastPrice: l.last_price,
    paidUnitPrice: l.paid_price,
  });
  const cart = computeTotals(checked.map(toTotals)).cart;

  const run = async () => {
    setRunning(true);
    setProgress([0, checked.length]);
    try {
      const r = await checkout(locationId, (d, t) => setProgress([d, t]));
      setResult(r);
    } catch (e: any) {
      setResult({ ok: [], errors: [{ id: 0, label: t().checkout.errorLabel, message: e?.message ?? String(e) }] });
    } finally {
      setRunning(false);
      setPhase('result');
    }
  };

  // ---------- Result ----------
  if (phase === 'result' && result) {
    return (
      <Sheet
        visible={props.visible}
        title={t().checkout.resultTitle}
        onClose={props.onClose}
        footer={<BigButton title={t().checkout.done} onPress={props.onClose} />}
      >
        <Text style={{ fontSize: 20, fontWeight: '800', color: result.errors.length ? c.warn : c.primary }}>
          {t().checkout.result(result.ok.length, result.errors.length)}
        </Text>
        {result.errors.map((e) => (
          <View key={e.id} style={{ marginTop: 12, padding: 12, borderRadius: sizes.radius, backgroundColor: c.card }}>
            <Text style={{ fontSize: 17, fontWeight: '700', color: c.text }}>{e.label}</Text>
            <Text style={{ fontSize: 15, color: c.danger, marginTop: 4 }}>{e.message}</Text>
          </View>
        ))}
        {result.errors.length ? (
          <Text style={{ color: c.muted, marginTop: 16, fontSize: 15 }}>
            {t().checkout.retryHint}
          </Text>
        ) : null}
      </Sheet>
    );
  }

  // ---------- Guided date entry ----------
  if (phase === 'dates') {
    if (!current) {
      // Nothing left to enter (lines unchecked meanwhile…)
      return (
        <Sheet
          visible={props.visible}
          title={t().checkout.datesTitle}
          onClose={props.onClose}
          footer={
            <BigButton
              title={t().checkout.seeRecap}
              onPress={() => {
                flushDate();
                setPhase('recap');
              }}
            />
          }
        >
          <Text style={{ color: c.muted, fontSize: 17 }}>{t().checkout.allDatesSet}</Text>
        </Sheet>
      );
    }
    const remaining = linesMissingBestBefore(lines).length;
    const hasDate = parseBestBeforeText(dateText) !== null;
    return (
      <Sheet
        visible={props.visible}
        title={t().checkout.datesTitle}
        onClose={props.onClose}
        footer={
          <>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <BigButton
                title={t().checkout.prev}
                variant="secondary"
                style={{ flex: 1 }}
                disabled={pos === 0}
                onPress={() => {
                  flushDate();
                  setIndex(pos - 1);
                }}
              />
              <BigButton
                title={pos + 1 >= activeQueue.length ? t().checkout.recap : hasDate ? t().checkout.next : t().checkout.skip}
                style={{ flex: 2 }}
                onPress={goNext}
              />
            </View>
          </>
        }
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <Text style={{ flex: 1, color: c.muted, fontSize: 16, fontWeight: '700' }}>
            {t().checkout.position(pos + 1, activeQueue.length, remaining)}
          </Text>
          <BigButton title={t().list.scan} variant="secondary" compact onPress={() => setScanning(true)} />
        </View>
        <Text style={{ fontSize: 26, fontWeight: '800', color: c.text }}>{lineLabel(current)}</Text>
        <Text style={{ fontSize: 17, color: c.muted, marginBottom: 20 }}>
          {formatAmount(current.amount)} {stockUnitName(meta, current.product_id, current.amount)}
        </Text>
        <BestBeforeInput
          productId={current.product_id}
          text={dateText}
          onChangeText={onDateText}
          autoFocus
          onSubmit={goNext}
        />
        <Text style={{ color: c.muted, fontSize: 14, marginTop: 16 }}>
          {t().checkout.scanHint}
        </Text>
        <ScannerModal visible={scanning} onClose={() => setScanning(false)} onScanned={onScanned} />
      </Sheet>
    );
  }

  // ---------- Summary ----------
  return (
    <Sheet
      visible={props.visible}
      title={t().checkout.title}
      onClose={running ? () => {} : props.onClose}
      footer={
        <BigButton
          title={
            running && progress
              ? t().checkout.running(progress[0], progress[1])
              : missing.length > 0
                ? t().checkout.missingDates(missing.length)
                : t().checkout.confirm(checked.length, formatBucket(cart, money))
          }
          onPress={run}
          loading={running}
          disabled={checked.length === 0 || missing.length > 0}
        />
      }
    >
      {missing.length > 0 ? (
        <Pressable
          onPress={() => startDates()}
          style={{ padding: 14, borderRadius: sizes.radius, backgroundColor: c.danger, marginBottom: 14 }}
        >
          <Text style={{ color: '#FFF', fontSize: 17, fontWeight: '800' }}>
            {t().checkout.missingBanner(missing.length)}
          </Text>
        </Pressable>
      ) : null}

      {checked.length === 0 ? (
        <Text style={{ color: c.muted, fontSize: 17 }}>{t().checkout.emptyCart}</Text>
      ) : (
        checked.map((l) => {
          const p = linePrice(toTotals(l));
          const free = l.product_id === null;
          const bb = l.best_before;
          return (
            <Pressable
              key={l.id}
              disabled={free}
              onPress={() => startDates(l.id)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderBottomColor: c.border,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 17, fontWeight: '700', color: c.text }}>{lineLabel(l)}</Text>
                <Text style={{ fontSize: 14, color: c.muted }}>
                  {free
                    ? t().checkout.offStock
                    : `${formatAmount(l.amount)} ${stockUnitName(meta, l.product_id, l.amount)}${
                        l.id in stocked ? t().checkout.alreadyStocked : ''
                      }`}
                </Text>
                {!free ? (
                  <Text style={{ fontSize: 14, fontWeight: '700', color: bb ? c.muted : c.danger }}>
                    {bb ? t().checkout.bestBefore(formatBestBefore(bb)) : t().checkout.missingDate}
                  </Text>
                ) : null}
              </View>
              <Text style={{ fontSize: 17, fontWeight: '700', color: p.estimated ? c.muted : c.text }}>
                {p.value === null ? t().common.noPrice : `${p.estimated ? '~' : ''}${money(p.value)}`}
              </Text>
            </Pressable>
          );
        })
      )}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 }}>
        <Text style={{ fontSize: 20, fontWeight: '800', color: c.text }}>{t().checkout.total}</Text>
        <Text style={{ fontSize: 20, fontWeight: '800', color: c.text }}>{formatBucket(cart, money)}</Text>
      </View>
      {cart.withoutPrice > 0 ? (
        <Text style={{ color: c.muted, marginTop: 4 }}>{cart.withoutPrice} article(s) sans prix</Text>
      ) : null}

      <View style={{ marginTop: 24 }}>
        <SectionLabel>{t().checkout.store}</SectionLabel>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Chip label={t().checkout.noStore} selected={locationId === null} onPress={() => setLocationId(null)} />
          {(meta?.shoppingLocations ?? []).map((l) => (
            <Chip key={l.id} label={l.name} selected={locationId === l.id} onPress={() => setLocationId(l.id)} />
          ))}
        </View>
      </View>
    </Sheet>
  );
}
