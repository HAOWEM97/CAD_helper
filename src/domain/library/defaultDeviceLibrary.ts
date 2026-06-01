import type {
  CableQuantity,
  CableSpec,
  ConnectionCableItem,
  ConnectionPointPreset,
  DevicePortPreset,
  DeviceTypePreset,
} from '@/domain/project/types';

type SourceRow = {
  deviceType: string;
  portType: string;
  usage: string;
  quantityText: string;
  model: string;
  diameterText: string;
  heightMm: number;
  acceptsAnyCable?: boolean;
};

const sourceRows: SourceRow[] = [
  { deviceType: '主机', portType: '主机到终端', usage: '交流线', quantityText: '1根', model: 'VVR-0.6/1kV-2x2.5', diameterText: '约 11.0', heightMm: 500 },
  { deviceType: '主机', portType: '主机到终端', usage: '压缩机线', quantityText: '1根', model: 'VVR-0.6/1kV-2x2.5', diameterText: '约 11.0', heightMm: 600 },
  { deviceType: '主机', portType: '主机到终端', usage: '接地线', quantityText: '1根', model: 'YJV-0.6/1kV-1x50', diameterText: '约 13.5 - 14.0', heightMm: 200 },
  { deviceType: '主机', portType: '主机到终端', usage: '直流线', quantityText: '8根', model: 'YJV-1.8/3kV-1x185', diameterText: '约 23.0 - 24.0', heightMm: 800 },
  { deviceType: '主机', portType: '主机到储能', usage: '直流线', quantityText: '8根', model: 'YJV-0.6/1kV-1x150', diameterText: '约 19.5 - 20.5', heightMm: 800 },
  { deviceType: '储能(带通信)', portType: '储能到汇流排柜', usage: '交流线', quantityText: '1根', model: 'VVR-0.6/1kV-2x2.5', diameterText: '约 11.0', heightMm: 600 },
  { deviceType: '储能(带通信)', portType: '储能到汇流排柜', usage: '接地线', quantityText: '1根', model: 'YJV-0.6/1kV-1x50', diameterText: '约 13.5 - 14.0', heightMm: 300 },
  { deviceType: '储能(带通信)', portType: '储能到汇流排柜', usage: '直流线', quantityText: '4根', model: 'YJV-0.6/1kV-1x150', diameterText: '约 19.5 - 20.5', heightMm: 800 },
  { deviceType: '储能(带通信)', portType: '储能到汇流排柜', usage: '通信线', quantityText: '1根', model: 'RVVSP双绞屏蔽线-2x1mm2', diameterText: '约 7.0 - 7.5', heightMm: 500 },
  { deviceType: '储能(带通信)', portType: '储能到汇流排柜', usage: '电源线', quantityText: '2根', model: 'BVVR-450/750V-1mm2', diameterText: '约 3.5 - 4.0', heightMm: 900 },
  { deviceType: '快充主机', portType: '快充主机到快充终端', usage: '直流线', quantityText: '4根', model: 'YJV-1.8/3kV-1x120', diameterText: '约 19.5 - 20.5', heightMm: 600 },
  { deviceType: '快充主机', portType: '快充主机到快充终端', usage: '交流线', quantityText: '1根', model: 'VVR-0.6/1kV-2x2.5', diameterText: '约 11.0', heightMm: 800 },
  { deviceType: '快充主机', portType: '快充主机到快充终端', usage: '通信线', quantityText: '1根', model: '超六类屏蔽网线 (Cat6A STP)', diameterText: '约 7.4 - 7.8', heightMm: 600 },
  { deviceType: '快充主机', portType: '快充主机到快充终端', usage: '接地线', quantityText: '1根', model: 'YJV-0.6/1kV-1x50', diameterText: '约 13.5 - 14.0', heightMm: 200 },
  { deviceType: '标准储能', portType: '储能到汇流排柜', usage: '交流线', quantityText: '1根', model: 'VVR-0.6/1kV-2x2.5', diameterText: '约 11.0', heightMm: 600 },
  { deviceType: '标准储能', portType: '储能到汇流排柜', usage: '接地线', quantityText: '1根', model: 'YJV-0.6/1kV-1x50', diameterText: '约 13.5 - 14.0', heightMm: 300 },
  { deviceType: '标准储能', portType: '储能到汇流排柜', usage: '直流线', quantityText: '4根', model: 'YJV-0.6/1kV-1x150', diameterText: '约 19.5 - 20.5', heightMm: 800 },
  { deviceType: '汇流排柜', portType: '储能到汇流排柜', usage: '交流线', quantityText: '不限', model: 'VVR-0.6/1kV-2x2.5', diameterText: '约 11.0', heightMm: 500 },
  { deviceType: '汇流排柜', portType: '储能到汇流排柜', usage: '接地线', quantityText: '不限', model: 'YJV-0.6/1kV-1x50', diameterText: '约 13.5 - 14.0', heightMm: 500 },
  { deviceType: '汇流排柜', portType: '储能到汇流排柜', usage: '直流线', quantityText: '不限', model: 'YJV-0.6/1kV-1x150', diameterText: '约 19.5 - 20.5', heightMm: 500 },
  { deviceType: '汇流排柜', portType: '储能到汇流排柜', usage: '通信线', quantityText: '不限', model: 'RVVSP双绞屏蔽线-2x1mm2', diameterText: '约 7.0 - 7.5', heightMm: 500 },
  { deviceType: '汇流排柜', portType: '储能到汇流排柜', usage: '电源线', quantityText: '不限', model: 'BVVR-450/750V-1mm2', diameterText: '约 3.5 - 4.0', heightMm: 500 },
  { deviceType: '汇流排柜', portType: '主机到汇流排', usage: '直流线', quantityText: '不限', model: 'YJV-0.6/1kV-1x150', diameterText: '约 19.5 - 20.5', heightMm: 500 },
  { deviceType: '标准终端', portType: '主机到终端', usage: '交流线', quantityText: '1根', model: 'VVR-0.6/1kV-2x2.5', diameterText: '约 11.0', heightMm: 500 },
  { deviceType: '标准终端', portType: '主机到终端', usage: '压缩机线', quantityText: '1根', model: 'VVR-0.6/1kV-2x2.5', diameterText: '约 11.0', heightMm: 500 },
  { deviceType: '标准终端', portType: '主机到终端', usage: '接地线', quantityText: '1根', model: 'YJV-0.6/1kV-1x50', diameterText: '约 13.5 - 14.0', heightMm: 500 },
  { deviceType: '标准终端', portType: '主机到终端', usage: '直流线', quantityText: '8根', model: 'YJV-1.8/3kV-1x185', diameterText: '约 23.0 - 24.0', heightMm: 500 },
  { deviceType: '快充终端', portType: '快充主机到快充终端', usage: '直流线', quantityText: '4根', model: 'YJV-1.8/3kV-1x120', diameterText: '约 19.5 - 20.5', heightMm: 500 },
  { deviceType: '快充终端', portType: '快充主机到快充终端', usage: '交流线', quantityText: '1根', model: 'VVR-0.6/1kV-2x2.5', diameterText: '约 11.0', heightMm: 500 },
  { deviceType: '快充终端', portType: '快充主机到快充终端', usage: '通信线', quantityText: '1根', model: '超六类屏蔽网线 (Cat6A STP)', diameterText: '约 7.4 - 7.8', heightMm: 500 },
  { deviceType: '快充终端', portType: '快充主机到快充终端', usage: '接地线', quantityText: '1根', model: 'YJV-0.6/1kV-1x50', diameterText: '约 13.5 - 14.0', heightMm: 500 },
  { deviceType: '电缆井', portType: '电缆汇总点', usage: '', quantityText: '不限', model: '*', diameterText: '', heightMm: 500, acceptsAnyCable: true },
];

