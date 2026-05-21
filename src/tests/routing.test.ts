import { describe, expect, it } from 'vitest';
import {
  defaultCableSpecs,
  defaultDeviceTypePresets,
  parseDiameterText,
} from '@/domain/library/defaultDeviceLibrary';
import { validateConnectionBundles } from '@/domain/routing/connectionValidation';
import { findShortestChannelPath } from '@/domain/routing/shortestPath';
import type { CableBundle, TopologyGraph } from '@/domain/project/types';

const topology: TopologyGraph = {
  nodes: [
    { id: 'a', position: { x: 0, y: 0 } },
    { id: 'b', position: { x: 10, y: 0 } },
    { id: 'c', position: { x: 20, y: 0 } },
    { id: 'd', position: { x: 0, y: 30 } },
    { id: 'e', position: { x: 100, y: 100 } },
  ],
  channels: [
    { id: 'ab', startNodeId: 'a', endNodeId: 'b', category: 'tray', cableIds: [] },
    { id: 'bc', startNodeId: 'b', endNodeId: 'c', category: 'tray', cableIds: [] },
    { id: 'ad', startNodeId: 'a', endNodeId: 'd', category: 'duct', cableIds: [] },
    { id: 'dc', startNodeId: 'd', endNodeId: 'c', category: 'tray', cableIds: [] },
  ],
};

describe('shortest route path', () => {
  it('returns the shortest channel id path by CAD 2D length', () => {
    expect(findShortestChannelPath(topology, 'a', 'c')).toEqual({
      reachable: true,
      channelIds: ['ab', 'bc'],
      distance: 20,
    });
  });

  it('returns unreachable when topology is disconnected', () => {
    expect(findShortestChannelPath(topology, 'a', 'e')).toEqual({
      reachable: false,
      channelIds: [],
      distance: null,
    });
  });
});

describe('device library and connection validation', () => {
  it('contains the Excel-derived default devices and cable diameter ranges', () => {
    expect(defaultDeviceTypePresets.map((preset) => preset.deviceType)).toContain('汇流排柜');
    expect(defaultCableSpecs).toHaveLength(8);
    expect(parseDiameterText('约 19.5 - 20.5')).toEqual({
      diameterMinMm: 19.5,
      diameterMaxMm: 20.5,
      diameterMm: 20,
    });
  });

  it('matches finite bundles by usage, model and quantity', () => {
    const bundle: CableBundle = {
      id: 'bundle-a',
      name: '快充主机到快充终端',
      items: [
        {
          id: 'item-a',
          cableSpecId: 'spec-a',
          usage: '直流线',
          model: 'YJV-1.8/3kV-1x120',
          quantity: { mode: 'fixed', count: 4 },
        },
      ],
    };

    expect(validateConnectionBundles(bundle, bundle).compatible).toBe(true);
    expect(
      validateConnectionBundles(bundle, {
        ...bundle,
        items: [{ ...bundle.items[0], quantity: { mode: 'fixed', count: 2 } }],
      }).compatible,
    ).toBe(false);
  });

  it('allows finite starts to connect to matching unlimited endpoints', () => {
    const start: CableBundle = {
      id: 'bundle-start',
      name: '主机到汇流排',
      items: [
        {
          id: 'item-start',
          cableSpecId: 'spec-a',
          usage: '直流线',
          model: 'YJV-0.6/1kV-1x150',
          quantity: { mode: 'fixed', count: 8 },
        },
      ],
    };
    const end: CableBundle = {
      ...start,
      id: 'bundle-end',
      items: [{ ...start.items[0], id: 'item-end', quantity: { mode: 'unlimited' } }],
    };

    expect(validateConnectionBundles(start, end).compatible).toBe(true);
    expect(validateConnectionBundles(end, start).compatible).toBe(false);
  });
});
