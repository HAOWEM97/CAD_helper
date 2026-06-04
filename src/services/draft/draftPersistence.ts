import type { Project, WorkflowStep } from '@/domain/project/types';
import {
  defaultCableSpecs,
  defaultConnectionPointPresets,
  defaultDeviceTypePresets,
} from '@/domain/library/defaultDeviceLibrary';
import { connectionItemsToCableIds } from '@/domain/routing/connectionValidation';
import {
  clampRightPanelWidth,
  type TopologyToolMode,
  type UiState,
} from '@/state/slices/uiSlice';

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
  'library',
  'routing',
  'quantity',
  'export',
]);

const topologyToolModes = new Set<TopologyToolMode>(['draw', 'select']);

const defaultConnectionItemById = new Map(
  [
    ...defaultConnectionPointPresets.flatMap((preset) => preset.items),
    ...defaultDeviceTypePresets.flatMap((preset) => preset.ports.flatMap((port) => port.items)),
  ].map((item) => [item.id, item]),
);

function dedupeCableSpecsByModel(cableSpecs: Project['cableSpecs']) {
  const keptSpecByModel = new Map<string, Project['cableSpecs'][number]>();
  const replacementIdById = new Map<string, string>();

  for (const spec of cableSpecs) {
    const model = spec.model.trim();
    if (!model) {
      continue;
    }

    const kept = keptSpecByModel.get(model);
    if (kept) {
      replacementIdById.set(spec.id, kept.id);
    } else {
      const nextSpec = { ...spec, model };
      keptSpecByModel.set(model, nextSpec);
      replacementIdById.set(spec.id, nextSpec.id);
    }
  }

  return {
    cableSpecs: Array.from(keptSpecByModel.values()),
    replacementIdById,
  };
}

function dedupeRoutesByStart(routes: Project['routes']) {
  const keptRoutes: Project['routes'] = [];

  for (const route of routes) {
    const nextRoute = {
      ...route,
      pathSegmentIds: Array.from(new Set(route.pathSegmentIds)),
    };
    const existingIndex = keptRoutes.findIndex(
      (item) =>
        item.id === nextRoute.id ||
        item.fromConnectionPointId === nextRoute.fromConnectionPointId,
    );

    if (existingIndex >= 0) {
      keptRoutes.splice(existingIndex, 1);
    }
    keptRoutes.push(nextRoute);
  }

  return keptRoutes;
}

function rebuildChannelCableIds(project: Project) {
  const pointById = new Map(project.connectionPoints.map((point) => [point.id, point]));
  const cableIdsByChannelId = new Map<string, Set<string>>();

  for (const route of project.routes) {
    const fromPoint = pointById.get(route.fromConnectionPointId);
    const cableIds = fromPoint ? connectionItemsToCableIds(fromPoint.items, project.cableSpecs) : [];

    for (const channelId of route.pathSegmentIds) {
      const channelCableIds = cableIdsByChannelId.get(channelId) ?? new Set<string>();
      for (const cableId of cableIds) {
        channelCableIds.add(cableId);
      }
      cableIdsByChannelId.set(channelId, channelCableIds);
    }
  }

  return project.topology.channels.map((channel) => ({
    ...channel,
    cableIds: Array.from(cableIdsByChannelId.get(channel.id) ?? []),
  }));
}

export type PersistedUiState = Pick<
  UiState,
  | 'activeStep'
  | 'topologyToolMode'
  | 'leftPanelCollapsed'
  | 'rightPanelCollapsed'
  | 'rightPanelWidth'
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

