import { UF, type GrocyError, type NamedEntity } from '../api/grocy';
import { t } from '../i18n';

/**
 * Texts the app writes into Grocy (field captions, default list name). They
 * follow Grocy's own language (`LOCALE` in /system/config), not the phone's,
 * so every phone agrees: French when it starts with `fr`, English otherwise.
 */
const GROCY_TEXTS = {
  en: { price: 'Price paid (app)', bestBefore: 'Best before (app)', aisle: 'Aisle (app)', list: 'Shopping list' },
  fr: { price: 'Prix payé (app)', bestBefore: 'DLC (app)', aisle: 'Rayon (app)', list: 'Liste de courses' },
} as const;

function grocyTexts(grocyLocale: string) {
  return /^fr/i.test(grocyLocale) ? GROCY_TEXTS.fr : GROCY_TEXTS.en;
}

const FIELD_TYPES = [
  { key: 'price', name: UF.price, type: 'number-decimal' },
  { key: 'bestBefore', name: UF.bestBefore, type: 'date' },
  { key: 'aisle', name: UF.aisle, type: 'number-integral' },
] as const;

export interface AppUserfield {
  name: string;
  caption: string;
  type: string;
}

/** Userfields the app needs on Grocy's `shopping_list` entity, captioned in Grocy's language. */
export function appUserfields(grocyLocale: string): AppUserfield[] {
  const tx = grocyTexts(grocyLocale);
  return FIELD_TYPES.map((f) => ({ name: f.name, caption: tx[f.key], type: f.type }));
}

/** Name of the list the Doctor creates, in Grocy's language. */
export function defaultListName(grocyLocale: string): string {
  return grocyTexts(grocyLocale).list;
}

/** Every caption the app may have written, in any language (others are the user's own). */
const KNOWN_CAPTIONS = new Set<string>(
  Object.values(GROCY_TEXTS).flatMap((tx) => [tx.price, tx.bestBefore, tx.aisle]),
);

export const USERFIELD_ENTITY = 'shopping_list';

export type CheckStatus = 'ok' | 'warning' | 'missing' | 'error';

export type Fix =
  | { kind: 'createUserfields'; fields: AppUserfield[] }
  | { kind: 'renameUserfields'; fields: { id: number; name: string; caption: string }[] }
  | { kind: 'createList'; name: string }
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
  userfields: { id: number; entity: string; name: string; type: string; caption: string }[];
  locations: NamedEntity[];
  /** « Emplacement des nouveaux produits » setting (null = Grocy preset). */
  newProductLocationId: number | null;
  units: number;
  /** Grocy's `LOCALE` (e.g. 'en', 'fr'): language of what the app writes into Grocy. */
  grocyLocale: string;
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
    results.push({ id: 'list', status: 'missing', label: m.noList, fix: { kind: 'createList', name: defaultListName(input.grocyLocale) } });
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

  const wanted = appUserfields(input.grocyLocale);
  const mine = input.userfields.filter((f) => f.entity === USERFIELD_ENTITY);
  const toRename = wanted.flatMap((f) => {
    const cur = mine.find((x) => x.name === f.name);
    return cur && cur.caption !== f.caption && KNOWN_CAPTIONS.has(cur.caption)
      ? [{ id: cur.id, name: f.name, caption: f.caption }]
      : [];
  });
  const wrongType = wanted.filter((f) => mine.some((m) => m.name === f.name && m.type !== f.type));
  const missing = wanted.filter((f) => !mine.some((m) => m.name === f.name));
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
      fix: { kind: 'createUserfields', fields: missing },
    });
  } else if (toRename.length > 0) {
    results.push({
      id: 'userfields',
      status: 'warning',
      label: m.captionsOtherLanguage,
      detail: toRename.map((f) => f.caption).join(', '),
      fix: { kind: 'renameUserfields', fields: toRename },
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
      return m.fixCreateList(fix.name);
    case 'renameUserfields':
      return m.fixRenameFields(fix.fields.map((f) => f.caption).join(', '));
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
