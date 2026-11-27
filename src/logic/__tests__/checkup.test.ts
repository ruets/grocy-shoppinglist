import { GrocyError } from '../../api/grocy';
import {
  appUserfields,
  defaultListName,
  describeFix,
  evaluateCheckup,
  isBlocking,
  pendingFixes,
  type CheckupInput,
} from '../checkup';

const EN = appUserfields('en');
const allFields = EN.map((f, i) => ({ id: 20 + i, entity: 'shopping_list', name: f.name, type: f.type, caption: f.caption }));

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
  grocyLocale: 'en',
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
    expect(pendingFixes(r)).toContainEqual({ kind: 'createList', name: 'Shopping list' });
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
    const r = evaluateCheckup(input({ userfields: allFields.filter((f) => f.name !== 'appbestbefore') }));
    expect(byId(r, 'userfields').status).toBe('missing');
    const fix = pendingFixes(r).find((f) => f.kind === 'createUserfields');
    expect(fix).toEqual({ kind: 'createUserfields', fields: EN.filter((f) => f.name === 'appbestbefore') });
  });

  it('field with the wrong type → error, no fix', () => {
    const fields = allFields.map((f) => (f.name === 'appprice' ? { ...f, type: 'text-single-line' } : f));
    const r = evaluateCheckup(input({ userfields: fields }));
    expect(byId(r, 'userfields').status).toBe('error');
    expect(byId(r, 'userfields').detail).toContain('appprice');
    expect(pendingFixes(r)).toEqual([]);
    expect(isBlocking(r)).toBe(true);
  });

  it('wrong type and another missing → error, missing one still not fixed automatically', () => {
    const fields = allFields
      .filter((f) => f.name !== 'appaisle')
      .map((f) => (f.name === 'appprice' ? { ...f, type: 'text-single-line' } : f));
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

  it('Grocy in French → new list and missing fields get French names', () => {
    const r = evaluateCheckup(input({ grocyLocale: 'fr', lists: [], selectedListId: null, userfields: [] }));
    expect(pendingFixes(r)).toEqual([
      { kind: 'createList', name: 'Liste de courses' },
      { kind: 'createUserfields', fields: appUserfields('fr') },
    ]);
  });

  it('captions in another language than Grocy → warning, fix renames them', () => {
    const r = evaluateCheckup(input({ grocyLocale: 'fr_FR' }));
    expect(byId(r, 'userfields').status).toBe('warning');
    expect(isBlocking(r)).toBe(false);
    expect(pendingFixes(r)).toEqual([
      {
        kind: 'renameUserfields',
        fields: [
          { id: 20, name: 'appprice', caption: 'Prix payé (app)' },
          { id: 21, name: 'appbestbefore', caption: 'DLC (app)' },
          { id: 22, name: 'appaisle', caption: 'Rayon (app)' },
        ],
      },
    ]);
  });

  it('a caption the user wrote is left alone', () => {
    const fields = allFields.map((f) => (f.name === 'appprice' ? { ...f, caption: 'Mon prix' } : f));
    const r = evaluateCheckup(input({ grocyLocale: 'fr', userfields: fields }));
    const fix = pendingFixes(r).find((f) => f.kind === 'renameUserfields');
    expect(fix && fix.kind === 'renameUserfields' && fix.fields.map((f) => f.name)).toEqual(['appbestbefore', 'appaisle']);
  });

  it('captions already in Grocy language → ok', () => {
    const fr = appUserfields('fr').map((f, i) => ({ ...allFields[i], caption: f.caption }));
    const r = evaluateCheckup(input({ grocyLocale: 'fr', userfields: fr }));
    expect(byId(r, 'userfields').status).toBe('ok');
    expect(pendingFixes(r)).toEqual([]);
  });

  it('auth error → « Clé API refusée »', () => {
    const r = evaluateCheckup(input({ server: { ok: false, error: new GrocyError('x', 401, 'auth') } }));
    expect(r[0].label).toBe('Clé API refusée');
  });
});

describe('describeFix', () => {
  it('Grocy language: fr* → French, anything else → English', () => {
    expect(defaultListName('fr')).toBe('Liste de courses');
    expect(defaultListName('fr_CA')).toBe('Liste de courses');
    expect(defaultListName('de')).toBe('Shopping list');
    expect(defaultListName('')).toBe('Shopping list');
    expect(appUserfields('fr').map((f) => f.caption)).toEqual(['Prix payé (app)', 'DLC (app)', 'Rayon (app)']);
  });

  it('describes each fix in French', () => {
    expect(describeFix({ kind: 'createList', name: 'Shopping list' })).toBe('Créer la liste « Shopping list »');
    expect(
      describeFix({ kind: 'renameUserfields', fields: [{ id: 1, name: 'appprice', caption: 'Prix payé (app)' }] }),
    ).toBe('Renommer les champs en Prix payé (app)');
    expect(describeFix({ kind: 'selectList', listId: 4, listName: 'A' })).toBe('Utiliser la liste « A »');
    expect(describeFix({ kind: 'createUserfields', fields: EN.slice(0, 2) })).toBe(
      'Créer les champs Price paid (app), Best before (app)',
    );
    expect(describeFix({ kind: 'createUserfields', fields: EN.slice(0, 1) })).toBe(
      'Créer le champ Price paid (app)',
    );
  });
});
