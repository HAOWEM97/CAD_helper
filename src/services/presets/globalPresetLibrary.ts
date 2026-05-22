import type {
  CableSpec,
  ConnectionPointPreset,
  DeviceTypePreset,
} from '@/domain/project/types';

const GLOBAL_PRESET_VERSION = 4;
const GLOBAL_PRESET_STORAGE_KEY = 'cad-router-web:global-presets:v4';
const LEGACY_GLOBAL_PRESET_STORAGE_KEYS = ['cad-router-web:global-presets:v3'];

export type GlobalPresetLibrary = {
  version: typeof GLOBAL_PRESET_VERSION;
  cableSpecs: CableSpec[];
  connectionPointPresets: ConnectionPointPreset[];
  deviceTypePresets: DeviceTypePreset[];
  updatedAt: string;
};

function normalizeCableSpec(spec: CableSpec & { usage?: string }): CableSpec {
  const { usage: _usage, ...nextSpec } = spec;
  return nextSpec;
}

function normalizeConnectionItems<T extends { items: Array<{ usage?: string }> }>(item: T): T {
  return item;
}

function storageIsAvailable() {
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    return typeof window.localStorage !== 'undefined';
  } catch {
    return false;
  }
}

function emptyLibrary(): GlobalPresetLibrary {
  return {
    version: GLOBAL_PRESET_VERSION,
    cableSpecs: [],
    connectionPointPresets: [],
    deviceTypePresets: [],
    updatedAt: '',
  };
}

function saveGlobalPresetLibrary(library: Omit<GlobalPresetLibrary, 'version' | 'updatedAt'>) {
  if (!storageIsAvailable()) {
    return;
  }

  const nextLibrary: GlobalPresetLibrary = {
    version: GLOBAL_PRESET_VERSION,
    ...library,
    updatedAt: new Date().toISOString(),
  };

  try {
    window.localStorage.setItem(GLOBAL_PRESET_STORAGE_KEY, JSON.stringify(nextLibrary));
  } catch {
    // 全局常用库只是便捷复用层；浏览器拒绝写入时不影响当前工程继续工作。
  }
}

export function loadGlobalPresetLibrary(): GlobalPresetLibrary {
  if (!storageIsAvailable()) {
    return emptyLibrary();
  }

  try {
    const raw =
      window.localStorage.getItem(GLOBAL_PRESET_STORAGE_KEY) ??
      LEGACY_GLOBAL_PRESET_STORAGE_KEYS.map((key) => window.localStorage.getItem(key)).find(
        Boolean,
      );
    if (!raw) {
      return emptyLibrary();
    }

    const parsed = JSON.parse(raw) as Partial<GlobalPresetLibrary>;
    if (parsed.version !== GLOBAL_PRESET_VERSION && parsed.version !== 3) {
      return emptyLibrary();
    }

    return {
      version: GLOBAL_PRESET_VERSION,
      cableSpecs: Array.isArray(parsed.cableSpecs)
        ? parsed.cableSpecs.map((spec) => normalizeCableSpec(spec as CableSpec & { usage?: string }))
        : [],
      connectionPointPresets: Array.isArray(parsed.connectionPointPresets)
        ? parsed.connectionPointPresets.map(normalizeConnectionItems)
        : [],
      deviceTypePresets: Array.isArray(parsed.deviceTypePresets)
        ? parsed.deviceTypePresets.map((preset) => ({
            ...preset,
            ports: preset.ports.map(normalizeConnectionItems),
          }))
        : [],
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
    };
  } catch {
    return emptyLibrary();
  }
}

export function upsertGlobalCableSpec(spec: CableSpec) {
  const library = loadGlobalPresetLibrary();
  const nextSpecs = [
    ...library.cableSpecs.filter((item) => item.model !== spec.model),
    spec,
  ];
  saveGlobalPresetLibrary({
    cableSpecs: nextSpecs,
    connectionPointPresets: library.connectionPointPresets,
    deviceTypePresets: library.deviceTypePresets,
  });
}

export function deleteGlobalCableSpec(specId: string) {
  const library = loadGlobalPresetLibrary();
  saveGlobalPresetLibrary({
    cableSpecs: library.cableSpecs.filter((spec) => spec.id !== specId),
    connectionPointPresets: library.connectionPointPresets,
    deviceTypePresets: library.deviceTypePresets,
  });
}

export function upsertGlobalConnectionPointPreset(preset: ConnectionPointPreset) {
  const library = loadGlobalPresetLibrary();
  const nextPresets = [
    ...library.connectionPointPresets.filter((item) => item.name !== preset.name),
    preset,
  ];
  saveGlobalPresetLibrary({
    cableSpecs: library.cableSpecs,
    connectionPointPresets: nextPresets,
    deviceTypePresets: library.deviceTypePresets,
  });
}

export function deleteGlobalConnectionPointPreset(presetId: string) {
  const library = loadGlobalPresetLibrary();
  saveGlobalPresetLibrary({
    cableSpecs: library.cableSpecs,
    connectionPointPresets: library.connectionPointPresets.filter(
      (preset) => preset.id !== presetId,
    ),
    deviceTypePresets: library.deviceTypePresets,
  });
}

export function upsertGlobalDeviceTypePreset(preset: DeviceTypePreset) {
  const library = loadGlobalPresetLibrary();
  const nextPresets = [
    ...library.deviceTypePresets.filter((item) => item.deviceType !== preset.deviceType),
    preset,
  ];
  saveGlobalPresetLibrary({
    cableSpecs: library.cableSpecs,
    connectionPointPresets: library.connectionPointPresets,
    deviceTypePresets: nextPresets,
  });
}

export function deleteGlobalDeviceTypePreset(presetId: string) {
  const library = loadGlobalPresetLibrary();
  saveGlobalPresetLibrary({
    cableSpecs: library.cableSpecs,
    connectionPointPresets: library.connectionPointPresets,
    deviceTypePresets: library.deviceTypePresets.filter((preset) => preset.id !== presetId),
  });
}
