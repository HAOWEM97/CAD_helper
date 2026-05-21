import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  loadGlobalPresetLibrary,
  upsertGlobalCableBundlePreset,
  upsertGlobalCableSpec,
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
      usage: '通信线',
      model: 'CAT6',
      diameterText: '约 7.5',
      diameterMm: 7.5,
    });
    upsertGlobalCableBundlePreset({
      id: 'bundle-a',
      name: '主线',
      items: [
        {
          id: 'item-a',
          cableSpecId: 'spec-a',
          usage: '通信线',
          model: 'CAT6',
          quantity: { mode: 'fixed', count: 1 },
          diameterMm: 7.5,
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
        usage: '通信线',
        model: 'CAT6',
        diameterText: '约 7.5',
        diameterMm: 7.5,
      },
    ]);
    expect(library.cableBundlePresets).toHaveLength(1);
    expect(library.deviceTypePresets).toEqual([
      { id: 'device-type-a', deviceType: '主机', namePrefix: '主机', ports: [] },
    ]);
  });
});
