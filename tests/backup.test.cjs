const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const { File } = require('node:buffer');
const { test } = require('node:test');

const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const storageKey = 'butikk-huskeliste-v4';
const clone = value => JSON.parse(JSON.stringify(value));

// Run the actual inline application, including startup and render, with only browser
// APIs replaced. This tests data/handlers, not Safari's native picker or CSS layout.
function boot(initial = {}, navigator = {}) {
  const data = new Map(Object.entries(initial));
  const elements = new Map();
  const confirms = [];
  const writes = [];
  const urls = new Map();
  const revoked = [];
  function element(id) {
    if (elements.has(id)) return elements.get(id);
    const classes = new Set();
    const result = {
      value: '', innerHTML: '', textContent: '', hidden: false, disabled: false,
      files: [], dataset: {}, listeners: {}, clicks: 0,
      classList: {
        toggle(name, value) { if (value) classes.add(name); else classes.delete(name); },
        contains(name) { return classes.has(name); }
      },
      addEventListener(name, fn) { this.listeners[name] = fn; },
      querySelectorAll() { return []; },
      removeAttribute(name) { delete this[name]; },
      focus() {}, select() {},
      click() { this.clicks++; return this.listeners.click?.(); }
    };
    elements.set(id, result);
    return result;
  }
  const context = vm.createContext({
    console, File, Blob, navigator,
    URL: {
      createObjectURL(file) { const url = 'blob:test-' + urls.size; urls.set(url, file); return url; },
      revokeObjectURL(url) { revoked.push(url); }
    },
    localStorage: {
      getItem(key) { return data.get(key) ?? null; },
      setItem(key, value) { writes.push([key, value]); data.set(key, value); },
      removeItem(key) { data.delete(key); }
    },
    document: {
      querySelector(selector) {
        assert.ok(selector.startsWith('#') && html.includes('id="' + selector.slice(1) + '"'), selector);
        return element(selector.slice(1));
      },
      querySelectorAll() { return []; },
      body: element('body')
    },
    location: { protocol: 'https:' },
    setTimeout(fn) { fn(); },
    addEventListener() {},
    confirm(message) { confirms.push(message); return context.confirmResult; },
    alert() {}, confirmResult: true
  });
  context.window = context;
  vm.runInContext(script, context, { filename: 'index.html' });
  return Object.assign(context, { data, elements, confirms, writes, urls, revoked });
}

// A complete v4 snapshot independent of the backup implementation. Deliberately
// non-sequential order values and reversed array order catch accidental sorting,
// normalizing or merging during import/reload.
function fixture() {
  return {
    activeStoreId: 'custom-naerbutikk', unitDefaultsVersion: 2, priceSeedVersion: 20260701,
    globalUnits: { 'eple': 'kg', 'juice': 'stk', 'egne skruer': 'stk', 'smør & ost <test>': 'kg' },
    stores: {
      'rema1000-industriveien': {
        id: 'rema1000-industriveien', name: 'Rema1000 Industriveien', hidePicked: false,
        categories: [{ id: 'rema-frukt', name: 'Frukt', expanded: true, order: 3, items: [
          { id: 'rema-eple', name: 'Eple', note: 'Røde', unit: 'kg', price: 12.75, needed: true, picked: true, order: 2 }
        ] }]
      },
      'custom-naerbutikk': {
        id: 'custom-naerbutikk', name: 'Nærbutikk ÆØÅ', custom: true, hidePicked: true,
        priceUpdatedAt: 'Egen dato', priceSource: 'Egne priser', priceUpdateNote: 'Tilbud', priceDisplayText: 'Mitt prisgrunnlag',
        categories: [
          { id: 'egne-drikk', name: 'Drikke', expanded: true, order: 8, items: [
            { id: 'egne-juice', name: 'Juice', note: 'Uten fruktkjøtt 🧃', unit: 'stk', price: 27.95, needed: false, picked: false, order: 4 }
          ] },
          { id: 'egne-annet', name: 'Egen kategori', expanded: true, order: 1, items: [
            { id: 'egne-skruer', name: 'Egne skruer', note: '', unit: 'stk', price: 0, needed: true, picked: true, order: 7 },
            { id: 'egne-ost', name: 'Smør & ost <test>', note: '1/2 kg', unit: 'kg', price: 123.45, needed: true, picked: false, order: 2 }
          ] },
          { id: 'egne-tom', name: 'Tom kategori', expanded: false, order: 15, items: [] }
        ]
      },
      'custom-tom': { id: 'custom-tom', name: 'Tom butikk', custom: true, hidePicked: false, categories: [] }
    }
  };
}

