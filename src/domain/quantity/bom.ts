import type {
  CableRoute,
  CableSpec,
  ChannelCategory,
  ChannelSegment,
  ChannelSpec,
  ConnectionCableItem,
  DeviceConnectionPoint,
  Project,
  TopologyGraph,
} from '@/domain/project/types';
import { getDistance } from '@/domain/topology/topologyGeometry';

export type ChannelCableLoad = {
  cableSpecId: string;
  quantity: number;
  diameterMm: number;
  model: string;
};

export type InferredChannelSpec = {
  channelId: string;
  category: ChannelCategory;
  spec: ChannelSpec | null;
  cableCount: number;
  cableAreaMm2: number;
};

export type CableBomRow = {
  cableSpecId: string;
  model: string;
  quantity: number;
  totalLengthMm: number;
};

export type ChannelBomRow = {
  category: ChannelCategory;
  label: string;
  count: number;
  totalLengthMm: number;
};

export type BomSummary = {
  cableRows: CableBomRow[];
  channelRows: ChannelBomRow[];
  inferredChannelSpecs: InferredChannelSpec[];
  validRouteCount: number;
  missingDepthChannelIds: string[];
};

const TRAY_FILL_RATE = 0.4;

const STANDARD_TRAY_SIZES = [
  { widthMm: 50, heightMm: 50 },
  { widthMm: 100, heightMm: 50 },
  { widthMm: 100, heightMm: 100 },
  { widthMm: 150, heightMm: 100 },
  { widthMm: 200, heightMm: 100 },
  { widthMm: 300, heightMm: 100 },
  { widthMm: 400, heightMm: 100 },
  { widthMm: 500, heightMm: 100 },
  { widthMm: 600, heightMm: 100 },
];

function finiteQuantity(item: ConnectionCableItem) {
  return item.quantity.mode === 'fixed' ? Math.max(0, item.quantity.count) : 0;
}

function diameterForSpec(spec: CableSpec | undefined) {
  return spec?.diameterMm ?? spec?.diameterMaxMm ?? spec?.diameterMinMm ?? 0;
}

function channelLength(channel: ChannelSegment, topology: TopologyGraph) {
  const start = topology.nodes.find((node) => node.id === channel.startNodeId);
  const end = topology.nodes.find((node) => node.id === channel.endNodeId);
  return start && end ? getDistance(start.position, end.position) : 0;
}

function findMatchingEndItem(
  startItem: ConnectionCableItem,
  endItems: ConnectionCableItem[],
  cableSpecsById: Map<string, CableSpec>,
) {
  const startSpec = cableSpecsById.get(startItem.cableSpecId);
  const startModel = startSpec?.model ?? startItem.cableSpecId;

  return (
    endItems.find((item) => {
      if (item.acceptsAnyCable && item.quantity.mode === 'unlimited') {
        return true;
      }

      const spec = cableSpecsById.get(item.cableSpecId);
      return (spec?.model ?? item.cableSpecId) === startModel;
    }) ?? null
  );
}

function pathDepths(route: CableRoute, channelById: Map<string, ChannelSegment>) {
  return route.pathSegmentIds.map((channelId) => channelById.get(channelId)?.depthMm ?? 0);
}

function routeHorizontalLength(route: CableRoute, topology: TopologyGraph) {
  const channelById = new Map(topology.channels.map((channel) => [channel.id, channel]));
  return route.pathSegmentIds.reduce((sum, channelId) => {
    const channel = channelById.get(channelId);
    return sum + (channel ? channelLength(channel, topology) : 0);
  }, 0);
}

function routeVerticalAllowance(
  route: CableRoute,
  startItem: ConnectionCableItem,
  endItem: ConnectionCableItem | null,
  channelById: Map<string, ChannelSegment>,
) {
  const depths = pathDepths(route, channelById);
  if (depths.length === 0) {
    return 0;
  }

  const startDepth = depths[0];
  const endDepth = depths[depths.length - 1];
  const endHeight = endItem?.connectionHeightMm ?? startItem.connectionHeightMm;
  const transitionAllowance = depths.slice(1).reduce((sum, depth, index) => {
    return sum + Math.abs(depth - depths[index]);
  }, 0);

  return (
    Math.abs(startItem.connectionHeightMm - startDepth) +
    Math.abs(endHeight - endDepth) +
    transitionAllowance
  );
}

export function getChannelCableLoads(project: Project) {
  const loadsByChannelId = new Map<string, ChannelCableLoad[]>();
  const pointById = new Map(project.connectionPoints.map((point) => [point.id, point]));
  const cableSpecsById = new Map(project.cableSpecs.map((spec) => [spec.id, spec]));

  for (const route of project.routes) {
    if (route.status !== 'valid') {
      continue;
    }

    const fromPoint = pointById.get(route.fromConnectionPointId);
    if (!fromPoint) {
      continue;
    }

    for (const item of fromPoint.items) {
      const quantity = finiteQuantity(item);
      if (quantity === 0) {
        continue;
      }

      const spec = cableSpecsById.get(item.cableSpecId);
      const load: ChannelCableLoad = {
        cableSpecId: item.cableSpecId,
        quantity,
        diameterMm: diameterForSpec(spec),
        model: spec?.model ?? item.cableSpecId,
      };

      for (const channelId of route.pathSegmentIds) {
        loadsByChannelId.set(channelId, [...(loadsByChannelId.get(channelId) ?? []), load]);
      }
    }
  }

  return loadsByChannelId;
}

