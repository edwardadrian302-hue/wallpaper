import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deleteImports, readLocal } from '../src/lib/storage.ts';
import { validatePreferences } from '../src/lib/model.ts';

test('renamed storage restores previous preferences and preserves current values', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values: Record<string, unknown> = {
    'previous.preferences.v1': JSON.stringify({ dailyCount: 48, sources: ['nasa'] }),
    'previous.favorites.v1': JSON.stringify(['local-photo']),
  };
  values.getItem = (key: string) => values[key] ?? null;
  values.setItem = (key: string, value: string) => { values[key] = value; };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: values });
  try {
    const settings = readLocal('chaoxi.preferences.v1', validatePreferences({}), validatePreferences);
    assert.equal(settings.dailyCount, 48);
    assert.deepEqual(settings.sources, ['nasa']);
    assert.ok(values['chaoxi.preferences.v1']);
    assert.ok(values['previous.preferences.v1']);
    assert.deepEqual(readLocal('chaoxi.favorites.v1', [], v => v as string[]), ['local-photo']);
    values['chaoxi.preferences.v1'] = JSON.stringify({ dailyCount: 12 });
    assert.equal(readLocal('chaoxi.preferences.v1', validatePreferences({}), validatePreferences).dailyCount, 12);
    values['previous.favorites.v1'] = '{broken';
    delete values['chaoxi.favorites.v1'];
    assert.deepEqual(readLocal('chaoxi.favorites.v1', [], v => v as string[]), []);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('import deletion waits for commit and reports aborted storage writes', async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  const deleted: string[] = [];
  let abort = false;
  const database = {
    name: 'chaoxi-wallpaper',
    transaction: (_store: string, mode: string) => {
      assert.equal(mode, 'readwrite');
      const tx = { objectStore: () => ({ delete: (id: string) => deleted.push(id) }), oncomplete: null as null | (() => void), onerror: null as null | (() => void), onabort: null as null | (() => void), error: new Error('storage aborted') };
      queueMicrotask(() => { if (abort) tx.onabort?.(); else tx.oncomplete?.(); });
      return tx;
    },
  };
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: {
    databases: async () => [],
    open: () => {
      const request = { result: database, onsuccess: null as null | (() => void) };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    },
  } });
  try {
    await deleteImports(['local-one', 'local-two']);
    assert.deepEqual(deleted, ['local-one', 'local-two']);
    abort = true;
    await assert.rejects(deleteImports(['local-three']), /storage aborted/);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'indexedDB', previous);
    else Reflect.deleteProperty(globalThis, 'indexedDB');
  }
});
