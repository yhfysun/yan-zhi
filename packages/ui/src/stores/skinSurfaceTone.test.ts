import { describe, expect, it } from 'vitest';
import { clampSkinGlassAlpha, resolveSkinSurfaceTone } from './settings';

describe('skin surface tone', () => {
  it('keeps a dark image skin dark in light mode instead of washing it grey', () => {
    expect(resolveSkinSurfaceTone({
      themeDark: false,
      glass: '#0E1626',
      glassDark: '#0A101C',
    })).toBe('dark');
  });

  it('keeps genuinely light skins light in light mode', () => {
    expect(resolveSkinSurfaceTone({
      themeDark: false,
      glass: '#F0FAFD',
    })).toBe('light');
  });

  it('honours an explicitly dark artwork skin even when no glass colour is configured', () => {
    expect(resolveSkinSurfaceTone({
      themeDark: false,
      patternIsDark: true,
    })).toBe('dark');
  });

  it('always uses the dark surface branch in dark mode', () => {
    expect(resolveSkinSurfaceTone({
      themeDark: true,
      glass: '#FFF9F2',
    })).toBe('dark');
  });

  it('caps plugin glass opacity so the wallpaper remains fully visible', () => {
    expect(clampSkinGlassAlpha(0.78, false, 'surface')).toBe(0.2);
    expect(clampSkinGlassAlpha(0.55, true, 'surface')).toBe(0.18);
    expect(clampSkinGlassAlpha(0.72, false, 'panel')).toBe(0.18);
    expect(clampSkinGlassAlpha(0.30, true, 'small')).toBe(0.18);
  });
});
