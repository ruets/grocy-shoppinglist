import { UF, type GrocyError, type NamedEntity } from '../api/grocy';
import { t } from '../i18n';

/** Userfields the app needs on Grocy's `shopping_list` entity. Captions are stored in Grocy: English in every language. */
export const APP_USERFIELDS = [
  { name: UF.price, caption: 'Price paid (app)', type: 'number-decimal' },
  { name: UF.bestBefore, caption: 'Best before (app)', type: 'date' },
  { name: UF.aisle, caption: 'Aisle (app)', type: 'number-integral' },
] as const;

export type AppUserfield = (typeof APP_USERFIELDS)[number];

export const USERFIELD_ENTITY = 'shopping_list';
/** Name of the list the Doctor creates; stored in Grocy, so the same in every language. */
export const DEFAULT_LIST_NAME = 'Shopping list';

export type CheckStatus = 'ok' | 'warning' | 'missing' | 'error';

export type Fix =
  | { kind: 'createUserfields'; fields: AppUserfield[] }
  | { kind: 'createList' }
  | { kind: 'selectList'; listId: number; listName: string }
  | { kind: 'openSettings' };

export interface CheckResult {
  id: 'server' | 'version' | 'list' | 'userfields' | 'meta' | 'newProductLocation';
  status: CheckStatus;
  label: string;
  detail?: string;
  fix?: Fix;
}

export interface CheckupInput {
  server: { ok: true; version: string } | { ok: false; error: GrocyError };
  lists: NamedEntity[];
  selectedListId: number | null;
  userfields: { entity: string; name: string; type: string }[];
  locations: NamedEntity[];
  /** « Emplacement des nouveaux produits » setting (null = Grocy preset). */
  newProductLocationId: number | null;
  units: number;
}

function majorVersion(v: string): number {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Turns Grocy data into check results. Never changes anything: fixes are
 * only described here, and applied by the store after the user confirms.
 */
export function evaluateCheckup(input: CheckupInput): CheckResult[] {
  const m = t().checkup;
  if (!input.server.ok) {
    const e = input.server.error;
    const label =
      e.kind === 'auth' ? m.authRefused : e.kind === 'timeout' || e.kind === 'network' ? m.serverDown : m.grocyError;
    return [{ id: 'server', status: 'error', label, detail: e.message, fix: { kind: 'openSettings' } }];
  }

  const results: CheckResult[] = [{ id: 'server', status: 'ok', label: m.serverOk }];

  const version = input.server.version;
  results.push(
    majorVersion(version) >= 4
      ? { id: 'version', status: 'ok', label: m.version(version) }
      : { id: 'version', status: 'warning', label: m.version(version || m.unknownVersion), detail: m.versionHint },
  );

  if (input.lists.length === 0) {
    results.push({ id: 'list', status: 'missing', label: m.noList, fix: { kind: 'createList' } });
  } else {
    const selected = input.lists.find((l) => l.id === input.selectedListId);
    if (selected) {
      results.push({ id: 'list', status: 'ok', label: m.listOk(selected.name) });
    } else {
      const first = input.lists[0];
      results.push({
        id: 'list',
        status: 'missing',
        label: input.selectedListId === null ? m.noListChosen : m.listGone,
        fix: { kind: 'selectList', listId: first.id, listName: first.name },
      });
    }
  }

  const mine = input.userfields.filter((f) => f.entity === USERFIELD_ENTITY);
  const wrongType = APP_USERFIELDS.filter((f) => mine.some((m) => m.name === f.name && m.type !== f.type));
  const missing = APP_USERFIELDS.filter((f) => !mine.some((m) => m.name === f.name));
  if (wrongType.length > 0) {
    results.push({
      id: 'userfields',
      status: 'error',
      label: m.wrongType,
      detail: wrongType.map((f) => m.wrongTypeItem(f.name, f.type)).join(', ') + m.wrongTypeHint,
    });
  } else if (missing.length > 0) {
    results.push({
      id: 'userfields',
      status: 'missing',
      label: m.fieldsMissing,
      detail: missing.map((f) => f.caption).join(', '),
      fix: { kind: 'createUserfields', fields: [...missing] },
    });
  } else {
    results.push({ id: 'userfields', status: 'ok', label: m.fieldsOk });
  }

  results.push(
    input.locations.length > 0 && input.units > 0
      ? { id: 'meta', status: 'ok', label: m.metaOk }
      : {
          id: 'meta',
          status: 'warning',
          label: m.metaMissing,
          detail: m.metaMissingHint,
        },
  );

  if (input.newProductLocationId !== null) {
    const loc = input.locations.find((l) => l.id === input.newProductLocationId);
    results.push(
      loc
        ? { id: 'newProductLocation', status: 'ok', label: m.newLocOk(loc.name) }
        : {
            id: 'newProductLocation',
            status: 'warning',
            label: m.newLocGone,
            detail: m.newLocGoneHint,
          },
    );
  }

  return results;
}

export function isBlocking(results: CheckResult[]): boolean {
  return results.some((r) => r.status === 'missing' || r.status === 'error');
}

/**
 * Fixes offered behind « Réparer ». Nothing is offered while a check is in
 * error (the user must sort that out first, e.g. a field of the wrong type).
 */
export function pendingFixes(results: CheckResult[]): Fix[] {
  if (results.some((r) => r.status === 'error')) return [];
  return results.flatMap((r) => (r.fix && r.fix.kind !== 'openSettings' ? [r.fix] : []));
}

export function describeFix(fix: Fix): string {
  const m = t().checkup;
  switch (fix.kind) {
    case 'createList':
      return m.fixCreateList(DEFAULT_LIST_NAME);
    case 'selectList':
      return m.fixSelectList(fix.listName);
    case 'createUserfields':
      return fix.fields.length === 1
        ? m.fixCreateField(fix.fields[0].caption)
        : m.fixCreateFields(fix.fields.map((f) => f.caption).join(', '));
    case 'openSettings':
      return m.fixOpenSettings;
  }
}
