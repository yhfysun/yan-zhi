import { describe, expect, it } from 'vitest';
import {
  LEARNING_V2_READING_CATEGORIES,
  getLearningV2BookSources,
  getLearningV2ReadingCatalog,
} from './v2-library.js';

describe('Learning V2 reading library', () => {
  it('covers classics, zhiguai, authorized web novels, comics and course originals', () => {
    expect(LEARNING_V2_READING_CATEGORIES.map((category) => category.key)).toEqual([
      'classics',
      'zhiguai',
      'web-novel',
      'comics',
      'course',
    ]);
    expect(new Set(getLearningV2ReadingCatalog().map((entry) => entry.category))).toEqual(
      new Set(['classics', 'zhiguai', 'web-novel', 'comics']),
    );
  });

  it('keeps every built-in source https, licensed and referenced by the catalog', () => {
    const sources = getLearningV2BookSources();
    const sourceIds = new Set(sources.map((source) => source.id));

    expect(sources.length).toBeGreaterThanOrEqual(18);
    expect(new Set(sourceIds).size).toBe(sources.length);
    for (const source of sources) {
      expect(source.url, source.name).toMatch(/^https:\/\//);
      expect(source.license.trim(), source.name).not.toBe('');
      expect(source.description.trim(), source.name).not.toBe('');
    }
    for (const entry of getLearningV2ReadingCatalog()) {
      expect(sourceIds.has(entry.sourceId), entry.title).toBe(true);
      expect(entry.url).toMatch(/^https:\/\//);
      expect(entry.license.trim(), entry.title).not.toBe('');
    }
  });

  it('only lists official network novel platforms as authorized reading entries', () => {
    const officialHosts = new Set([
      'fanqienovel.com',
      'www.qidian.com',
      'www.qimao.com',
      'www.jjwxc.net',
    ]);
    const networkSources = getLearningV2BookSources()
      .filter((source) => source.category === 'web-novel');

    expect(networkSources.length).toBeGreaterThanOrEqual(4);
    for (const source of networkSources) {
      expect(source.access, source.name).toBe('authorized-platform');
      expect(officialHosts.has(new URL(source.url).hostname), source.name).toBe(true);
    }
  });
});
