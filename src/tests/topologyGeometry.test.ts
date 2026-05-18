import { describe, expect, it } from 'vitest';
import {
  applyAxisSnap,
  applyOrthogonalConstraint,
  channelExistsBetween,
  findNearestNode,
  getPointToSegmentDistance,
} from '@/domain/topology/topologyGeometry';
import type { ChannelSegment, TopologyNode } from '@/domain/project/types';

const nodes: TopologyNode[] = [
  { id: 'node-a', position: { x: 0, y: 0 } },
  { id: 'node-b', position: { x: 100, y: 0 } },
];

const channels: ChannelSegment[] = [
  {
    id: 'channel-a',
    startNodeId: 'node-a',
    endNodeId: 'node-b',
    category: 'tray',
    cableIds: [],
  },
];

describe('topology geometry helpers', () => {
  it('snaps to the nearest node within threshold', () => {
    expect(findNearestNode({ x: 3, y: 4 }, nodes, 6)?.node.id).toBe('node-a');
    expect(findNearestNode({ x: 30, y: 0 }, nodes, 6)).toBeNull();
  });

  it('soft-snaps to horizontal or vertical axes', () => {
    expect(applyAxisSnap({ x: 40, y: 3 }, { x: 0, y: 0 }, 6)).toEqual({
      point: { x: 40, y: 0 },
      axis: 'horizontal',
    });
    expect(applyAxisSnap({ x: 4, y: 50 }, { x: 0, y: 0 }, 6)).toEqual({
      point: { x: 0, y: 50 },
      axis: 'vertical',
    });
    expect(applyAxisSnap({ x: 20, y: 50 }, { x: 0, y: 0 }, 6).axis).toBeNull();
  });

  it('forces orthogonal lines to the dominant axis', () => {
    expect(applyOrthogonalConstraint({ x: 40, y: 12 }, { x: 0, y: 0 })).toEqual({
      point: { x: 40, y: 0 },
      axis: 'horizontal',
    });
    expect(applyOrthogonalConstraint({ x: 7, y: 35 }, { x: 0, y: 0 })).toEqual({
      point: { x: 0, y: 35 },
      axis: 'vertical',
    });
  });

  it('detects existing channels regardless of direction', () => {
    expect(channelExistsBetween(channels, 'node-a', 'node-b')).toBe(true);
    expect(channelExistsBetween(channels, 'node-b', 'node-a')).toBe(true);
    expect(channelExistsBetween(channels, 'node-a', 'node-c')).toBe(false);
  });

  it('measures point-to-channel hit distance', () => {
    expect(getPointToSegmentDistance({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
    expect(getPointToSegmentDistance({ x: -3, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
  });
});
