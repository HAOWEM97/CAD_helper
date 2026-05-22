import { describe, expect, it } from 'vitest';
import { buildBomSummary, inferChannelSpecs } from '@/domain/quantity/bom';
import type { Project } from '@/domain/project/types';

function createProject(): Project {
  return {
    id: 'project-a',
    name: '算量测试',
    image: null,
    calibrationDraft: {
      activePoint: 'A',
      pointA: { imagePoint: null, cadPoint: { x: null, y: null } },
      pointB: { imagePoint: null, cadPoint: { x: null, y: null } },
    },
    calibration: null,
    topology: {
      nodes: [
        { id: 'node-a', position: { x: 0, y: 0 } },
        { id: 'node-b', position: { x: 1000, y: 0 } },
        { id: 'node-c', position: { x: 2000, y: 0 } },
      ],
      channels: [
        {
          id: 'channel-a',
          startNodeId: 'node-a',
          endNodeId: 'node-b',
          category: 'tray',
          depthMm: 300,
          cableIds: [],
        },
        {
          id: 'channel-b',
          startNodeId: 'node-b',
          endNodeId: 'node-c',
          category: 'duct',
          depthMm: 500,
          cableIds: [],
        },
      ],
    },
    deviceInstances: [
      { id: 'device-a', name: '主机1', deviceType: '主机' },
      { id: 'device-b', name: '终端1', deviceType: '终端' },
    ],
    connectionPoints: [
      {
        id: 'point-a',
        nodeId: 'node-a',
        mode: 'device',
        deviceId: 'device-a',
        portType: '主机到终端',
        items: [
          {
            id: 'item-a',
            cableSpecId: 'spec-a',
            quantity: { mode: 'fixed', count: 2 },
            connectionHeightMm: 1200,
          },
        ],
      },
      {
        id: 'point-b',
        nodeId: 'node-c',
        mode: 'device',
        deviceId: 'device-b',
        portType: '主机到终端',
        items: [
          {
            id: 'item-b',
            cableSpecId: 'spec-a',
            quantity: { mode: 'fixed', count: 2 },
            connectionHeightMm: 800,
          },
        ],
      },
    ],
    cableSpecs: [
      {
        id: 'spec-a',
        model: 'CAT6',
        diameterText: '约 10',
        diameterMm: 10,
      },
    ],
    connectionPointPresets: [],
    deviceTypePresets: [],
    routes: [
      {
        id: 'route-a',
        fromConnectionPointId: 'point-a',
        toConnectionPointId: 'point-b',
        pathSegmentIds: ['channel-a', 'channel-b'],
        status: 'valid',
      },
    ],
  };
}

describe('quantity bom derivation', () => {
  it('infers tray and duct specs from valid routed cable loads', () => {
    const project = createProject();

    expect(inferChannelSpecs(project)).toEqual([
      expect.objectContaining({
        channelId: 'channel-a',
        category: 'tray',
        cableCount: 2,
        spec: expect.objectContaining({ label: '50x50' }),
      }),
      expect.objectContaining({
        channelId: 'channel-b',
        category: 'duct',
        cableCount: 2,
        spec: expect.objectContaining({ label: '1x2 排管' }),
      }),
    ]);
  });

  it('calculates cable length from 2D route length, endpoint heights and channel depth changes', () => {
    const project = createProject();
    const summary = buildBomSummary(project);

    expect(summary.cableRows).toEqual([
      expect.objectContaining({
        cableSpecId: 'spec-a',
        quantity: 2,
        totalLengthMm: 6800,
      }),
    ]);
    expect(summary.channelRows).toEqual([
      expect.objectContaining({ category: 'duct', label: '1x2 排管', count: 1, totalLengthMm: 1000 }),
      expect.objectContaining({ category: 'tray', label: '50x50', count: 1, totalLengthMm: 1000 }),
    ]);
  });

  it('marks inferred channels without user depth while keeping bom derived', () => {
    const project = createProject();
    delete project.topology.channels[0].depthMm;

    expect(buildBomSummary(project).missingDepthChannelIds).toEqual(['channel-a']);
  });
});
