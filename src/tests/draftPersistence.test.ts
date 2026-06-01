import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadPersistedDraft, pickPersistableUiState } from '@/services/draft/draftPersistence';
import projectReducer, {
  addTopologyChannel,
  addTopologyNode,
  upsertCableSpec,
  upsertConnectionPoint,
  upsertDeviceInstance,
} from '@/state/slices/projectSlice';
import { createInitialUiState } from '@/state/slices/uiSlice';
import type { CableRoute } from '@/domain/project/types';

function createLocalStorageMock() {
  const store = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store.set(key, value);
    }),
  };
}

describe('draft persistence', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('dedupes persisted routes by start point and rebuilds channel cable registration', () => {
    let state = projectReducer(undefined, addTopologyNode({ id: 'node-a', position: { x: 0, y: 0 } }));
    state = projectReducer(state, addTopologyNode({ id: 'node-b', position: { x: 10, y: 0 } }));
    state = projectReducer(state, addTopologyNode({ id: 'node-c', position: { x: 20, y: 0 } }));
    state = projectReducer(
      state,
      addTopologyChannel({ id: 'channel-a', startNodeId: 'node-a', endNodeId: 'node-b' }),
    );
    state = projectReducer(
      state,
      addTopologyChannel({ id: 'channel-b', startNodeId: 'node-b', endNodeId: 'node-c' }),
    );
    state = projectReducer(state, upsertCableSpec({ id: 'spec-a', model: 'CAT6', diameterText: '7.5' }));
    state = projectReducer(state, upsertDeviceInstance({ id: 'device-a', name: '主机1', deviceType: '主机' }));
    state = projectReducer(state, upsertDeviceInstance({ id: 'device-b', name: '终端1', deviceType: '终端' }));
    state = projectReducer(state, upsertDeviceInstance({ id: 'device-c', name: '终端2', deviceType: '终端' }));

    const items = [
      {
        id: 'item-a',
        cableSpecId: 'spec-a',
        quantity: { mode: 'fixed' as const, count: 1 },
        connectionHeightMm: 800,
      },
    ];
    state = projectReducer(
      state,
      upsertConnectionPoint({
        id: 'point-a',
        nodeId: 'node-a',
        mode: 'device',
        deviceId: 'device-a',
        portType: '主线',
        items,
      }),
    );
    state = projectReducer(
      state,
      upsertConnectionPoint({
        id: 'point-b',
        nodeId: 'node-c',
        mode: 'device',
        deviceId: 'device-b',
        portType: '主线',
        items,
      }),
    );
    state = projectReducer(
      state,
      upsertConnectionPoint({
        id: 'point-c',
        nodeId: 'node-b',
        mode: 'device',
        deviceId: 'device-c',
        portType: '主线',
        items,
      }),
    );

    const oldRoute: CableRoute = {
      id: 'route-old',
      fromConnectionPointId: 'point-a',
      toConnectionPointId: 'point-b',
      pathSegmentIds: ['channel-a', 'channel-b'],
      status: 'valid',
    };
    const nextRoute: CableRoute = {
      id: 'route-next',
      fromConnectionPointId: 'point-a',
      toConnectionPointId: 'point-c',
      pathSegmentIds: ['channel-a'],
      status: 'valid',
    };
    const localStorage = createLocalStorageMock();
    vi.stubGlobal('window', { localStorage });

    localStorage.setItem(
      'cad-router-web:draft:v1',
      JSON.stringify({
        version: 1,
        savedAt: '',
        project: {
          ...state.current,
          routes: [oldRoute, nextRoute],
        },
        ui: pickPersistableUiState(createInitialUiState()),
      }),
    );

    const draft = loadPersistedDraft();

    expect(draft?.project.routes).toEqual([nextRoute]);
    expect(draft?.project.topology.channels.map((channel) => channel.cableIds)).toEqual([
      ['CAT6x1'],
      [],
    ]);
  });
});
