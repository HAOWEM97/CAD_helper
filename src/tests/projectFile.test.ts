import { describe, expect, it } from 'vitest';
import { buildBomSummary } from '@/domain/quantity/bom';
import type { Project } from '@/domain/project/types';
import {
  createProjectFile,
  createProjectPackage,
  parseProjectFile,
  parseProjectPackage,
  serializeProjectFile,
} from '@/services/project-io/projectFile';

function createProject(): Project {
  return {
    id: 'project-json',
    name: '工程保存测试',
    image: {
      id: 'image-a',
      name: 'floor-plan.png',
      width: 5000,
      height: 3000,
    },
    calibrationDraft: {
      activePoint: 'A',
      pointA: { imagePoint: { x: 0, y: 3000 }, cadPoint: { x: 0, y: 0 } },
      pointB: { imagePoint: { x: 5000, y: 0 }, cadPoint: { x: 5000, y: 3000 } },
    },
    calibration: {
      imagePointA: { x: 0, y: 3000 },
      imagePointB: { x: 5000, y: 0 },
      cadPointA: { x: 0, y: 0 },
      cadPointB: { x: 5000, y: 3000 },
      scaleX: 1,
      scaleY: 1,
      transform: {
        originImagePoint: { x: 0, y: 3000 },
        originCadPoint: { x: 0, y: 0 },
        imageYAxis: 'down',
        scaleX: 1,
        scaleY: 1,
      },
      updatedAt: '2026-06-03T00:00:00.000Z',
    },
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
          depthMm: 0,
          finalSpec: {
            kind: 'tray',
            source: 'standard',
            label: '200x150mm',
            widthMm: 200,
            heightMm: 150,
          },
          specLoadSignature: 'saved-load',
          cableIds: ['CAT6x2'],
        },
        {
          id: 'channel-b',
          startNodeId: 'node-b',
          endNodeId: 'node-c',
          category: 'duct',
          depthMm: -500,
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
          specLoadSignature: 'saved-load',
          cableIds: ['CAT6x2'],
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
            usage: '直流线',
            quantity: { mode: 'fixed', count: 2 },
            connectionHeightMm: 1000,
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
            usage: '直流线',
            quantity: { mode: 'fixed', count: 2 },
            connectionHeightMm: 800,
          },
        ],
      },
    ],
    cableSpecs: [{ id: 'spec-a', model: 'CAT6', diameterText: '约 10', diameterMm: 10 }],
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

describe('project JSON files', () => {
  it('serializes project data with image metadata but without image blobs or runtime objects', () => {
    const project = {
      ...createProject(),
      runtimeViewer: { unsafe: true },
    } as Project & { runtimeViewer: unknown };

    const file = createProjectFile(project);
    const raw = JSON.stringify(file);

    expect(file.kind).toBe('cad-router-web-project');
    expect(file.assetNotice.baseImageIncluded).toBe(false);
    expect(file.project.image).toEqual({
      id: 'image-a',
      name: 'floor-plan.png',
      width: 5000,
      height: 3000,
    });
    expect(raw).not.toContain('Blob');
    expect(raw).not.toContain('objectURL');
    expect(raw).not.toContain('runtimeViewer');
  });

  it('restores topology, routes, channel specs and derived BOM from exported JSON', () => {
    const project = createProject();
    const restored = parseProjectFile(serializeProjectFile(project));

    expect(restored.topology).toEqual(project.topology);
    expect(restored.deviceInstances).toEqual(project.deviceInstances);
    expect(restored.connectionPoints).toEqual(project.connectionPoints);
    expect(restored.routes).toEqual(project.routes);
    expect(buildBomSummary(restored).cableRows).toEqual(buildBomSummary(project).cableRows);
    expect(buildBomSummary(restored).channelRows).toEqual(buildBomSummary(project).channelRows);
  });

  it('packages and restores project data with a PNG base image', async () => {
    const project = createProject();
    const imageBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const packageBlob = await createProjectPackage(
      project,
      new Blob([imageBytes], { type: 'image/png' }),
    );
    const parsed = await parseProjectPackage(packageBlob);

    expect(packageBlob.type).toBe('application/vnd.cad-router.project');
    expect(parsed.project.topology).toEqual(project.topology);
    expect(parsed.project.routes).toEqual(project.routes);
    expect(parsed.imageBlob?.type).toBe('image/png');
    expect(new Uint8Array(await parsed.imageBlob!.arrayBuffer())).toEqual(imageBytes);
  });

  it('marks project files inside packages as containing the base image', async () => {
    const project = createProject();
    const packageBlob = await createProjectPackage(
      project,
      new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
    );
    const rawPackage = new Uint8Array(await packageBlob.arrayBuffer());
    const packageText = new TextDecoder().decode(rawPackage);

    expect(packageText).toContain('"baseImageIncluded": true');
    expect(packageText).toContain('工程包包含 PNG 底图');
  });

  it('normalizes legacy project-shaped JSON and rebuilds channel cable registration', () => {
    const project = createProject();
    project.topology.channels.forEach((channel) => {
      channel.cableIds = [];
    });

    const restored = parseProjectFile(JSON.stringify(project));

    expect(restored.routes).toEqual(project.routes);
    expect(restored.topology.channels.map((channel) => channel.cableIds)).toEqual([
      ['CAT6x2'],
      ['CAT6x2'],
    ]);
  });

  it('rejects invalid project JSON', () => {
    expect(() => parseProjectFile('{')).toThrow('无法解析工程 JSON，请检查文件内容。');
    expect(() => parseProjectFile(JSON.stringify({ kind: 'other' }))).toThrow(
      '工程 JSON 中缺少工程数据。',
    );
  });
});