function envelope(state = fixture()) {
  return { format: 'handleliste-backup', version: 1, exportedAt: '2026-10-22T10:00:00.000Z', state };
}
function backupFile(value = envelope()) {
  return new File([typeof value === 'string' ? value : JSON.stringify(value)], 'backup.json', { type: 'application/json' });
}
function savedApp() { return boot({ [storageKey]: JSON.stringify(fixture()) }); }
function status(app) { return app.elements.get('backupStatus').textContent; }
function checkUnchanged(app, before) {
  assert.deepEqual(clone(app.state), before);
  assert.deepEqual(JSON.parse(app.data.get(storageKey)), before);
  assert.equal(app.writes.length, 0);
}

test('export → import → reload preserves every property, deletion and order', async () => {
  const source = savedApp();
  const expected = fixture();
  assert.deepEqual(clone(source.state), expected, 'existing v4 must load unchanged');
  const file = source.createBackupFile();
  assert.equal(file.type, 'application/json');
  assert.match(file.name, /^handleliste-sikkerhetskopi-.*\.json$/);
  const exported = JSON.parse(await file.text());
  assert.deepEqual(exported.state, expected);
  const destination = boot();
  destination.data.set('unrelated-app', 'keep me');
  await destination.importBackup(file);
  assert.equal(destination.confirms.length, 1);
  assert.match(destination.confirms[0], /3 butikker, 4 kategorier og 4 varer/);
  assert.equal(destination.writes.length, 1);
  assert.deepEqual(clone(destination.state), expected);
  assert.deepEqual(JSON.parse(destination.data.get(storageKey)), expected);
  assert.equal(destination.data.get('unrelated-app'), 'keep me');
  const restarted = boot(Object.fromEntries(destination.data));
  assert.deepEqual(clone(restarted.state), expected);
  assert.deepEqual(JSON.parse(await restarted.createBackupFile().text()).state, expected);
  const order = restarted.elements.get('orderList').innerHTML;
  assert.ok(order.indexOf('data-category-id="egne-annet"') < order.indexOf('data-category-id="egne-drikk"'));
  assert.ok(order.indexOf('data-item-id="egne-ost"') < order.indexOf('data-item-id="egne-skruer"'));
  assert.match(restarted.elements.get('editList').innerHTML, /Smør &amp; ost &lt;test&gt;/);
  assert.equal(restarted.state.stores['rema1000-industriveien'].categories[0].items.length, 1, 'deleted preset items stay deleted');
  assert.equal(restarted.state.globalUnits.juice, 'stk', 'custom liquid unit is preserved');
  assert.match(status(destination), /gjenopprettet/);
});

test('cancelling the confirmation leaves storage and the current session untouched', async () => {
  const app = savedApp();
  app.confirmResult = false;
  const backup = envelope();
  backup.state.activeStoreId = 'custom-tom';
  await app.importBackup(backupFile(backup));
  checkUnchanged(app, fixture());
  assert.equal(app.confirms.length, 1);
  assert.match(status(app), /avbrutt/);
});

test('quota and storage security errors never replace the old state', async () => {
  for (const name of ['QuotaExceededError', 'SecurityError']) {
    const app = savedApp();
    app.localStorage.setItem = () => { throw Object.assign(new Error('blocked'), { name }); };
    await app.importBackup(backupFile());
    checkUnchanged(app, fixture());
    assert.match(status(app), /Ingen data er endret/);
    assert.equal(app.elements.get('importBackup').disabled, false);
  }
});

