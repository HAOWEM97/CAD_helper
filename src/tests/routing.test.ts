import { describe, expect, it } from 'vitest';
import {
  defaultCableSpecs,
  defaultConnectionPointPresets,
  defaultDeviceTypePresets,
  parseDiameterText,
} from '@/domain/library/defaultDeviceLibrary';
import { validateConnectionItems } from '@/domain/routing/connectionValidation';
import { findShortestChannelPath } from '@/domain/routing/shortestPath';
import type { ConnectionCableItem, TopologyGraph } from '@/domain/project/types';

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
    expect(defaultCableSpecs.every((spec) => !('usage' in spec))).toBe(true);
    expect(
      defaultDeviceTypePresets
        .find((preset) => preset.deviceType === '主机')
        ?.ports.find((port) => port.portType === '主机到终端')
        ?.items.map((item) => [item.usage, item.connectionHeightMm]),
    ).toEqual([
      ['交流线', 500],
      ['压缩机线', 600],
      ['接地线', 200],
      ['直流线', 800],
    ]);
    expect(defaultConnectionPointPresets.some((preset) => preset.name === '主机到终端')).toBe(
      true,
    );
    const cableWellPort = defaultDeviceTypePresets
      .find((preset) => preset.deviceType === '电缆井')
      ?.ports.find((port) => port.portType === '电缆汇总点');
    expect(cableWellPort?.items).toEqual([
      expect.objectContaining({
        acceptsAnyCable: true,
        quantity: { mode: 'unlimited' },
      }),
    ]);
    expect(parseDiameterText('约 19.5 - 20.5')).toEqual({
      diameterMinMm: 19.5,
      diameterMaxMm: 20.5,
      diameterMm: 20,
    });
  });

  it('matches finite connection items by model and quantity while ignoring usage and height', () => {
    const spec = defaultCableSpecs.find((item) => item.model === 'YJV-1.8/3kV-1x120')!;
    const items: ConnectionCableItem[] = [
      {
        id: 'item-a',
        cableSpecId: spec.id,
        usage: '直流线',
        quantity: { mode: 'fixed', count: 4 },
        connectionHeightMm: 600,
      },
    ];

    expect(
      validateConnectionItems(
        items,
        [{ ...items[0], id: 'item-b', usage: '备用线', connectionHeightMm: 1200 }],
        defaultCableSpecs,
      ).compatible,
    ).toBe(true);
    expect(
      validateConnectionItems(
        items,
        [{ ...items[0], quantity: { mode: 'fixed', count: 2 } }],
        defaultCableSpecs,
      ).compatible,
    ).toBe(false);
  });

  it('allows finite starts to connect to matching unlimited endpoints', () => {
    const spec = defaultCableSpecs.find((item) => item.model === 'YJV-0.6/1kV-1x150')!;
    const start: ConnectionCableItem[] = [
      {
        id: 'item-start',
        cableSpecId: spec.id,
        quantity: { mode: 'fixed', count: 8 },
        connectionHeightMm: 800,
      },
    ];
    const end: ConnectionCableItem[] = [
      { ...start[0], id: 'item-end', quantity: { mode: 'unlimited' }, connectionHeightMm: 500 },
    ];

    expect(validateConnectionItems(start, end, defaultCableSpecs).compatible).toBe(true);
    expect(validateConnectionItems(end, start, defaultCableSpecs).compatible).toBe(false);
  });

  it('allows finite starts to connect to an any-cable unlimited endpoint', () => {
    const spec = defaultCableSpecs.find((item) => item.model === 'YJV-1.8/3kV-1x120')!;
    const start: ConnectionCableItem[] = [
      {
        id: 'item-start',
        cableSpecId: spec.id,
        quantity: { mode: 'fixed', count: 4 },
        connectionHeightMm: 600,
      },
    ];
    const anyCableEnd: ConnectionCableItem[] = [
      {
        id: 'item-any',
        cableSpecId: 'cable-spec-*',
        acceptsAnyCable: true,
        quantity: { mode: 'unlimited' },
        connectionHeightMm: 500,
      },
    ];

    expect(validateConnectionItems(start, anyCableEnd, defaultCableSpecs)).toEqual({
      compatible: true,
      reason: '终点可承接任意线缆。',
    });
    expect(validateConnectionItems(anyCableEnd, start, defaultCableSpecs).compatible).toBe(false);
  });
});
