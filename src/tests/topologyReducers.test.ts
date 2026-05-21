import { describe, expect, it } from 'vitest';
import projectReducer, {
  addTopologyChannel,
  addTopologyNode,
  clearConnectionPointAssignments,
  createCableRoute,
  createDefaultDeviceName,
  deleteTopologyChannel,
  deleteTopologyNode,
  moveTopologyNode,
  upsertCableBundlePreset,
  upsertConnectionPoint,
  upsertDeviceInstance,
  upsertDeviceTypePreset,
  updateTopologyChannelCategory,
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
    const bundle = {
      id: 'bundle-a',
      name: '主线',
      items: [
        {
          id: 'item-a',
          cableSpecId: 'spec-a',
          usage: '通信线',
          model: 'CAT6',
          quantity: { mode: 'fixed' as const, count: 1 },
          diameterMm: 7.5,
        },
      ],
    };
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
            connectionHeightMm: 1200,
            cableBundle: bundle,
          },
        ],
      }),
    );
    state = projectReducer(
      state,
      upsertCableBundlePreset(bundle),
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
        deviceId: 'device-a',
        portType: '主机到终端',
        connectionHeightMm: 1200,
        cableBundle: bundle,
      }),
    );
    state = projectReducer(
      state,
      upsertConnectionPoint({
        id: 'point-b',
        nodeId: 'node-b',
        deviceId: 'device-b',
        portType: '主机到终端',
        connectionHeightMm: 500,
        cableBundle: bundle,
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
    expect(state.current.cableBundlePresets.some((preset) => preset.id === 'bundle-a')).toBe(true);
    expect(state.current.connectionPoints).toHaveLength(2);
    expect(state.current.routes).toHaveLength(1);
    expect(state.current.topology.channels[0].cableIds).toEqual(['通信线:CAT6x1']);
  });

  it('clears all node connection point assignments without removing topology or presets', () => {
    let state = projectReducer(undefined, addTopologyNode({ id: 'node-a', position: { x: 0, y: 0 } }));
    state = projectReducer(state, addTopologyNode({ id: 'node-b', position: { x: 10, y: 0 } }));
    state = projectReducer(
      state,
      addTopologyChannel({ id: 'channel-a', startNodeId: 'node-a', endNodeId: 'node-b' }),
    );
    const bundle = {
      id: 'bundle-a',
      name: '主线',
      items: [
        {
          id: 'item-a',
          cableSpecId: 'spec-a',
          usage: '通信线',
          model: 'CAT6',
          quantity: { mode: 'fixed' as const, count: 1 },
        },
      ],
    };
    state = projectReducer(
      state,
      upsertCableBundlePreset(bundle),
    );
    state = projectReducer(state, upsertDeviceInstance({ id: 'device-a', name: '主机1', deviceType: '主机' }));
    state = projectReducer(state, upsertDeviceInstance({ id: 'device-b', name: '终端1', deviceType: '终端' }));
    state = projectReducer(
      state,
      upsertConnectionPoint({
        id: 'point-a',
        nodeId: 'node-a',
        deviceId: 'device-a',
        portType: '主机到终端',
        connectionHeightMm: 800,
        cableBundle: bundle,
      }),
    );
    state = projectReducer(
      state,
      upsertConnectionPoint({
        id: 'point-b',
        nodeId: 'node-b',
        deviceId: 'device-b',
        portType: '主机到终端',
        connectionHeightMm: 500,
        cableBundle: bundle,
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
    expect(state.current.cableBundlePresets.length).toBeGreaterThan(0);
  });
});
