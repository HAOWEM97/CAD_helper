import type {
  CableSpec,
  ConnectionPointPreset,
  DeviceTypePreset,
} from '@/domain/project/types';

const GLOBAL_PRESET_VERSION = 3;
const GLOBAL_PRESET_STORAGE_KEY = 'cad-router-web:global-presets:v3';

export type GlobalPresetLibrary = {
  version: typeof GLOBAL_PRESET_VERSION;
  cableSpecs: CableSpec[];
  connectionPointPresets: ConnectionPointPreset[];
  deviceTypePresets: DeviceTypePreset[];
  updatedAt: string;
};

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
    const raw = window.localStorage.getItem(GLOBAL_PRESET_STORAGE_KEY);
    if (!raw) {
      return emptyLibrary();
    }

    const parsed = JSON.parse(raw) as Partial<GlobalPresetLibrary>;
    if (parsed.version !== GLOBAL_PRESET_VERSION) {
      return emptyLibrary();
    }

    return {
      version: GLOBAL_PRESET_VERSION,
      cableSpecs: Array.isArray(parsed.cableSpecs) ? parsed.cableSpecs : [],
      connectionPointPresets: Array.isArray(parsed.connectionPointPresets)
        ? parsed.connectionPointPresets
        : [],
      deviceTypePresets: Array.isArray(parsed.deviceTypePresets) ? parsed.deviceTypePresets : [],
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
    };
  } catch {
    return emptyLibrary();
  }
}

export function upsertGlobalCableSpec(spec: CableSpec) {
  const library = loadGlobalPresetLibrary();
  const nextSpecs = [
    ...library.cableSpecs.filter(
      (item) => !(item.usage === spec.usage && item.model === spec.model),
    ),
    spec,
  ];
  saveGlobalPresetLibrary({
    cableSpecs: nextSpecs,
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
