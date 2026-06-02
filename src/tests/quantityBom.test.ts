import { describe, expect, it } from 'vitest';
import {
  buildBomSummary,
  buildRouteDetail,
  classifyCableUsage,
  createCustomDuctSpec,
  createCustomTraySpec,
  evaluateChannelSpec,
  inferChannelSpecs,
} from '@/domain/quantity/bom';
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
        spec: expect.objectContaining({ label: '200x150mm' }),
      }),
      expect.objectContaining({
        channelId: 'channel-b',
        category: 'duct',
        cableCount: 2,
        spec: expect.objectContaining({ label: '2*DN125+2*DN32' }),
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
      expect.objectContaining({ category: 'duct', label: '2*DN125+2*DN32', count: 1, totalLengthMm: 1000 }),
      expect.objectContaining({ category: 'tray', label: '200x150mm', count: 1, totalLengthMm: 1000 }),
    ]);
  });

  it('calculates route detail 2D horizontal length only', () => {
    const project = createProject();

    expect(buildRouteDetail(project, 'route-a')).toEqual({
      routeId: 'route-a',
      horizontalLengthMm: 2000,
    });
    expect(buildRouteDetail(project, 'missing-route')).toBeNull();
  });

  it('marks inferred channels without user depth while keeping bom derived', () => {
    const project = createProject();
    delete project.topology.channels[0].depthMm;

    expect(buildBomSummary(project).missingDepthChannelIds).toEqual(['channel-a']);
  });

  it('classifies only usage text containing communication as communication cable', () => {
    expect(classifyCableUsage('通信线')).toBe('communication');
    expect(classifyCableUsage('直流线')).toBe('power');
    expect(classifyCableUsage(undefined)).toBe('power');
  });

  it('recommends divided trays when communication and power cables share a tray', () => {
    const project = createProject();
    project.cableSpecs.push({ id: 'spec-b', model: 'RVVSP', diameterText: '约 8', diameterMm: 8 });
    project.connectionPoints[0].items.push({
      id: 'item-comm',
      cableSpecId: 'spec-b',
      usage: '通信线',
      quantity: { mode: 'fixed', count: 1 },
      connectionHeightMm: 1000,
    });

    const tray = inferChannelSpecs(project)[0];

    expect(tray.spec).toEqual(expect.objectContaining({ label: '200x150mm（带分隔板150/50）' }));
    expect(tray.evaluation.utilizationRows.map((row) => row.label)).toEqual(['配电仓', '通信仓']);
  });

  it('keeps communication cables in DN32 pipes and flags custom duct violations', () => {
    const project = createProject();
    project.connectionPoints[0].items[0].usage = '通信线';
    project.topology.channels[1].category = 'duct';
    const duct = inferChannelSpecs(project)[1];

    expect(duct.spec).toEqual(expect.objectContaining({ label: '2*DN125+2*DN32' }));
    expect(duct.evaluation.utilizationRows[0]).toEqual(
      expect.objectContaining({ label: 'DN32 #1', cableClass: 'communication', ok: true }),
    );

    const customEvaluation = evaluateChannelSpec(createCustomDuctSpec({ DN125: 1 }), duct.cableLoads);
    expect(customEvaluation.ok).toBe(false);
    expect(customEvaluation.warnings).toContain('通信线必须敷设在 DN32 钢管内。');
  });

  it('splits duct cables across pipes and reports pipe contents', () => {
    const load = {
      cableSpecId: 'spec-large',
      usage: '直流线',
      cableClass: 'power' as const,
      quantity: 12,
      diameterMm: 23.5,
      model: 'YJV-1.8/3kV-1x185',
      areaMm2: Math.PI * (23.5 / 2) * (23.5 / 2) * 12,
    };
    const evaluation = evaluateChannelSpec(createCustomDuctSpec({ DN125: 2 }), [load]);

    expect(evaluation.ok).toBe(true);
    expect(evaluation.utilizationRows).toHaveLength(2);
    expect(
      evaluation.utilizationRows.reduce(
        (sum, row) => sum + row.cableItems.reduce((itemSum, item) => itemSum + item.quantity, 0),
        0,
      ),
    ).toBe(12);
    expect(evaluation.utilizationRows.map((row) => row.label)).toEqual(['DN125 #1', 'DN125 #2']);
    expect(evaluation.utilizationRows.every((row) => row.utilizationRatio < 0.4)).toBe(true);
  });

  it('keeps AC cables out of DC and grounding duct pipes', () => {
    const evaluation = evaluateChannelSpec(createCustomDuctSpec({ DN125: 3 }), [
      {
        cableSpecId: 'spec-dc',
        usage: '直流线',
        cableClass: 'power' as const,
        quantity: 4,
        diameterMm: 23.5,
        model: 'YJV-1.8/3kV-1x185',
        areaMm2: Math.PI * (23.5 / 2) * (23.5 / 2) * 4,
      },
      {
        cableSpecId: 'spec-ground',
        usage: '接地线',
        cableClass: 'power' as const,
        quantity: 1,
        diameterMm: 13.8,
        model: 'YJV-0.6/1kV-1x50',
        areaMm2: Math.PI * (13.8 / 2) * (13.8 / 2),
      },
      {
        cableSpecId: 'spec-ac',
        usage: '交流线',
        cableClass: 'power' as const,
        quantity: 2,
        diameterMm: 11,
        model: 'VVR-0.6/1kV-2x2.5',
        areaMm2: Math.PI * (11 / 2) * (11 / 2) * 2,
      },
    ]);

    const dcGroundRow = evaluation.utilizationRows.find((row) =>
      row.cableItems.some((item) => item.usage === '直流线'),
    );
    const acRow = evaluation.utilizationRows.find((row) =>
      row.cableItems.some((item) => item.usage === '交流线'),
    );

    expect(dcGroundRow?.cableItems.map((item) => item.usage).sort()).toEqual(['接地线', '直流线']);
    expect(acRow?.cableItems).toEqual([
      expect.objectContaining({ usage: '交流线', model: 'VVR-0.6/1kV-2x2.5', quantity: 2 }),
    ]);
    expect(acRow?.label).not.toBe(dcGroundRow?.label);
  });

  it('allows power cables to use free DN32 pipes after reserving DN32 for communication cables', () => {
    const evaluation = evaluateChannelSpec(createCustomDuctSpec({ DN125: 2, DN32: 2 }), [
      {
        cableSpecId: 'spec-dc',
        usage: '直流线',
        cableClass: 'power' as const,
        quantity: 16,
        diameterMm: 23.5,
        model: 'YJV-1.8/3kV-1x185',
        areaMm2: Math.PI * (23.5 / 2) * (23.5 / 2) * 16,
      },
      {
        cableSpecId: 'spec-ground',
        usage: '接地线',
        cableClass: 'power' as const,
        quantity: 2,
        diameterMm: 13.8,
        model: 'YJV-0.6/1kV-1x50',
        areaMm2: Math.PI * (13.8 / 2) * (13.8 / 2) * 2,
      },
      {
        cableSpecId: 'spec-ac',
        usage: '交流线',
        cableClass: 'power' as const,
        quantity: 2,
        diameterMm: 11,
        model: 'VVR-0.6/1kV-2x2.5',
        areaMm2: Math.PI * (11 / 2) * (11 / 2) * 2,
      },
      {
        cableSpecId: 'spec-compressor',
        usage: '压缩机线',
        cableClass: 'power' as const,
        quantity: 2,
        diameterMm: 11,
        model: 'VVR-0.6/1kV-2x2.5',
        areaMm2: Math.PI * (11 / 2) * (11 / 2) * 2,
      },
    ]);

    expect(evaluation.warnings).toEqual([]);
    expect(
      evaluation.utilizationRows.find((row) =>
        row.cableItems.some((item) => item.usage === '交流线'),
      )?.label,
    ).toBe('DN32 #1');
    expect(
      evaluation.utilizationRows.find((row) =>
        row.cableItems.some((item) => item.usage === '压缩机线'),
      )?.label,
    ).toBe('DN32 #1');
  });

  it('evaluates custom tray compartments against power and communication fill rates', () => {
    const project = createProject();
    project.cableSpecs.push({ id: 'spec-b', model: 'RVVSP', diameterText: '约 8', diameterMm: 8 });
    project.connectionPoints[0].items[0].usage = '直流线';
    project.connectionPoints[0].items.push({
      id: 'item-comm',
      cableSpecId: 'spec-b',
      usage: '通信线',
      quantity: { mode: 'fixed', count: 1 },
      connectionHeightMm: 1000,
    });
    const tray = inferChannelSpecs(project)[0];
    const evaluation = evaluateChannelSpec(
      createCustomTraySpec({
        widthMm: 200,
        heightMm: 150,
        powerWidthMm: 150,
        communicationWidthMm: 50,
      }),
      tray.cableLoads,
    );

    expect(evaluation.ok).toBe(true);
    expect(evaluation.utilizationRows).toHaveLength(2);
  });

  it('keeps final specs while marking changed loads for review', () => {
    const project = createProject();
    const inferred = inferChannelSpecs(project)[0];
    project.topology.channels[0].finalSpec = inferred.spec ?? undefined;
    project.topology.channels[0].specLoadSignature = inferred.loadSignature;

    expect(inferChannelSpecs(project)[0]).toEqual(
      expect.objectContaining({ confirmed: true, needsReview: false }),
    );

    project.connectionPoints[0].items[0].quantity = { mode: 'fixed', count: 3 };

    expect(inferChannelSpecs(project)[0]).toEqual(
      expect.objectContaining({ confirmed: false, needsReview: true }),
    );
  });
});
