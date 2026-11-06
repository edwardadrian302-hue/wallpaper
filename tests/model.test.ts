import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PREFERENCES, LIBRARY_PAGE_SIZE, dailySelection, dateKey, filterWallpapers, nextWallpaper, paginate, validatePreferences, type Wallpaper } from '../src/lib/model.ts';

const images: Wallpaper[] = Array.from({ length: 16 }, (_, i) => ({ id: 'image-' + i, title: i === 0 ? '山间晨光' : '风景' + i, category: i % 2 ? '海岸' : '山野', src: '/image.jpg', width: 1920, height: 1080, author: i === 0 ? 'Example Artist' : '摄影师', license: 'CC0', bytes: 1024, addedAt: '2026-11-06', kind: i === 15 ? 'import' : 'sample' }));

test('daily picks remain stable across restarts and catalog ordering, with no duplicates', () => {
  const expected = dailySelection(images, '2026-11-06', 6).map(w => w.id);
  assert.equal(new Set(expected).size, 6);
  assert.deepEqual(dailySelection([...images].reverse(), '2026-11-06', 6).map(w => w.id), expected);
  assert.notDeepEqual(dailySelection(images, '2026-11-07', 6).map(w => w.id), expected);
  assert.deepEqual(dailySelection([], '2026-11-06'), []);
  assert.equal(dailySelection(images.slice(0, 2), '2026-11-06', 20).length, 2);
});
test('date keys use local calendar fields', () => {
  assert.equal(dateKey(new Date(2026, 0, 2, 0, 1)), '2026-01-02');
});
test('search combines classification with title or author, and local filter selects imports', () => {
  assert.deepEqual(filterWallpapers(images, '山野', '山间').map(w => w.id), ['image-0']);
  assert.deepEqual(filterWallpapers(images, '海岸', '山间'), []);
  assert.deepEqual(filterWallpapers(images, '全部', ' example artist ').map(w => w.id), ['image-0']);
  assert.deepEqual(filterWallpapers(images, '本地', '').map(w => w.id), ['image-15']);
});
test('rotation avoids current and recent wallpapers, and handles empty or exhausted favorites', () => {
  assert.equal(nextWallpaper(images.slice(0, 4), 'image-0', ['image-1', 'image-2'])?.id, 'image-3');
  assert.equal(nextWallpaper(images.slice(0, 2), 'image-0', ['image-0', 'image-1'])?.id, 'image-1');
  assert.equal(nextWallpaper([images[0]], 'image-0', ['image-0'])?.id, 'image-0');
  assert.equal(nextWallpaper([], null, []), undefined);
});
test('corrupted settings cannot enable rotation or inject invalid intervals', () => {
  assert.deepEqual(validatePreferences(null), validatePreferences({}));
  const settings = validatePreferences({ rotation: 'true', interval: -1, fit: 'stretch', dailyCount: 100000, reducedMotion: true });
  assert.equal(settings.rotation, false);
  assert.equal(settings.interval, 60);
  assert.equal(settings.fit, 'fill');
  assert.equal(settings.dailyCount, 24);
  assert.equal(settings.reducedMotion, true);
});

test('daily default is 24 and old 10-image settings migrate without losing other preferences', () => {
  assert.equal(DEFAULT_PREFERENCES.dailyCount, 24);
  const settings = validatePreferences({ dailyCount: 10, favoritesOnly: true, fit: 'fit', interval: 30 });
  assert.equal(settings.dailyCount, 24);
  assert.equal(settings.favoritesOnly, true);
  assert.equal(settings.fit, 'fit');
  assert.equal(settings.interval, 30);
  assert.equal(validatePreferences({ dailyCount: 48 }).dailyCount, 48);
  const collection = Array.from({ length: 30 }, (_, index) => ({ ...images[0], id: String(index) }));
  assert.equal(dailySelection(collection, '2026-11-06').length, 24);
});

test('24 wallpapers span exactly two disjoint pages of 12', () => {
  assert.equal(LIBRARY_PAGE_SIZE, 12);
  const items = Array.from({ length: 24 }, (_, i) => i);
  const first = paginate(items, 1), second = paginate(items, 2);
  assert.equal(first.totalPages, 2);
  assert.equal(first.items.length, 12);
  assert.equal(second.items.length, 12);
  assert.deepEqual([first.start, first.end, second.start, second.end], [1, 12, 13, 24]);
  assert.deepEqual([...first.items, ...second.items], items);
});

test('pagination handles the last partial page, empty searches and collection shrinkage', () => {
  const items = Array.from({ length: 25 }, (_, i) => i);
  assert.deepEqual(paginate(items, 3).items, [24]);
  assert.equal(paginate(items, 99).page, 3);
  assert.equal(paginate(items.slice(0, 5), 3).page, 1);
  assert.deepEqual(paginate([], 3), { items: [], page: 1, totalPages: 1, start: 0, end: 0 });
  assert.equal(paginate(items, NaN).page, 1);
  assert.equal(paginate(items, -2).page, 1);
});
