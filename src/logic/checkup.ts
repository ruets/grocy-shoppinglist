import { UF, type GrocyError, type NamedEntity } from '../api/grocy';

/** Userfields the app needs on Grocy's `shopping_list` entity. */
export const APP_USERFIELDS = [
  { name: UF.price, caption: 'Prix payé (app)', type: 'number-decimal' },
  { name: UF.bestBefore, caption: 'DLC (app)', type: 'date' },
  { name: UF.aisle, caption: 'Rayon (app)', type: 'number-integral' },
] as const;

export type AppUserfield = (typeof APP_USERFIELDS)[number];

export const USERFIELD_ENTITY = 'shopping_list';
export const DEFAULT_LIST_NAME = 'Liste de courses';

export type CheckStatus = 'ok' | 'warning' | 'missing' | 'error';

export type Fix =
  | { kind: 'createUserfields'; fields: AppUserfield[] }
  | { kind: 'createList' }
  | { kind: 'selectList'; listId: number; listName: string }
  | { kind: 'openSettings' };

export interface CheckResult {
  id: 'server' | 'version' | 'list' | 'userfields' | 'meta';
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
  locations: number;
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
  if (!input.server.ok) {
    const e = input.server.error;
    const label =
      e.kind === 'auth' ? 'Clé API refusée' : e.kind === 'timeout' || e.kind === 'network' ? 'Serveur injoignable' : 'Erreur Grocy';
    return [{ id: 'server', status: 'error', label, detail: e.message, fix: { kind: 'openSettings' } }];
  }

  const results: CheckResult[] = [{ id: 'server', status: 'ok', label: 'Serveur et clé API' }];

  const version = input.server.version;
  results.push(
    majorVersion(version) >= 4
      ? { id: 'version', status: 'ok', label: `Grocy ${version}` }
      : { id: 'version', status: 'warning', label: `Grocy ${version || 'version inconnue'}`, detail: 'Version 4.0 ou plus recommandée.' },
  );

  if (input.lists.length === 0) {
    results.push({ id: 'list', status: 'missing', label: 'Aucune liste de courses', fix: { kind: 'createList' } });
  } else {
    const selected = input.lists.find((l) => l.id === input.selectedListId);
    if (selected) {
      results.push({ id: 'list', status: 'ok', label: `Liste « ${selected.name} »` });
    } else {
      const first = input.lists[0];
      results.push({
        id: 'list',
        status: 'missing',
        label: input.selectedListId === null ? 'Aucune liste choisie' : 'Liste choisie introuvable',
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
      label: 'Champ Grocy de mauvais type',
      detail:
        wrongType.map((f) => `${f.name} devrait être « ${f.type} »`).join(', ') +
        '. Corrigez ou supprimez ce champ dans Grocy (Gérer les données → Champs personnalisés).',
    });
  } else if (missing.length > 0) {
    results.push({
      id: 'userfields',
      status: 'missing',
      label: 'Champs de l’app manquants',
      detail: missing.map((f) => f.caption).join(', '),
      fix: { kind: 'createUserfields', fields: [...missing] },
    });
  } else {
    results.push({ id: 'userfields', status: 'ok', label: 'Champs de l’app' });
  }

  results.push(
    input.locations > 0 && input.units > 0
      ? { id: 'meta', status: 'ok', label: 'Emplacements et unités' }
      : {
          id: 'meta',
          status: 'warning',
          label: 'Emplacement ou unité manquant',
          detail: 'Impossible de créer des produits depuis l’app tant qu’il n’y en a pas dans Grocy.',
        },
  );

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
  switch (fix.kind) {
    case 'createList':
      return `Créer la liste « ${DEFAULT_LIST_NAME} »`;
    case 'selectList':
      return `Utiliser la liste « ${fix.listName} »`;
    case 'createUserfields':
      return fix.fields.length === 1
        ? `Créer le champ ${fix.fields[0].caption}`
        : `Créer les champs ${fix.fields.map((f) => f.caption).join(', ')}`;
    case 'openSettings':
      return 'Ouvrir les réglages';
  }
}
