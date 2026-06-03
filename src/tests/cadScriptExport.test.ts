import { describe, expect, it } from 'vitest';
import { buildCadScriptExport, validateCadScriptExport } from '@/domain/cad-export/cadScript';
import type { Project } from '@/domain/project/types';

function createProject(): Project {
  return {
    id: 'project-export',
    name: '导出测试',
    image: null,
    calibrationDraft: {
      activePoint: 'A',
      pointA: { imagePoint: { x: 0, y: 1000 }, cadPoint: { x: 100, y: 200 } },
      pointB: { imagePoint: { x: 1000, y: 0 }, cadPoint: { x: 1100, y: 1200 } },
    },
    calibration: {
      imagePointA: { x: 0, y: 1000 },
      imagePointB: { x: 1000, y: 0 },
      cadPointA: { x: 100, y: 200 },
      cadPointB: { x: 1100, y: 1200 },
      scaleX: 1,
      scaleY: 1,
      transform: {
        originImagePoint: { x: 0, y: 1000 },
        originCadPoint: { x: 100, y: 200 },
        imageYAxis: 'down',
        scaleX: 1,
        scaleY: 1,
      },
      updatedAt: '2026-06-03T00:00:00.000Z',
    },
    topology: {
      nodes: [
        { id: 'node-a', position: { x: 100, y: 200 } },
        { id: 'node-b', position: { x: 1100, y: 200 } },
        { id: 'node-c', position: { x: 1100, y: 1200 } },
      ],
      channels: [
        {
          id: 'channel-tray',
          startNodeId: 'node-a',
          endNodeId: 'node-b',
          category: 'tray',
          finalSpec: { kind: 'tray', source: 'standard', label: '300x150mm', widthMm: 300, heightMm: 150 },
          cableIds: [],
        },
        {
          id: 'channel-duct',
          startNodeId: 'node-b',
          endNodeId: 'node-c',
          category: 'duct',
          finalSpec: {
            kind: 'duct',
            source: 'standard',
            label: '2*DN125+2*DN32',
            ducts: [
              {
                size: 'DN125',
                count: 2,
                material: 'CPVC',
                nominalDiameterMm: 125,
                wallThicknessMm: 6,
                innerDiameterMm: 113,
              },
              {
                size: 'DN32',
                count: 2,
                material: 'steel',
                nominalDiameterMm: 32,
                innerDiameterMm: 37.4,
              },
            ],
          },
          cableIds: [],
        },
      ],
    },
    deviceInstances: [],
    connectionPoints: [],
    cableSpecs: [],
    connectionPointPresets: [],
    deviceTypePresets: [],
    routes: [],
  };
}

describe('CAD script export', () => {
  it('blocks export before calibration is complete', () => {
    const project = createProject();
    project.calibration = null;

    expect(validateCadScriptExport(project)).toEqual({
      canExport: false,
      message: '未完成坐标校准，不能导出 CAD 脚本。',
      channelCount: 0,
    });
  });

  it('writes calibrated CAD coordinates, layers and duct annotation to BAS text', () => {
    const result = buildCadScriptExport(createProject(), 'bas');

    expect(result.canExport).toBe(true);
    expect(result.channelCount).toBe(2);
    expect(result.text).toContain('CAD_HELPER_TRAY');
    expect(result.text).toContain('CAD_HELPER_DUCT');
    expect(result.text).toContain('CAD_HELPER_ANNOTATION');
    expect(result.text).toContain("' Tray source channel-tray / 300x150mm / width 300");
    expect(result.text).toContain('trayBoundaryPts0(0) = 100');
    expect(result.text).toContain('trayBoundaryPts0(2) = 1100');
    expect(result.text).toContain('trayBoundary0.Closed = True');
    expect(result.text).not.toContain('ConstantWidth');
    expect(result.text).toContain('Call AddCadHelperText("2*DN125+2*DN32", 1100, 700, 250, "CAD_HELPER_ANNOTATION")');
  });

  it('exports tray turns as hollow boundary polygons with node joint patches', () => {
    const project = createProject();
    project.topology.nodes = [
      { id: 'node-a', position: { x: 0, y: 0 } },
      { id: 'node-b', position: { x: 100, y: 0 } },
      { id: 'node-c', position: { x: 100, y: 100 } },
    ];
    project.topology.channels = [
      {
        id: 'channel-horizontal',
        startNodeId: 'node-a',
        endNodeId: 'node-b',
        category: 'tray',
        finalSpec: { kind: 'tray', source: 'standard', label: '20x10mm', widthMm: 20, heightMm: 10 },
        cableIds: [],
      },
      {
        id: 'channel-vertical',
        startNodeId: 'node-b',
        endNodeId: 'node-c',
        category: 'tray',
        finalSpec: { kind: 'tray', source: 'standard', label: '20x10mm', widthMm: 20, heightMm: 10 },
        cableIds: [],
      },
    ];

    const result = buildCadScriptExport(project, 'bas');

    expect(result.text).toContain('trayBoundary0.Closed = True');
    expect(result.text).toContain('trayBoundaryPts0(2) = 110');
    expect(result.text).toContain('trayBoundaryPts0(3) = -10');
    expect(result.text).toContain('trayBoundaryPts0(4) = 110');
    expect(result.text).toContain('trayBoundaryPts0(5) = 100');
    expect(result.text).toContain('trayBoundaryPts0(8) = 90');
    expect(result.text).toContain('trayBoundaryPts0(9) = 10');
  });

  it('uses late-bound object declarations for ZWCAD VBA compatibility', () => {
    const result = buildCadScriptExport(createProject(), 'bas');

    expect(result.text).toContain('Dim layer As Object');
    expect(result.text).toContain('Dim textEntity As Object');
    expect(result.text).toContain('Dim trayBoundary0 As Object');
    expect(result.text).toContain('Dim duct0 As Object');
    expect(result.text).not.toMatch(/As Acad[A-Za-z]+/);
    expect(result.text).not.toContain('acAllViewports');
  });

  it('keeps an SCR generation interface for later delivery', () => {
    const result = buildCadScriptExport(createProject(), 'scr');

    expect(result.canExport).toBe(true);
    expect(result.text).toContain('; CAD Helper generated SCR script');
    expect(result.text).toContain('PLINE');
    expect(result.text).toContain('LINE');
    expect(result.text).toContain('2*DN125+2*DN32');
  });
});