export function normalizeProject(project: Project): Project {
  const legacyProject = project as Project & {
    cableSpecs?: Array<Project['cableSpecs'][number] & { usage?: string }>;
    cableBundlePresets?: Array<{
      id: string;
      name: string;
      items: Array<{
        id: string;
        cableSpecId: string;
        quantity: Project['connectionPoints'][number]['items'][number]['quantity'];
        connectionHeightMm?: number;
      }>;
    }>;
    devices?: Array<{
      id: string;
      nodeId: string;
      name: string;
      deviceType: string;
      connectionHeightMm: number;
      cableBundle?: {
        id: string;
        name: string;
        items: Array<{
          id: string;
          cableSpecId: string;
          usage?: string;
          model?: string;
          quantity: Project['connectionPoints'][number]['items'][number]['quantity'];
        }>;
      };
    }>;
  };
  const rawCableSpecs = project.cableSpecs?.length ? project.cableSpecs : defaultCableSpecs;
  const strippedCableSpecs = rawCableSpecs.map((spec) => {
    const { usage: _usage, ...nextSpec } = spec as typeof spec & { usage?: string };
    return nextSpec;
  });
  const { cableSpecs, replacementIdById } = dedupeCableSpecsByModel(strippedCableSpecs);
  const cableSpecById = new Map(rawCableSpecs.map((spec) => [spec.id, spec]));
  const cableSpecByModel = new Map(cableSpecs.map((spec) => [spec.model, spec]));
  const normalizeItems = (
    items: Project['connectionPoints'][number]['items'],
  ): Project['connectionPoints'][number]['items'] =>
    items.map((item) => ({
      ...item,
      cableSpecId: replacementIdById.get(item.cableSpecId) ?? item.cableSpecId,
      usage:
        item.usage ??
        defaultConnectionItemById.get(item.id)?.usage ??
        (cableSpecById.get(item.cableSpecId) as { usage?: string } | undefined)?.usage,
    }));
  const deviceInstances =
    project.deviceInstances ??
    legacyProject.devices?.map((device) => ({
      id: device.id,
      name: device.name,
      deviceType: device.deviceType,
    })) ??
    [];
  const connectionPoints = project.connectionPoints
    ? project.connectionPoints.map((point) => {
        const legacyPoint = point as typeof point & {
          connectionHeightMm?: number;
        cableBundle?: {
          items: Array<{
            id: string;
            cableSpecId?: string;
            model?: string;
            usage?: string;
            quantity: Project['connectionPoints'][number]['items'][number]['quantity'];
          }>;
        };
        };
        if (Array.isArray(point.items)) {
          return {
            ...point,
            items: normalizeItems(point.items),
          };
        }

        return {
          id: point.id,
          nodeId: point.nodeId,
          mode: point.deviceId ? ('device' as const) : ('custom' as const),
          deviceId: point.deviceId,
          portType: point.portType,
          items:
            legacyPoint.cableBundle?.items.map((item) => ({
              id: item.id,
              cableSpecId:
                item.cableSpecId ??
                (item.model ? cableSpecByModel.get(item.model)?.id : undefined) ??
                item.id,
              usage:
                item.usage ??
                (item.cableSpecId
                  ? (cableSpecById.get(item.cableSpecId) as { usage?: string } | undefined)?.usage
                  : undefined),
              quantity: item.quantity,
              connectionHeightMm: legacyPoint.connectionHeightMm ?? 0,
            })) ?? [],
        };
      })
    :
    legacyProject.devices?.map((device) => ({
      id: `connection-${device.id}`,
      nodeId: device.nodeId,
      mode: 'device' as const,
      deviceId: device.id,
      portType: '未分类接线孔',
      items: [],
    })) ??
    [];
  const connectionPointPresets = project.connectionPointPresets?.length
    ? [
        ...defaultConnectionPointPresets.filter(
          (defaultPreset) =>
            !project.connectionPointPresets.some(
              (preset) => preset.name === defaultPreset.name,
            ),
        ),
        ...project.connectionPointPresets.map((preset) => ({
          ...preset,
          items: normalizeItems(preset.items),
        })),
      ]
    : defaultConnectionPointPresets;
  const deviceTypePresets = project.deviceTypePresets?.length
    ? [
        ...defaultDeviceTypePresets.filter(
          (defaultPreset) =>
            !project.deviceTypePresets.some(
              (preset) => preset.deviceType === defaultPreset.deviceType,
            ),
        ),
        ...project.deviceTypePresets.map((preset) => ({
          ...preset,
          ports: preset.ports.map((port) => ({
            ...port,
            items: normalizeItems(port.items),
          })),
        })),
      ]
    : defaultDeviceTypePresets;

  const routes = dedupeRoutesByStart(project.routes ?? []);
  const normalizedProject: Project = {
    ...project,
    topology: {
      nodes: project.topology?.nodes ?? [],
      channels: project.topology?.channels ?? [],
    },
    deviceInstances,
    connectionPoints,
    cableSpecs,
    connectionPointPresets,
    deviceTypePresets,
    routes,
  };

  return {
    ...normalizedProject,
    topology: {
      ...normalizedProject.topology,
      channels: rebuildChannelCableIds(normalizedProject),
    },
  };
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
    rightPanelWidth: ui.rightPanelWidth,
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
    rightPanelWidth:
      typeof persisted?.rightPanelWidth === 'number'
        ? clampRightPanelWidth(persisted.rightPanelWidth)
        : fallback.rightPanelWidth,
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
      project: normalizeProject(parsed.project as Project),
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

export function clearPersistedDraft() {
  if (!storageIsAvailable()) {
    return;
  }

  try {
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch {
    // 清除本地草稿失败不影响当前内存工程重置。
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

export async function clearDraftImageBlob() {
  const database = await openDraftDatabase();
  if (!database) {
    return;
  }

  try {
    const transaction = database.transaction(ASSET_STORE_NAME, 'readwrite');
    transaction.objectStore(ASSET_STORE_NAME).delete(BASE_IMAGE_KEY);
    await waitForTransaction(transaction);
  } finally {
    database.close();
  }
}