export function parseCableQuantity(value: string): CableQuantity {
  if (value.includes('不限')) {
    return { mode: 'unlimited' };
  }

  const count = Number(value.match(/\d+/)?.[0] ?? 0);
  return { mode: 'fixed', count: Math.max(1, count) };
}

export function parseDiameterText(value: string) {
  const numbers = Array.from(value.matchAll(/\d+(?:\.\d+)?/g), (match) => Number(match[0]));
  if (numbers.length === 0) {
    return {};
  }

  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  return {
    diameterMinMm: min,
    diameterMaxMm: max,
    diameterMm: (min + max) / 2,
  };
}

function specId(model: string) {
  return `cable-spec-${model}`.replace(/\s+/g, '-');
}

function connectionItemFromRow(row: SourceRow): ConnectionCableItem {
  return {
    id: `connection-cable-${row.deviceType}-${row.portType}-${row.usage}-${row.model}`.replace(/\s+/g, '-'),
    cableSpecId: specId(row.model),
    acceptsAnyCable: row.acceptsAnyCable,
    usage: row.usage,
    quantity: parseCableQuantity(row.quantityText),
    connectionHeightMm: row.heightMm,
  };
}

export const defaultCableSpecs: CableSpec[] = Array.from(
  new Map(
    sourceRows.filter((row) => !row.acceptsAnyCable).map((row) => {
      const diameter = parseDiameterText(row.diameterText);
      return [
        specId(row.model),
        {
          id: specId(row.model),
          model: row.model,
          diameterText: row.diameterText,
          ...diameter,
        },
      ];
    }),
  ).values(),
);

function buildConnectionPointPreset(
  deviceType: string,
  portType: string,
  rows: SourceRow[],
): ConnectionPointPreset {
  return {
    id: `connection-point-preset-${deviceType}-${portType}`.replace(/\s+/g, '-'),
    kind: 'device-port',
    name: portType,
    items: rows.map(connectionItemFromRow),
  };
}

export const defaultConnectionPointPresets: ConnectionPointPreset[] = Array.from(
  new Map(
    sourceRows.map((row) => {
      const rows = sourceRows.filter(
        (item) => item.deviceType === row.deviceType && item.portType === row.portType,
      );
      const preset = buildConnectionPointPreset(row.deviceType, row.portType, rows);
      return [`${row.deviceType}|${row.portType}`, preset];
    }),
  ).values(),
);

export const defaultDeviceTypePresets: DeviceTypePreset[] = Array.from(
  new Set(sourceRows.map((row) => row.deviceType)),
).map((deviceType) => {
  const deviceRows = sourceRows.filter((row) => row.deviceType === deviceType);
  const portTypes = Array.from(new Set(deviceRows.map((row) => row.portType)));
  const ports: DevicePortPreset[] = portTypes.map((portType) => {
    const portRows = deviceRows.filter((row) => row.portType === portType);
    return {
      id: `port-preset-${deviceType}-${portType}`.replace(/\s+/g, '-'),
      portType,
      items: portRows.map(connectionItemFromRow),
    };
  });

  return {
    id: `device-type-${deviceType}`.replace(/\s+/g, '-'),
    deviceType,
    namePrefix: deviceType,
    ports,
  };
});
