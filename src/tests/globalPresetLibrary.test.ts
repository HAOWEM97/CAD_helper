import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  loadGlobalPresetLibrary,
  upsertGlobalCableSpec,
  upsertGlobalConnectionPointPreset,
  upsertGlobalDeviceTypePreset,
} from '@/services/presets/globalPresetLibrary';

function createLocalStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
  };
}

describe('global preset library', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('writes device and cable presets to browser storage', () => {
    const localStorage = createLocalStorageMock();
    vi.stubGlobal('window', { localStorage });

    upsertGlobalCableSpec({
      id: 'spec-a',
      model: 'CAT6',
      diameterText: '约 7.5',
      diameterMm: 7.5,
    });
    upsertGlobalConnectionPointPreset({
      id: 'connection-point-a',
      name: '主线',
      items: [
        {
          id: 'item-a',
          cableSpecId: 'spec-a',
          usage: '通信线',
          quantity: { mode: 'fixed', count: 1 },
          connectionHeightMm: 800,
        },
      ],
    });
    upsertGlobalDeviceTypePreset({
      id: 'device-type-a',
      deviceType: '主机',
      namePrefix: '主机',
      ports: [],
    });

    const library = loadGlobalPresetLibrary();
    expect(library.cableSpecs).toEqual([
      {
        id: 'spec-a',
        model: 'CAT6',
        diameterText: '约 7.5',
        diameterMm: 7.5,
      },
    ]);
    expect(library.connectionPointPresets).toHaveLength(1);
    expect(library.deviceTypePresets).toEqual([
      { id: 'device-type-a', deviceType: '主机', namePrefix: '主机', ports: [] },
    ]);
  });
});