function inferTraySpec(loads: ChannelCableLoad[]): ChannelSpec | null {
  if (loads.length === 0) {
    return null;
  }

  const cableAreaMm2 = loads.reduce((sum, load) => {
    const radius = load.diameterMm / 2;
    return sum + Math.PI * radius * radius * load.quantity;
  }, 0);
  const largestDiameter = loads.reduce((max, load) => Math.max(max, load.diameterMm), 0);
  const requiredArea = cableAreaMm2 / TRAY_FILL_RATE;
  const size =
    STANDARD_TRAY_SIZES.find(
      (candidate) =>
        candidate.widthMm * candidate.heightMm >= requiredArea &&
        candidate.heightMm >= largestDiameter,
    ) ?? STANDARD_TRAY_SIZES[STANDARD_TRAY_SIZES.length - 1];

  return {
    label: `${size.widthMm}x${size.heightMm}`,
    widthMm: size.widthMm,
    heightMm: size.heightMm,
  };
}

function inferDuctSpec(loads: ChannelCableLoad[]): ChannelSpec | null {
  const cableCount = loads.reduce((sum, load) => sum + load.quantity, 0);
  if (cableCount === 0) {
    return null;
  }

  const rows = Math.max(1, Math.floor(Math.sqrt(cableCount)));
  const columns = Math.ceil(cableCount / rows);

  return {
    label: `${rows}x${columns} 排管`,
    rows,
    columns,
  };
}

export function inferChannelSpecs(project: Project) {
  const loadsByChannelId = getChannelCableLoads(project);

  return project.topology.channels.map((channel): InferredChannelSpec => {
    const loads = loadsByChannelId.get(channel.id) ?? [];
    const cableCount = loads.reduce((sum, load) => sum + load.quantity, 0);
    const cableAreaMm2 = loads.reduce((sum, load) => {
      const radius = load.diameterMm / 2;
      return sum + Math.PI * radius * radius * load.quantity;
    }, 0);
    const spec = channel.category === 'tray' ? inferTraySpec(loads) : inferDuctSpec(loads);

    return {
      channelId: channel.id,
      category: channel.category,
      spec,
      cableCount,
      cableAreaMm2,
    };
  });
}

export function buildBomSummary(project: Project): BomSummary {
  const inferredChannelSpecs = inferChannelSpecs(project);
  const inferredSpecByChannelId = new Map(
    inferredChannelSpecs.map((item) => [item.channelId, item]),
  );
  const channelById = new Map(project.topology.channels.map((channel) => [channel.id, channel]));
  const pointById = new Map(project.connectionPoints.map((point) => [point.id, point]));
  const cableSpecsById = new Map(project.cableSpecs.map((spec) => [spec.id, spec]));
  const cableRowsByKey = new Map<string, CableBomRow>();
  const channelRowsByKey = new Map<string, ChannelBomRow>();
  const missingDepthChannelIds = new Set<string>();
  let validRouteCount = 0;

  for (const channel of project.topology.channels) {
    const inferred = inferredSpecByChannelId.get(channel.id);
    if (!inferred?.spec) {
      continue;
    }

    if (channel.depthMm === undefined) {
      missingDepthChannelIds.add(channel.id);
    }

    const label = inferred.spec.label;
    const key = `${channel.category}|${label}`;
    const existing = channelRowsByKey.get(key);
    const length = channelLength(channel, project.topology);
    channelRowsByKey.set(key, {
      category: channel.category,
      label,
      count: (existing?.count ?? 0) + 1,
      totalLengthMm: (existing?.totalLengthMm ?? 0) + length,
    });
  }

  for (const route of project.routes) {
    if (route.status !== 'valid') {
      continue;
    }

    const fromPoint = pointById.get(route.fromConnectionPointId);
    const toPoint = pointById.get(route.toConnectionPointId);
    if (!fromPoint || !toPoint) {
      continue;
    }

    validRouteCount += 1;
    const horizontalLength = routeHorizontalLength(route, project.topology);

    for (const item of fromPoint.items) {
      const quantity = finiteQuantity(item);
      if (quantity === 0) {
        continue;
      }

      const spec = cableSpecsById.get(item.cableSpecId);
      const key = item.cableSpecId;
      const endItem = findMatchingEndItem(item, toPoint.items, cableSpecsById);
      const lengthPerCable =
        horizontalLength + routeVerticalAllowance(route, item, endItem, channelById);
      const existing = cableRowsByKey.get(key);

      cableRowsByKey.set(key, {
        cableSpecId: item.cableSpecId,
        model: spec?.model ?? item.cableSpecId,
        quantity: (existing?.quantity ?? 0) + quantity,
        totalLengthMm: (existing?.totalLengthMm ?? 0) + lengthPerCable * quantity,
      });
    }
  }

  return {
    cableRows: Array.from(cableRowsByKey.values()).sort((a, b) =>
      a.model.localeCompare(b.model, 'zh-Hans-CN'),
    ),
    channelRows: Array.from(channelRowsByKey.values()).sort((a, b) =>
      `${a.category}${a.label}`.localeCompare(`${b.category}${b.label}`, 'zh-Hans-CN'),
    ),
    inferredChannelSpecs,
    validRouteCount,
    missingDepthChannelIds: Array.from(missingDepthChannelIds),
  };
}
