import { GrocyError } from '../../api/grocy';
import {
  APP_USERFIELDS,
  describeFix,
  evaluateCheckup,
  isBlocking,
  pendingFixes,
  type CheckupInput,
} from '../checkup';

const allFields = APP_USERFIELDS.map((f) => ({ entity: 'shopping_list', name: f.name, type: f.type }));

const input = (p: Partial<CheckupInput> = {}): CheckupInput => ({
  server: { ok: true, version: '4.7.1' },
  lists: [{ id: 1, name: 'Courses' }],
  selectedListId: 1,
  userfields: allFields,
  locations: [
    { id: 1, name: 'Frigo' },
    { id: 4, name: 'À ranger' },
  ],
  newProductLocationId: null,
  units: 3,
  ...p,
});

const byId = (r: ReturnType<typeof evaluateCheckup>, id: string) => r.find((c) => c.id === id)!;

describe('evaluateCheckup', () => {
  it('all ok → nothing blocking, nothing to fix', () => {
    const r = evaluateCheckup(input());
    expect(r.every((c) => c.status === 'ok')).toBe(true);
    expect(isBlocking(r)).toBe(false);
    expect(pendingFixes(r)).toEqual([]);
  });

  it('old Grocy version is a warning only', () => {
    const r = evaluateCheckup(input({ server: { ok: true, version: '3.3.2' } }));
    expect(byId(r, 'version').status).toBe('warning');
    expect(isBlocking(r)).toBe(false);
  });

  it('no shopping list → missing, fix = create one', () => {
    const r = evaluateCheckup(input({ lists: [], selectedListId: null }));
    expect(byId(r, 'list').status).toBe('missing');
    expect(pendingFixes(r)).toContainEqual({ kind: 'createList' });
    expect(isBlocking(r)).toBe(true);
  });

  it('selected list gone → fix = select the first existing one', () => {
    const r = evaluateCheckup(input({ lists: [{ id: 4, name: 'A' }, { id: 7, name: 'B' }], selectedListId: 1 }));
    expect(byId(r, 'list').status).toBe('missing');
    expect(pendingFixes(r)).toContainEqual({ kind: 'selectList', listId: 4, listName: 'A' });
  });

  it('no list selected yet but lists exist → select the first', () => {
    const r = evaluateCheckup(input({ selectedListId: null }));
    expect(pendingFixes(r)).toContainEqual({ kind: 'selectList', listId: 1, listName: 'Courses' });
  });

  it('one field missing → fix creates only that field', () => {
    const r = evaluateCheckup(input({ userfields: allFields.filter((f) => f.name !== 'appdlc') }));
    expect(byId(r, 'userfields').status).toBe('missing');
    const fix = pendingFixes(r).find((f) => f.kind === 'createUserfields');
    expect(fix).toEqual({ kind: 'createUserfields', fields: APP_USERFIELDS.filter((f) => f.name === 'appdlc') });
  });

  it('field with the wrong type → error, no fix', () => {
    const fields = allFields.map((f) => (f.name === 'appprix' ? { ...f, type: 'text-single-line' } : f));
    const r = evaluateCheckup(input({ userfields: fields }));
    expect(byId(r, 'userfields').status).toBe('error');
    expect(byId(r, 'userfields').detail).toContain('appprix');
    expect(pendingFixes(r)).toEqual([]);
    expect(isBlocking(r)).toBe(true);
  });

  it('wrong type and another missing → error, missing one still not fixed automatically', () => {
    const fields = allFields
      .filter((f) => f.name !== 'apprayon')
      .map((f) => (f.name === 'appprix' ? { ...f, type: 'text-single-line' } : f));
    const r = evaluateCheckup(input({ userfields: fields }));
    expect(byId(r, 'userfields').status).toBe('error');
    expect(pendingFixes(r)).toEqual([]);
  });

  it('same name on another entity is ignored', () => {
    const r = evaluateCheckup(input({ userfields: allFields.map((f) => ({ ...f, entity: 'products' })) }));
    expect(byId(r, 'userfields').status).toBe('missing');
  });

  it('no location or unit → warning', () => {
    const r = evaluateCheckup(input({ locations: [] }));
    expect(byId(r, 'meta').status).toBe('warning');
    expect(isBlocking(r)).toBe(false);
  });

  it('no location chosen for new products → no row', () => {
    expect(evaluateCheckup(input()).some((c) => c.id === 'newProductLocation')).toBe(false);
  });

  it('chosen location for new products → ok row with its name', () => {
    const r = evaluateCheckup(input({ newProductLocationId: 4 }));
    expect(byId(r, 'newProductLocation')).toMatchObject({ status: 'ok', label: 'Nouveaux produits : « À ranger »' });
  });

  it('chosen location gone → warning, not blocking, nothing to fix', () => {
    const r = evaluateCheckup(input({ newProductLocationId: 99 }));
    expect(byId(r, 'newProductLocation')).toMatchObject({
      status: 'warning',
      label: 'Emplacement des nouveaux produits introuvable',
    });
    expect(isBlocking(r)).toBe(false);
    expect(pendingFixes(r)).toEqual([]);
  });

  it('server down → single error with openSettings', () => {
    const r = evaluateCheckup(input({ server: { ok: false, error: new GrocyError('x', null, 'network') } }));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: 'server', status: 'error', fix: { kind: 'openSettings' } });
    expect(r[0].label).toBe('Serveur injoignable');
    expect(pendingFixes(r)).toEqual([]);
    expect(isBlocking(r)).toBe(true);
  });

  it('auth error → « Clé API refusée »', () => {
    const r = evaluateCheckup(input({ server: { ok: false, error: new GrocyError('x', 401, 'auth') } }));
    expect(r[0].label).toBe('Clé API refusée');
  });
});

describe('describeFix', () => {
  it('describes each fix in French', () => {
    expect(describeFix({ kind: 'createList' })).toBe('Créer la liste « Liste de courses »');
    expect(describeFix({ kind: 'selectList', listId: 4, listName: 'A' })).toBe('Utiliser la liste « A »');
    expect(describeFix({ kind: 'createUserfields', fields: APP_USERFIELDS.slice(0, 2) })).toBe(
      'Créer les champs Prix payé (app), DLC (app)',
    );
    expect(describeFix({ kind: 'createUserfields', fields: APP_USERFIELDS.slice(0, 1) })).toBe(
      'Créer le champ Prix payé (app)',
    );
  });
});