const invalidCases = {
  'wrong app': b => { b.format = 'other-app'; },
  'future version': b => { b.version = 2; },
  'missing timestamp': b => { delete b.exportedAt; },
  'invalid date': b => { b.exportedAt = 'yesterday'; },
  'missing stores': b => { delete b.state.stores; },
  'empty stores': b => { b.state.stores = {}; },
  'array instead of stores': b => { b.state.stores = []; },
  'unknown active store': b => { b.state.activeStoreId = 'missing'; },
  'mismatched store ID': b => { b.state.stores['custom-tom'].id = 'other'; },
  'string instead of boolean': b => { b.state.stores['custom-tom'].hidePicked = 'false'; },
  'missing setting': b => { delete b.state.globalUnits; },
  'unknown property': b => { b.state.newSetting = 'unsupported'; },
  'missing item field': b => { delete b.state.stores['custom-naerbutikk'].categories[0].items[0].picked; },
  'negative price': b => { b.state.stores['custom-naerbutikk'].categories[0].items[0].price = -1; },
  'string price': b => { b.state.stores['custom-naerbutikk'].categories[0].items[0].price = '12.5'; },
  'null price': b => { b.state.stores['custom-naerbutikk'].categories[0].items[0].price = null; },
  'invalid unit': b => { b.state.stores['custom-naerbutikk'].categories[0].items[0].unit = 'box'; },
  'conflicting global unit': b => { b.state.globalUnits.juice = 'liter'; },
  'missing global unit': b => { delete b.state.globalUnits.juice; },
  'negative order': b => { b.state.stores['custom-naerbutikk'].categories[0].order = -1; },
  'fractional order': b => { b.state.stores['custom-naerbutikk'].categories[0].order = 1.5; },
  'duplicate category ID': b => { const c = b.state.stores['custom-naerbutikk'].categories; c[1].id = c[0].id; },
  'duplicate item ID across categories': b => { const c = b.state.stores['custom-naerbutikk'].categories; c[1].items[0].id = c[0].items[0].id; },
  'HTML in ID': b => { b.state.stores['custom-naerbutikk'].categories[0].id = 'x" onclick="alert(1)'; },
  'prototype key': b => { Object.defineProperty(b.state.stores, '__proto__', { value: {}, enumerable: true }); },
  'constructor key': b => { b.state.globalUnits.constructor = 'stk'; },
  'nested prototype key': b => { b.state.stores['custom-naerbutikk'].categories[0].prototype = {}; }
};

for (const [name, change] of Object.entries(invalidCases)) {
  test('invalid import rejected before confirmation: ' + name, async () => {
    const app = savedApp();
    const backup = envelope();
    change(backup);
    await app.importBackup(backupFile(backup));
    checkUnchanged(app, fixture());
    assert.equal(app.confirms.length, 0);
    assert.ok(app.elements.get('backupStatus').classList.contains('is-error'));
  });
}

test('malformed JSON, overflow, text share and oversized/unreadable files are harmless', async () => {
  const malformed = ['{bad', 'null', '[]', savedApp().buildShareText(), JSON.stringify(envelope()).replace('27.95', '1e400')];
  const files = malformed.map(backupFile).concat([
    new File([], 'empty.json'),
    { size: 10 * 1024 * 1024 + 1, text() { throw new Error('must not read oversized file'); } },
    { size: 50, async text() { throw new Error('Kunne ikke lese filen.'); } }
  ]);
  for (const file of files) {
    const app = savedApp();
    await app.importBackup(file);
    checkUnchanged(app, fixture());
    assert.equal(app.confirms.length, 0);
    assert.match(status(app), /Kunne ikke gjenopprette/);
  }
});

test('UTF-8 BOM and a file with no MIME type can be imported', async () => {
  const app = boot();
  await app.importBackup(new File(['\uFEFF' + JSON.stringify(envelope())], 'copy.json'));
  assert.deepEqual(clone(app.state), fixture());
});

test('file input resets after success, failure and cancellation, allowing the same file again', async () => {
  const app = savedApp();
  const input = app.elements.get('backupFile');
  for (const [file, confirm] of [[backupFile('{bad'), true], [backupFile(), false], [backupFile(), true]]) {
    input.value = 'backup.json'; input.files = [file]; app.confirmResult = confirm;
    await input.listeners.change();
    assert.equal(input.value, '');
    assert.equal(app.backupBusy, false);
  }
  app.elements.get('importBackup').click();
  assert.equal(input.clicks, 1);
});

test('native file share receives the whole JSON file during the click handler', async () => {
  let shared;
  const app = boot({ [storageKey]: JSON.stringify(fixture()) }, {
    canShare(data) { assert.equal(data.files[0].type, 'application/json'); return true; },
    share(data) { shared = data; return Promise.resolve(); }
  });
  const completion = app.elements.get('exportBackup').click();
  assert.ok(shared, 'share must run synchronously before losing iOS user activation');
  await completion;
  assert.deepEqual(JSON.parse(await shared.files[0].text()).state, fixture());
  assert.equal(app.urls.size, 0);
  assert.match(status(app), /Kontroller/);
  checkUnchanged(app, fixture());
});

test('native share cancellation does not start an unwanted download', async () => {
  const app = boot({}, { canShare: () => true, share: async () => { throw { name: 'AbortError' }; } });
  await app.exportBackup();
  assert.equal(app.urls.size, 0);
  assert.equal(app.elements.get('downloadBackup').clicks, 0);
  assert.match(status(app), /avbrutt/);
});

