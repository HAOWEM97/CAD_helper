import type { Project, WorkflowStep } from '@/domain/project/types';
import type { TopologyToolMode, UiState } from '@/state/slices/uiSlice';

const DRAFT_VERSION = 1;
const DRAFT_STORAGE_KEY = 'cad-router-web:draft:v1';
const DRAFT_DB_NAME = 'cad-router-web-draft';
const DRAFT_DB_VERSION = 1;
const ASSET_STORE_NAME = 'assets';
const BASE_IMAGE_KEY = 'base-image';

const workflowSteps = new Set<WorkflowStep>([
  'calibration',
  'drawing',
  'devices',
  'routing',
  'quantity',
  'export',
]);

const topologyToolModes = new Set<TopologyToolMode>(['draw', 'select']);

export type PersistedUiState = Pick<
  UiState,
  | 'activeStep'
  | 'topologyToolMode'
  | 'leftPanelCollapsed'
  | 'rightPanelCollapsed'
  | 'orthogonalLock'
  | 'snappingEnabled'
  | 'layerVisibility'
>;

export type PersistedDraft = {
  version: typeof DRAFT_VERSION;
  savedAt: string;
  project: Project;
  ui: PersistedUiState;
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

function indexedDbIsAvailable() {
  try {
    return typeof indexedDB !== 'undefined';
  } catch {
    return false;
  }
}

function booleanOrFallback(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

export function pickPersistableUiState(ui: UiState): PersistedUiState {
  return {
    activeStep: ui.activeStep,
    topologyToolMode: ui.topologyToolMode,
    leftPanelCollapsed: ui.leftPanelCollapsed,
    rightPanelCollapsed: ui.rightPanelCollapsed,
    orthogonalLock: ui.orthogonalLock,
    snappingEnabled: ui.snappingEnabled,
    layerVisibility: ui.layerVisibility,
  };
}

export function createUiStateFromPersisted(
  persisted: Partial<PersistedUiState> | undefined,
  fallback: UiState,
): UiState {
  return {
    ...fallback,
    activeStep:
      persisted?.activeStep && workflowSteps.has(persisted.activeStep)
        ? persisted.activeStep
        : fallback.activeStep,
    topologyToolMode:
      persisted?.topologyToolMode && topologyToolModes.has(persisted.topologyToolMode)
        ? persisted.topologyToolMode
        : fallback.topologyToolMode,
    leftPanelCollapsed: booleanOrFallback(
      persisted?.leftPanelCollapsed,
      fallback.leftPanelCollapsed,
    ),
    rightPanelCollapsed: booleanOrFallback(
      persisted?.rightPanelCollapsed,
      fallback.rightPanelCollapsed,
    ),
    orthogonalLock: booleanOrFallback(persisted?.orthogonalLock, fallback.orthogonalLock),
    snappingEnabled: booleanOrFallback(persisted?.snappingEnabled, fallback.snappingEnabled),
    layerVisibility: {
      ...fallback.layerVisibility,
      ...(persisted?.layerVisibility ?? {}),
    },
  };
}

export function loadPersistedDraft(): PersistedDraft | null {
  if (!storageIsAvailable()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<PersistedDraft>;
    if (parsed.version !== DRAFT_VERSION || !parsed.project || !parsed.ui) {
      return null;
    }

    return {
      version: DRAFT_VERSION,
      savedAt: parsed.savedAt ?? '',
      project: parsed.project,
      ui: parsed.ui,
    };
  } catch {
    return null;
  }
}

export function savePersistedDraft(project: Project, ui: PersistedUiState) {
  if (!storageIsAvailable()) {
    return;
  }

  const draft: PersistedDraft = {
    version: DRAFT_VERSION,
    savedAt: new Date().toISOString(),
    project,
    ui,
  };

  try {
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // 浏览器可能因隐私模式或配额限制拒绝写入；业务状态仍保留在当前内存会话中。
  }
}

function openDraftDatabase() {
  if (!indexedDbIsAvailable()) {
    return Promise.resolve(null);
  }

  return new Promise<IDBDatabase | null>((resolve) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DRAFT_DB_NAME, DRAFT_DB_VERSION);
    } catch {
      resolve(null);
      return;
    }

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(ASSET_STORE_NAME)) {
        database.createObjectStore(ASSET_STORE_NAME);
      }
    };

    request.onerror = () => resolve(null);
    request.onsuccess = () => resolve(request.result);
  });
}

function waitForTransaction(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

export async function saveDraftImageBlob(blob: Blob) {
  const database = await openDraftDatabase();
  if (!database) {
    return;
  }

  try {
    const transaction = database.transaction(ASSET_STORE_NAME, 'readwrite');
    transaction.objectStore(ASSET_STORE_NAME).put(blob, BASE_IMAGE_KEY);
    await waitForTransaction(transaction);
  } finally {
    database.close();
  }
}

export async function loadDraftImageBlob() {
  const database = await openDraftDatabase();
  if (!database) {
    return null;
  }

  try {
    return await new Promise<Blob | null>((resolve) => {
      const transaction = database.transaction(ASSET_STORE_NAME, 'readonly');
      const request = transaction.objectStore(ASSET_STORE_NAME).get(BASE_IMAGE_KEY);
      request.onerror = () => resolve(null);
      request.onsuccess = () => {
        resolve(request.result instanceof Blob ? request.result : null);
      };
    });
  } finally {
    database.close();
  }
}
