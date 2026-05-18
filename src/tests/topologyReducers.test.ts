import { describe, expect, it } from 'vitest';
import projectReducer, {
  addTopologyChannel,
  addTopologyNode,
  deleteTopologyChannel,
  deleteTopologyNode,
  moveTopologyNode,
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
});