test('unsupported file sharing and errors provide a working JSON download', async () => {
  for (const navigator of [{}, { canShare: () => false, share() {} }, { canShare() { throw new Error(); }, share() {} }]) {
    const app = savedApp();
    app.navigator = navigator;
    await app.exportBackup();
    const link = app.elements.get('downloadBackup');
    assert.equal(link.hidden, false);
    assert.equal(link.clicks, 1);
    assert.match(link.download, /\.json$/);
    assert.deepEqual(JSON.parse(await app.urls.get(link.href).text()).state, fixture());
    const oldURL = link.href;
    await app.exportBackup();
    assert.ok(app.revoked.includes(oldURL));
  }
  const app = boot({}, { canShare: () => true, share: async () => { throw { name: 'NotAllowedError' }; } });
  await app.exportBackup();
  assert.equal(app.elements.get('downloadBackup').hidden, false);
  assert.equal(app.elements.get('downloadBackup').clicks, 0, 'async failure needs a new user tap');
});

test('only one backup operation may run while a file is being read', async () => {
  const app = savedApp();
  let finishRead;
  const reading = app.importBackup({ size: 123, text: () => new Promise(resolve => { finishRead = resolve; }) });
  assert.equal(app.backupBusy, true);
  await app.exportBackup();
  await app.importBackup(backupFile());
  assert.equal(app.urls.size, 0);
  assert.equal(app.confirms.length, 0);
  finishRead(JSON.stringify(envelope()));
  await reading;
  assert.equal(app.confirms.length, 1);
  assert.equal(app.backupBusy, false);
});

test('new-install defaults remain exportable and round-trip exactly', async () => {
  const app = boot();
  const initial = clone(app.state);
  assert.ok(Object.keys(initial.stores).length > 1);
  await app.importBackup(app.createBackupFile());
  assert.deepEqual(clone(app.state), initial);
});

test('v2, v3 and older v4 shapes still migrate and can then be backed up', async () => {
  const legacy = { hidePicked: true, items: [{ name: 'Frukt', order: 0, needed: true, picked: true }] };
  for (const key of ['butikk-huskeliste-v2', 'butikk-huskeliste-v3']) {
    const old = key.endsWith('v2') ? legacy : { activeStoreId: 'rema1000-industriveien', stores: { 'rema1000-industriveien': legacy } };
    const app = boot({ [key]: JSON.stringify(old) });
    const current = clone(app.state);
    assert.equal(current.stores['rema1000-industriveien'].hidePicked, true);
    assert.ok(current.stores['rema1000-industriveien'].categories.some(c => c.items.some(i => i.picked)));
    const file = app.createBackupFile();
    await app.importBackup(file);
    assert.deepEqual(clone(app.state), current);
    assert.equal(app.data.get(key), JSON.stringify(old), 'legacy storage is retained');
  }
  const older = fixture();
  delete older.unitDefaultsVersion;
  delete older.priceSeedVersion;
  const app = boot({ [storageKey]: JSON.stringify(older) });
  assert.equal(app.state.activeStoreId, older.activeStoreId);
  assert.ok(app.state.stores['custom-naerbutikk'].categories.some(c => c.items.some(i => i.name === 'Egne skruer')));
  assert.ok(app.createBackupFile().size > 0);
});

test('shopping, text sharing, store switching and order editing work after restore', async () => {
  const app = boot();
  await app.importBackup(backupFile());
  assert.match(app.buildShareText(), /Smør & ost <test>/);
  assert.doesNotMatch(app.buildShareText(), /Egne skruer/);
  app.togglePicked('egne-ost');
  assert.equal(app.findItem('egne-ost').picked, true);
  app.moveCategory('egne-drikk', -1);
  assert.equal(app.sortedCategories()[0].id, 'egne-drikk');
  app.moveItem('egne-annet', 'egne-skruer', -1);
  assert.equal(app.sortedCategoryItems(app.findCategory('egne-annet'))[0].id, 'egne-skruer');
  app.elements.get('storeSelect').value = 'custom-tom';
  app.elements.get('storeSelect').listeners.change();
  assert.equal(app.state.activeStoreId, 'custom-tom');
  assert.match(app.elements.get('shoppingList').innerHTML, /Ingen varer ennå/);
  app.addCategory('Ny kategori');
  app.addProductToCategory(app.sortedCategories()[0].id, 'Ny vare', '29,90', 'kg');
  assert.equal(app.allItems(app.activeStore())[0].price, 29.9);
  const saved = clone(app.state);
  assert.deepEqual(clone(boot(Object.fromEntries(app.data)).state), saved);
});
