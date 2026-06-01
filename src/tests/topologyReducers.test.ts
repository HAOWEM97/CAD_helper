import { describe, expect, it } from 'vitest';
import projectReducer, {
  addTopologyChannel,
  addTopologyNode,
  clearConnectionPointAssignments,
  createCableRoute,
  createDefaultDeviceName,
  deleteCableSpec,
  deleteCableRoute,
  deleteConnectionPoint,
  deleteConnectionPointPreset,
  deleteTopologyChannel,
  deleteTopologyNode,
  moveTopologyNode,
  upsertCableSpec,
  upsertConnectionPoint,
  upsertConnectionPointPreset,
  upsertConnectionPointPresetWithSync,
  upsertDeviceInstance,
  upsertDeviceTypePreset,
  updateTopologyChannelCategory,
  updateTopologyChannelDepth,
} from '@/state/slices/projectSlice';

describe('topology reducers', () => {
  it('adds nodes and channels without duplicating reverse channel pairs', () => {
    let state = projectReducer(undefined, addTopologyNode({ id: 'node-a', position: { x: 0, y: 0 } }));
    state = projectReducer(state, addTopologyNode({ id: 'node-b', position: { x: 10, y: 0 } }));
    state = projectReducer(
      state,
      addTopologyChannel({ id: 'channel-a', startNodeId: 'node-a', endNodeId: 'node-b' }),
    );
    state = projectReducer(
      state,
      addTopologyChannel({ id: 'channel-b', startNodeId: 'node-b', endNodeId: 'node-a' }),
    );

    expect(state.current.topology.nodes).toHaveLength(2);
    expect(state.current.topology.channels).toHaveLength(1);
    expect(state.current.topology.channels[0].category).toBe('tray');
  });

  it('moves nodes while preserving connected channels', () => {
    let state = projectReducer(undefined, addTopologyNode({ id: 'node-a', position: { x: 0, y: 0 } }));
    state = projectReducer(state, addTopologyNode({ id: 'node-b', position: { x: 10, y: 0 } }));
    state = projectReducer(
      state,
      addTopologyChannel({ id: 'channel-a', startNodeId: 'node-a', endNodeId: 'node-b' }),
    );
    state = projectReducer(state, moveTopologyNode({ nodeId: 'node-a', position: { x: 5, y: 6 } }));

    expect(state.current.topology.nodes.find((node) => node.id === 'node-a')?.position).toEqual({
      x: 5,
      y: 6,
    });
    expect(state.current.topology.channels).toHaveLength(1);
  });

  it('updates channel category and deletes only the selected channel', () => {
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
    state = projectReducer(
      state,
      updateTopologyChannelCategory({ channelId: 'channel-a', category: 'duct' }),
    );
    state = projectReducer(state, deleteTopologyChannel('channel-a'));

    expect(state.current.topology.nodes).toHaveLength(3);
    expect(state.current.topology.channels).toEqual([
      expect.objectContaining({ id: 'channel-b' }),
    ]);
  });

  it('updates multiple channel categories without touching unrelated channels', () => {
    let state = projectReducer(undefined, addTopologyNode({ id: 'node-a', position: { x: 0, y: 0 } }));
    state = projectReducer(state, addTopologyNode({ id: 'node-b', position: { x: 10, y: 0 } }));
    state = projectReducer(state, addTopologyNode({ id: 'node-c', position: { x: 20, y: 0 } }));
    state = projectReducer(state, addTopologyNode({ id: 'node-d', position: { x: 30, y: 0 } }));
    state = projectReducer(
      state,
      addTopologyChannel({ id: 'channel-a', startNodeId: 'node-a', endNodeId: 'node-b' }),
    );
    state = projectReducer(
      state,
      addTopologyChannel({ id: 'channel-b', startNodeId: 'node-b', endNodeId: 'node-c' }),
    );
    state = projectReducer(
      state,
      addTopologyChannel({ id: 'channel-c', startNodeId: 'node-c', endNodeId: 'node-d' }),
    );
    state = projectReducer(
      state,
      updateTopologyChannelCategory({
        channelIds: ['channel-a', 'channel-b'],
        category: 'duct',
      }),
    );

    expect(state.current.topology.channels).toEqual([
      expect.objectContaining({ id: 'channel-a', category: 'duct' }),
      expect.objectContaining({ id: 'channel-b', category: 'duct' }),
      expect.objectContaining({ id: 'channel-c', category: 'tray' }),
    ]);
  });

  it('stores editable channel depth after quantity spec inference unlocks the field', () => {
    let state = projectReducer(undefined, addTopologyNode({ id: 'node-a', position: { x: 0, y: 0 } }));
    state = projectReducer(state, addTopologyNode({ id: 'node-b', position: { x: 10, y: 0 } }));
    state = projectReducer(
      state,
      addTopologyChannel({ id: 'channel-a', startNodeId: 'node-a', endNodeId: 'node-b' }),
    );
    state = projectReducer(
      state,
      updateTopologyChannelDepth({ channelId: 'channel-a', depthMm: 450 }),
    );

    expect(state.current.topology.channels[0].depthMm).toBe(450);

    state = projectReducer(
      state,
      updateTopologyChannelDepth({ channelId: 'channel-a', depthMm: null }),
    );

    expect(state.current.topology.channels[0].depthMm).toBeUndefined();
  });

  it('keeps cable models unique and blocks deleting referenced cables', () => {
    let state = projectReducer(
      undefined,
      upsertCableSpec({ id: 'spec-cat6', model: 'CAT6', diameterText: '约 7.5' }),
    );
    state = projectReducer(
      state,
      upsertCableSpec({ id: 'spec-cat6-copy', model: 'CAT6', diameterText: '约 8.0' }),
    );

    expect(state.current.cableSpecs.filter((spec) => spec.model === 'CAT6')).toHaveLength(1);

    state = projectReducer(state, addTopologyNode({ id: 'node-a', position: { x: 0, y: 0 } }));
    state = projectReducer(state, upsertDeviceInstance({ id: 'device-a', name: '主机1', deviceType: '主机' }));
    state = projectReducer(
      state,
      upsertConnectionPoint({
        id: 'point-a',
        nodeId: 'node-a',
        mode: 'device',
        deviceId: 'device-a',
        portType: '主机到终端',
        items: [
          {
            id: 'item-a',
            cableSpecId: 'spec-cat6',
            quantity: { mode: 'fixed', count: 1 },
            connectionHeightMm: 800,
          },
        ],
      }),
    );
    state = projectReducer(state, deleteCableSpec('spec-cat6'));

    expect(state.current.cableSpecs.some((spec) => spec.id === 'spec-cat6')).toBe(true);
  });

  it('syncs or detaches custom connection point preset updates', () => {
    let state = projectReducer(
      undefined,
      upsertCableSpec({ id: 'spec-cat6', model: 'CAT6', diameterText: '约 7.5' }),
    );
    state = projectReducer(state, addTopologyNode({ id: 'node-a', position: { x: 0, y: 0 } }));
    const initialItems = [
      {
        id: 'item-a',
        cableSpecId: 'spec-cat6',
        usage: '通信线',
        quantity: { mode: 'fixed' as const, count: 1 },
        connectionHeightMm: 800,
      },
    ];
    state = projectReducer(
      state,
      upsertConnectionPointPreset({
        id: 'preset-a',
        kind: 'custom',
        name: '摄像机孔',
        items: initialItems,
      }),
    );
    state = projectReducer(
      state,
      upsertConnectionPoint({
        id: 'point-a',
        nodeId: 'node-a',
        mode: 'custom',
        customInstanceName: '摄像机孔1',
        portType: '摄像机孔',
        items: initialItems,
        presetRef: { kind: 'custom', id: 'preset-a' },
      }),
    );

    const changedItems = [{ ...initialItems[0], usage: '备用', connectionHeightMm: 1200 }];
    state = projectReducer(
      state,
      upsertConnectionPointPresetWithSync({
        preset: { id: 'preset-a', kind: 'custom', name: '摄像机孔', items: changedItems },
        syncToProject: true,
      }),
    );

    expect(state.current.connectionPoints[0].items[0].connectionHeightMm).toBe(1200);
    expect(state.current.connectionPoints[0].presetRef).toEqual({ kind: 'custom', id: 'preset-a' });

    state = projectReducer(
      state,
      upsertConnectionPointPresetWithSync({
        preset: { id: 'preset-a', kind: 'custom', name: '摄像机孔', items: initialItems },
        syncToProject: false,
      }),
    );

    expect(state.current.connectionPoints[0].items[0].connectionHeightMm).toBe(1200);
    expect(state.current.connectionPoints[0].presetRef).toBeUndefined();
    state = projectReducer(state, deleteConnectionPointPreset('preset-a'));
    expect(state.current.connectionPointPresets.some((preset) => preset.id === 'preset-a')).toBe(
      false,
    );
  });

  it('deletes a node and all connected channels', () => {
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
    state = projectReducer(state, deleteTopologyNode('node-b'));

    expect(state.current.topology.nodes.map((node) => node.id)).toEqual(['node-a', 'node-c']);
    expect(state.current.topology.channels).toHaveLength(0);
  });

  it('fills the smallest missing device name number from device instances', () => {
    expect(
      createDefaultDeviceName(
        [
          { id: 'device-a', name: '主机1', deviceType: '主机' },
          { id: 'device-b', name: '主机3', deviceType: '主机' },
        ],
        '主机',
      ),
    ).toBe('主机2');
  });

  it('ignores custom names when calculating later default device numbers', () => {
    expect(
      createDefaultDeviceName(
        [
          { id: 'device-a', name: '主机1', deviceType: '主机' },
          { id: 'device-b', name: '入口主机', deviceType: '主机' },
        ],
        '主机',
      ),
    ).toBe('主机2');
  });

  it('stores connection point presets and writes route cables back to traversed channels', () => {
    let state = projectReducer(undefined, addTopologyNode({ id: 'node-a', position: { x: 0, y: 0 } }));
    state = projectReducer(state, addTopologyNode({ id: 'node-b', position: { x: 10, y: 0 } }));
    state = projectReducer(
      state,
      addTopologyChannel({ id: 'channel-a', startNodeId: 'node-a', endNodeId: 'node-b' }),
    );
    const spec = {
      id: 'spec-a',
      model: 'CAT6',
      diameterText: '约 7.5',
      diameterMm: 7.5,
    };
    state = projectReducer(state, upsertCableSpec(spec));
    const items = [
      {
        id: 'item-a',
        cableSpecId: spec.id,
        quantity: { mode: 'fixed' as const, count: 1 },
        connectionHeightMm: 1200,
      },
    ];
    state = projectReducer(state, upsertConnectionPointPreset({ id: 'preset-a', name: '主线', items }));
    state = projectReducer(
      state,
      upsertDeviceTypePreset({
        id: 'device-type-a',
        deviceType: '主机',
        namePrefix: '主机',
        ports: [
          {
            id: 'port-a',
            portType: '主机到终端',
            items,
          },
        ],
      }),
    );
    state = projectReducer(
      state,
      upsertDeviceInstance({
        id: 'device-a',
        name: '主机1',
        deviceType: '主机',
      }),
    );
    state = projectReducer(
      state,
      upsertDeviceInstance({
        id: 'device-b',
        name: '终端1',
        deviceType: '摄像机',
      }),
    );
    state = projectReducer(
      state,
      upsertConnectionPoint({
        id: 'point-a',
        nodeId: 'node-a',
        mode: 'device',
        deviceId: 'device-a',
        portType: '主机到终端',
        items,
      }),
    );
    state = projectReducer(
      state,
      upsertConnectionPoint({
        id: 'point-b',
        nodeId: 'node-b',
        mode: 'device',
        deviceId: 'device-b',
        portType: '主机到终端',
        items,
      }),
    );
    state = projectReducer(
      state,
      createCableRoute({
        id: 'route-a',
        fromConnectionPointId: 'point-a',
        toConnectionPointId: 'point-b',
        pathSegmentIds: ['channel-a'],
        status: 'valid',
      }),
    );

    expect(
      state.current.deviceTypePresets.some(
        (preset) =>
          preset.deviceType === '主机' &&
          preset.ports.some((port) => port.portType === '主机到终端'),
      ),
    ).toBe(true);
    expect(state.current.connectionPointPresets.some((preset) => preset.id === 'preset-a')).toBe(true);
    expect(state.current.connectionPoints).toHaveLength(2);
    expect(state.current.routes).toHaveLength(1);
    expect(state.current.topology.channels[0].cableIds).toEqual(['CAT6x1']);
  });

  it('replaces recalculated routes by id and rebuilds channel cable registration after delete', () => {
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
    const spec = { id: 'spec-a', model: 'CAT6', diameterText: '约 7.5' };
    const items = [
      {
        id: 'item-a',
        cableSpecId: spec.id,
        quantity: { mode: 'fixed' as const, count: 1 },
        connectionHeightMm: 800,
      },
    ];
    state = projectReducer(state, upsertCableSpec(spec));
    state = projectReducer(state, upsertDeviceInstance({ id: 'device-a', name: '起点1', deviceType: '起点' }));
    state = projectReducer(state, upsertDeviceInstance({ id: 'device-b', name: '终点1', deviceType: '终点' }));
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
      createCableRoute({
        id: 'route-a',
        fromConnectionPointId: 'point-a',
        toConnectionPointId: 'point-b',
        pathSegmentIds: ['channel-a'],
        status: 'needs-recalculation',
      }),
    );
    state = projectReducer(
      state,
      createCableRoute({
        id: 'route-a',
        fromConnectionPointId: 'point-a',
        toConnectionPointId: 'point-b',
        pathSegmentIds: ['channel-a', 'channel-b'],
        status: 'valid',
      }),
    );

    expect(state.current.routes).toEqual([
      expect.objectContaining({ id: 'route-a', status: 'valid', pathSegmentIds: ['channel-a', 'channel-b'] }),
    ]);
    expect(state.current.topology.channels.map((channel) => channel.cableIds)).toEqual([
      ['CAT6x1'],
      ['CAT6x1'],
    ]);

    state = projectReducer(state, upsertDeviceInstance({ id: 'device-c', name: '终点2', deviceType: '终点' }));
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
    state = projectReducer(
      state,
      createCableRoute({
        id: 'route-b',
        fromConnectionPointId: 'point-a',
        toConnectionPointId: 'point-c',
        pathSegmentIds: ['channel-a'],
        status: 'valid',
      }),
    );

    expect(state.current.routes).toEqual([
      expect.objectContaining({ id: 'route-b', fromConnectionPointId: 'point-a', toConnectionPointId: 'point-c' }),
    ]);
    expect(state.current.topology.channels.map((channel) => channel.cableIds)).toEqual([
      ['CAT6x1'],
      [],
    ]);

    state = projectReducer(state, deleteCableRoute('route-b'));

    expect(state.current.routes).toHaveLength(0);
    expect(state.current.topology.channels.map((channel) => channel.cableIds)).toEqual([[], []]);
  });

  it('clears all node connection point assignments without removing topology or presets', () => {
    let state = projectReducer(undefined, addTopologyNode({ id: 'node-a', position: { x: 0, y: 0 } }));
    state = projectReducer(state, addTopologyNode({ id: 'node-b', position: { x: 10, y: 0 } }));
    state = projectReducer(
      state,
      addTopologyChannel({ id: 'channel-a', startNodeId: 'node-a', endNodeId: 'node-b' }),
    );
    const items = [
      {
        id: 'item-a',
        cableSpecId: 'cable-spec-VVR-0.6/1kV-2x2.5',
        quantity: { mode: 'fixed' as const, count: 1 },
        connectionHeightMm: 800,
      },
    ];
    state = projectReducer(state, upsertConnectionPointPreset({ id: 'preset-a', name: '主线', items }));
    state = projectReducer(state, upsertDeviceInstance({ id: 'device-a', name: '主机1', deviceType: '主机' }));
    state = projectReducer(state, upsertDeviceInstance({ id: 'device-b', name: '终端1', deviceType: '终端' }));
    state = projectReducer(
      state,
      upsertConnectionPoint({
        id: 'point-a',
        nodeId: 'node-a',
        mode: 'device',
        deviceId: 'device-a',
        portType: '主机到终端',
        items,
      }),
    );
    state = projectReducer(
      state,
      upsertConnectionPoint({
        id: 'point-b',
        nodeId: 'node-b',
        mode: 'device',
        deviceId: 'device-b',
        portType: '主机到终端',
        items,
      }),
    );
    state = projectReducer(
      state,
      createCableRoute({
        id: 'route-a',
        fromConnectionPointId: 'point-a',
        toConnectionPointId: 'point-b',
        pathSegmentIds: ['channel-a'],
        status: 'valid',
      }),
    );
    state = projectReducer(state, clearConnectionPointAssignments());

    expect(state.current.topology.nodes).toHaveLength(2);
    expect(state.current.topology.channels).toHaveLength(1);
    expect(state.current.deviceInstances).toHaveLength(0);
    expect(state.current.connectionPoints).toHaveLength(0);
    expect(state.current.routes).toHaveLength(0);
    expect(state.current.topology.channels[0].cableIds).toEqual([]);
    expect(state.current.connectionPointPresets.length).toBeGreaterThan(0);
  });

  it('deletes one connection point, related routes, channel cables and empty device instance', () => {
    let state = projectReducer(undefined, addTopologyNode({ id: 'node-a', position: { x: 0, y: 0 } }));
    state = projectReducer(state, addTopologyNode({ id: 'node-b', position: { x: 10, y: 0 } }));
    state = projectReducer(
      state,
      addTopologyChannel({ id: 'channel-a', startNodeId: 'node-a', endNodeId: 'node-b' }),
    );
    const spec = {
      id: 'spec-a',
      model: 'CAT6',
      diameterText: '约 7.5',
    };
    state = projectReducer(state, upsertCableSpec(spec));
    const items = [
      {
        id: 'item-a',
        cableSpecId: spec.id,
        quantity: { mode: 'fixed' as const, count: 1 },
        connectionHeightMm: 800,
      },
    ];
    state = projectReducer(state, upsertDeviceInstance({ id: 'device-a', name: '主机1', deviceType: '主机' }));
    state = projectReducer(state, upsertDeviceInstance({ id: 'device-b', name: '终端1', deviceType: '终端' }));
    state = projectReducer(
      state,
      upsertConnectionPoint({
        id: 'point-a',
        nodeId: 'node-a',
        mode: 'device',
        deviceId: 'device-a',
        portType: '主机到终端',
        items,
      }),
    );
    state = projectReducer(
      state,
      upsertConnectionPoint({
        id: 'point-b',
        nodeId: 'node-b',
        mode: 'device',
        deviceId: 'device-b',
        portType: '主机到终端',
        items,
      }),
    );
    state = projectReducer(
      state,
      createCableRoute({
        id: 'route-a',
        fromConnectionPointId: 'point-a',
        toConnectionPointId: 'point-b',
        pathSegmentIds: ['channel-a'],
        status: 'valid',
      }),
    );

    state = projectReducer(state, deleteConnectionPoint('point-a'));

    expect(state.current.connectionPoints.map((point) => point.id)).toEqual(['point-b']);
    expect(state.current.deviceInstances.map((device) => device.id)).toEqual(['device-b']);
    expect(state.current.routes).toHaveLength(0);
    expect(state.current.topology.channels[0].cableIds).toEqual([]);
    expect(state.current.topology.nodes).toHaveLength(2);
  });
});
