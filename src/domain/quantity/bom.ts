import type {
  CableRoute,
  CableSpec,
  ChannelCategory,
  ChannelSegment,
  ChannelSpec,
  ConnectionCableItem,
  DuctSpecItem,
  DuctSize,
  Project,
  TopologyGraph,
} from '@/domain/project/types';
import { getDistance } from '@/domain/topology/topologyGeometry';

export type CableClass = 'communication' | 'power';

export type ChannelCableLoad = {
  cableSpecId: string;
  usage: string;
  cableClass: CableClass;
  quantity: number;
  diameterMm: number;
  model: string;
  areaMm2: number;
};

export type ChannelUtilizationRow = {
  label: string;
  cableClass: CableClass;
  cableAreaMm2: number;
  capacityAreaMm2: number;
  limitRatio: number;
  utilizationRatio: number;
  ok: boolean;
  cableItems: Array<{
    model: string;
    usage: string;
    quantity: number;
    diameterMm: number;
  }>;
};

export type ChannelSpecEvaluation = {
  spec: ChannelSpec | null;
  utilizationRows: ChannelUtilizationRow[];
  maxUtilizationRatio: number;
  warnings: string[];
  ok: boolean;
};

export type InferredChannelSpec = {
  channelId: string;
  category: ChannelCategory;
  spec: ChannelSpec | null;
  effectiveSpec: ChannelSpec | null;
  finalSpec: ChannelSpec | null;
  cableCount: number;
  cableAreaMm2: number;
  communicationAreaMm2: number;
  powerAreaMm2: number;
  loadSignature: string;
  confirmed: boolean;
  needsReview: boolean;
  cableLoads: ChannelCableLoad[];
  evaluation: ChannelSpecEvaluation;
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

export type ChannelLengthDetail = {
  channelId: string;
  horizontalLengthMm: number;
};

export type RouteDetail = {
  routeId: string;
  horizontalLengthMm: number;
};

const POWER_FILL_LIMIT = 0.4;
const COMMUNICATION_FILL_LIMIT = 0.5;

export const DUCT_SIZE_DEFINITIONS: Record<DuctSize, DuctSpecItem> = {
  DN125: {
    size: 'DN125',
    count: 1,
    material: 'CPVC',
    nominalDiameterMm: 125,
    wallThicknessMm: 6,
    innerDiameterMm: 113,
  },
  DN100: {
    size: 'DN100',
    count: 1,
    material: 'CPVC',
    nominalDiameterMm: 100,
    wallThicknessMm: 5,
    innerDiameterMm: 90,
  },
  DN32: {
    size: 'DN32',
    count: 1,
    material: 'steel',
    nominalDiameterMm: 32,
    innerDiameterMm: 37.4,
  },
};

function ductDefinition(size: DuctSize, count: number) {
  return {
    ...DUCT_SIZE_DEFINITIONS[size],
    count,
  };
}

export const STANDARD_TRAY_SPECS: ChannelSpec[] = [
  { kind: 'tray', source: 'standard', label: '200x150mm', widthMm: 200, heightMm: 150 },
  { kind: 'tray', source: 'standard', label: '300x150mm', widthMm: 300, heightMm: 150 },
  { kind: 'tray', source: 'standard', label: '500x150mm', widthMm: 500, heightMm: 150 },
];

export const STANDARD_DIVIDED_TRAY_SPECS: ChannelSpec[] = [
  {
    kind: 'tray',
    source: 'standard',
    label: '200x150mm（带分隔板150/50）',
    widthMm: 200,
    heightMm: 150,
    divider: { powerWidthMm: 150, communicationWidthMm: 50 },
  },
  {
    kind: 'tray',
    source: 'standard',
    label: '300x150mm（带分隔板250/50）',
    widthMm: 300,
    heightMm: 150,
    divider: { powerWidthMm: 250, communicationWidthMm: 50 },
  },
  {
    kind: 'tray',
    source: 'standard',
    label: '500x150mm（带分隔板450/50）',
    widthMm: 500,
    heightMm: 150,
    divider: { powerWidthMm: 450, communicationWidthMm: 50 },
  },
];

export const STANDARD_DUCT_SPECS: ChannelSpec[] = [
  {
    kind: 'duct',
    source: 'standard',
    label: '16*DN125',
    ducts: [ductDefinition('DN125', 16)],
  },
  {
    kind: 'duct',
    source: 'standard',
    label: '12*DN125',
    ducts: [ductDefinition('DN125', 12)],
  },
  {
    kind: 'duct',
    source: 'standard',
    label: '8*DN125',
    ducts: [ductDefinition('DN125', 8)],
  },
  {
    kind: 'duct',
    source: 'standard',
    label: '2*DN125+2*DN32',
    ducts: [ductDefinition('DN125', 2), ductDefinition('DN32', 2)],
  },
];

export function createCustomTraySpec(input: {
  widthMm: number;
  heightMm: number;
  powerWidthMm?: number;
  communicationWidthMm?: number;
}): ChannelSpec {
  const widthMm = Math.max(0, input.widthMm);
  const heightMm = Math.max(0, input.heightMm);
  const hasDivider =
    typeof input.powerWidthMm === 'number' && typeof input.communicationWidthMm === 'number';

  return {
    kind: 'tray',
    source: 'custom',
    label: hasDivider
      ? `${widthMm}x${heightMm}mm（带分隔板${input.powerWidthMm}/${input.communicationWidthMm}）`
      : `${widthMm}x${heightMm}mm（自定义）`,
    widthMm,
    heightMm,
    divider: hasDivider
      ? {
          powerWidthMm: Math.max(0, input.powerWidthMm ?? 0),
          communicationWidthMm: Math.max(0, input.communicationWidthMm ?? 0),
        }
      : undefined,
  };
}

export function createCustomDuctSpec(counts: Partial<Record<DuctSize, number>>): ChannelSpec {
  const ducts = (Object.keys(DUCT_SIZE_DEFINITIONS) as DuctSize[])
    .map((size) => ductDefinition(size, Math.max(0, Math.floor(counts[size] ?? 0))))
    .filter((duct) => duct.count > 0);
  const label = ducts.length
    ? ducts.map((duct) => `${duct.count}*${duct.size}`).join('+')
    : '自定义排管';

  return {
    kind: 'duct',
    source: 'custom',
    label,
    ducts,
  };
}

export function specKey(spec: ChannelSpec | null | undefined) {
  if (!spec) {
    return '';
  }

  if (spec.kind === 'duct') {
    return `duct:${(spec.ducts ?? [])
      .map((duct) => `${duct.size}:${duct.count}`)
      .join('|')}:${spec.source ?? 'standard'}`;
  }

  const divider = spec.divider
    ? `${spec.divider.powerWidthMm}:${spec.divider.communicationWidthMm}`
    : 'none';
  return `tray:${spec.widthMm}:${spec.heightMm}:${divider}:${spec.source ?? 'standard'}`;
}

export function defaultDepthForSpec(spec: ChannelSpec | null | undefined) {
  if (!spec) {
    return undefined;
  }

  if (spec.kind === 'tray') {
    return 0;
  }

  if (spec.source === 'custom') {
    return -500;
  }

  switch (spec.label) {
    case '16*DN125':
      return -1190;
    case '12*DN125':
      return -1035;
    case '8*DN125':
      return -880;
    case '2*DN125+2*DN32':
      return -500;
    default:
      return -500;
  }
}

function finiteQuantity(item: ConnectionCableItem) {
  return item.quantity.mode === 'fixed' ? Math.max(0, item.quantity.count) : 0;
}

function diameterForSpec(spec: CableSpec | undefined) {
  return spec?.diameterMm ?? spec?.diameterMaxMm ?? spec?.diameterMinMm ?? 0;
}

function cableArea(diameterMm: number, quantity: number) {
  const radius = diameterMm / 2;
  return Math.PI * radius * radius * quantity;
}

export function classifyCableUsage(usage: string | undefined): CableClass {
  return usage?.includes('通信线') ? 'communication' : 'power';
}

export function getChannelHorizontalLength(
  topology: TopologyGraph,
  channelId: string,
): ChannelLengthDetail | null {
  const channel = topology.channels.find((item) => item.id === channelId);
  if (!channel) {
    return null;
  }

  const start = topology.nodes.find((node) => node.id === channel.startNodeId);
  const end = topology.nodes.find((node) => node.id === channel.endNodeId);
  if (!start || !end) {
    return null;
  }

  return {
    channelId,
    horizontalLengthMm: getDistance(start.position, end.position),
  };
}

function channelLength(channel: ChannelSegment, topology: TopologyGraph) {
  return getChannelHorizontalLength(topology, channel.id)?.horizontalLengthMm ?? 0;
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

export function buildRouteDetail(project: Project, routeId: string): RouteDetail | null {
  const route = project.routes.find((item) => item.id === routeId);
  if (!route) {
    return null;
  }

  return {
    routeId: route.id,
    horizontalLengthMm: routeHorizontalLength(route, project.topology),
  };
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
      const diameterMm = diameterForSpec(spec);
      const load: ChannelCableLoad = {
        cableSpecId: item.cableSpecId,
        usage: item.usage?.trim() ?? '',
        cableClass: classifyCableUsage(item.usage),
        quantity,
        diameterMm,
        model: spec?.model ?? item.cableSpecId,
        areaMm2: cableArea(diameterMm, quantity),
      };

      for (const channelId of route.pathSegmentIds) {
        loadsByChannelId.set(channelId, [...(loadsByChannelId.get(channelId) ?? []), load]);
      }
    }
  }

  return loadsByChannelId;
}

function aggregateLoads(loads: ChannelCableLoad[]) {
  const cableCount = loads.reduce((sum, load) => sum + load.quantity, 0);
  const cableAreaMm2 = loads.reduce((sum, load) => sum + load.areaMm2, 0);
  const communicationAreaMm2 = loads
    .filter((load) => load.cableClass === 'communication')
    .reduce((sum, load) => sum + load.areaMm2, 0);
  const powerAreaMm2 = cableAreaMm2 - communicationAreaMm2;

  return { cableCount, cableAreaMm2, communicationAreaMm2, powerAreaMm2 };
}

function loadSignature(category: ChannelCategory, loads: ChannelCableLoad[]) {
  return [
    category,
    ...loads
      .map((load) =>
        [
          load.cableSpecId,
          load.model,
          load.usage,
          load.cableClass,
          load.quantity,
          load.diameterMm.toFixed(3),
        ].join(':'),
      )
      .sort(),
  ].join('|');
}

function capacityForCircle(innerDiameterMm: number) {
  return Math.PI * (innerDiameterMm / 2) * (innerDiameterMm / 2);
}

function makeUtilizationRow(
  label: string,
  cableClass: CableClass,
  cableAreaMm2: number,
  capacityAreaMm2: number,
  limitRatio: number,
  cableItems: ChannelUtilizationRow['cableItems'] = [],
): ChannelUtilizationRow {
  const utilizationRatio = capacityAreaMm2 > 0 ? cableAreaMm2 / capacityAreaMm2 : Number.POSITIVE_INFINITY;
  return {
    label,
    cableClass,
    cableAreaMm2,
    capacityAreaMm2,
    limitRatio,
    utilizationRatio,
    ok: utilizationRatio < limitRatio,
    cableItems,
  };
}

function summarizeEvaluation(spec: ChannelSpec | null, rows: ChannelUtilizationRow[], baseWarnings: string[] = []) {
  const warnings = [
    ...baseWarnings,
    ...rows
      .filter((row) => !row.ok)
      .map(
        (row) =>
          `${row.label} 容积率 ${(row.utilizationRatio * 100).toFixed(1)}%，超过 ${(row.limitRatio * 100).toFixed(0)}%。`,
      ),
  ];

  return {
    spec,
    utilizationRows: rows,
    maxUtilizationRatio: rows.reduce((max, row) => Math.max(max, row.utilizationRatio), 0),
    warnings,
    ok: warnings.length === 0,
  };
}

function cableItemsFromLoads(loads: ChannelCableLoad[]) {
  const itemByKey = new Map<string, ChannelUtilizationRow['cableItems'][number]>();

  for (const load of loads) {
    const key = `${load.model}|${load.usage}|${load.diameterMm}`;
    const existing = itemByKey.get(key);
    itemByKey.set(key, {
      model: load.model,
      usage: load.usage,
      quantity: (existing?.quantity ?? 0) + load.quantity,
      diameterMm: load.diameterMm,
    });
  }

  return Array.from(itemByKey.values()).sort((a, b) => a.model.localeCompare(b.model, 'zh-Hans-CN'));
}

function evaluateTraySpec(spec: ChannelSpec | null, loads: ChannelCableLoad[]) {
  if (!spec) {
    return summarizeEvaluation(null, []);
  }

  const { communicationAreaMm2, powerAreaMm2 } = aggregateLoads(loads);
  const widthMm = spec.widthMm ?? 0;
  const heightMm = spec.heightMm ?? 0;
  const hasCommunication = communicationAreaMm2 > 0;
  const hasPower = powerAreaMm2 > 0;
  const warnings: string[] = [];
  const rows: ChannelUtilizationRow[] = [];
  const powerItems = cableItemsFromLoads(loads.filter((load) => load.cableClass === 'power'));
  const communicationItems = cableItemsFromLoads(
    loads.filter((load) => load.cableClass === 'communication'),
  );

  if (hasCommunication && hasPower && !spec.divider) {
    warnings.push('同时包含通信线和配电线，应使用带分隔板线槽。');
  }

  if (spec.divider) {
    rows.push(
      makeUtilizationRow(
        '配电仓',
        'power',
        powerAreaMm2,
        spec.divider.powerWidthMm * heightMm,
        POWER_FILL_LIMIT,
        powerItems,
      ),
    );
    rows.push(
      makeUtilizationRow(
        '通信仓',
        'communication',
        communicationAreaMm2,
        spec.divider.communicationWidthMm * heightMm,
        COMMUNICATION_FILL_LIMIT,
        communicationItems,
      ),
    );
  } else if (hasCommunication && !hasPower) {
    rows.push(
      makeUtilizationRow(
        '线槽',
        'communication',
        communicationAreaMm2,
        widthMm * heightMm,
        COMMUNICATION_FILL_LIMIT,
        communicationItems,
      ),
    );
  } else {
    rows.push(
      makeUtilizationRow('线槽', 'power', powerAreaMm2, widthMm * heightMm, POWER_FILL_LIMIT, powerItems),
    );
  }

  return summarizeEvaluation(spec, rows, warnings);
}

function expandDucts(spec: ChannelSpec | null) {
  return (spec?.ducts ?? []).flatMap((duct) =>
    Array.from({ length: duct.count }, (_, index) => ({
      ...duct,
      label: `${duct.size} #${index + 1}`,
    })),
  );
}

function pipeCompatibilityKey(load: Pick<ChannelCableLoad, 'cableClass' | 'model' | 'usage'>) {
  if (load.cableClass === 'communication') {
    return `communication:${load.model}`;
  }

  if (load.usage.includes('直流线') || load.usage.includes('接地线')) {
    return 'power:dc-ground';
  }

  return `power:model:${load.model}`;
}

function expandCableUnits(loads: ChannelCableLoad[], cableClass: CableClass) {
  return loads
    .filter((load) => load.cableClass === cableClass)
    .flatMap((load) => {
      const singleAreaMm2 = load.quantity > 0 ? load.areaMm2 / load.quantity : 0;
      return Array.from({ length: load.quantity }, () => ({
        model: load.model,
        usage: load.usage,
        diameterMm: load.diameterMm,
        areaMm2: singleAreaMm2,
        compatibilityKey: pipeCompatibilityKey(load),
      }));
    })
    .sort((a, b) => b.areaMm2 - a.areaMm2);
}

function allocateCableUnits(
  cableUnits: ReturnType<typeof expandCableUnits>,
  pipes: Array<{ label: string; innerDiameterMm: number }>,
  limitRatio: number,
) {
  const allocations = pipes.map((pipe) => ({
    label: pipe.label,
    capacityAreaMm2: capacityForCircle(pipe.innerDiameterMm),
    areaMm2: 0,
    compatibilityKey: null as string | null,
    cableItems: [] as ChannelUtilizationRow['cableItems'],
  }));
  const warnings: string[] = [];

  for (const unit of cableUnits) {
    const target = allocations
      .filter(
        (pipe) =>
          (!pipe.compatibilityKey || pipe.compatibilityKey === unit.compatibilityKey) &&
          (pipe.areaMm2 + unit.areaMm2) / pipe.capacityAreaMm2 < limitRatio,
      )
      .sort(
        (a, b) => {
          const aSameGroup = a.compatibilityKey === unit.compatibilityKey ? 0 : 1;
          const bSameGroup = b.compatibilityKey === unit.compatibilityKey ? 0 : 1;
          return (
            aSameGroup - bSameGroup ||
            a.areaMm2 / a.capacityAreaMm2 - b.areaMm2 / b.capacityAreaMm2 ||
            b.capacityAreaMm2 - a.capacityAreaMm2
          );
        },
      )[0];

    if (target) {
      addUnitToPipe(target, unit);
    } else if (allocations.length > 0) {
      const fallback = allocations
        .filter((pipe) => !pipe.compatibilityKey || pipe.compatibilityKey === unit.compatibilityKey)
        .sort(
          (a, b) =>
            a.areaMm2 / a.capacityAreaMm2 - b.areaMm2 / b.capacityAreaMm2 ||
            b.capacityAreaMm2 - a.capacityAreaMm2,
        )[0];
      if (fallback) {
        addUnitToPipe(fallback, unit);
      } else {
        warnings.push(`${unit.usage ? `${unit.usage} / ` : ''}${unit.model} 缺少可独立敷设的管道。`);
      }
    } else if (unit.areaMm2 > 0) {
      warnings.push(`${unit.model} 没有可用管道。`);
    }
  }

  return { allocations, warnings };
}

function addUnitToPipe(
  pipe: {
    areaMm2: number;
    compatibilityKey: string | null;
    cableItems: ChannelUtilizationRow['cableItems'];
  },
  unit: ReturnType<typeof expandCableUnits>[number],
) {
  pipe.areaMm2 += unit.areaMm2;
  pipe.compatibilityKey = unit.compatibilityKey;
  const existing = pipe.cableItems.find(
    (item) =>
      item.model === unit.model &&
      item.usage === unit.usage &&
      item.diameterMm === unit.diameterMm,
  );
  if (existing) {
    existing.quantity += 1;
  } else {
    pipe.cableItems.push({
      model: unit.model,
      usage: unit.usage,
      quantity: 1,
      diameterMm: unit.diameterMm,
    });
  }
}

function evaluateDuctSpec(spec: ChannelSpec | null, loads: ChannelCableLoad[]) {
  if (!spec) {
    return summarizeEvaluation(null, []);
  }

  const expanded = expandDucts(spec);
  const communicationPipes = expanded.filter((pipe) => pipe.size === 'DN32');
  const communicationUnits = expandCableUnits(loads, 'communication');
  const powerUnits = expandCableUnits(loads, 'power');
  const communicationAllocation = allocateCableUnits(
    communicationUnits,
    communicationPipes,
    COMMUNICATION_FILL_LIMIT,
  );
  const usedCommunicationPipeLabels = new Set(
    communicationAllocation.allocations
      .filter((pipe) => pipe.areaMm2 > 0)
      .map((pipe) => pipe.label),
  );
  const powerPipes = expanded.filter(
    (pipe) => pipe.size !== 'DN32' || !usedCommunicationPipeLabels.has(pipe.label),
  );
  const powerAllocation = allocateCableUnits(powerUnits, powerPipes, POWER_FILL_LIMIT);
  const rows = [
    ...powerAllocation.allocations
      .filter((pipe) => pipe.areaMm2 > 0)
      .map((pipe) =>
        makeUtilizationRow(
          pipe.label,
          'power',
          pipe.areaMm2,
          pipe.capacityAreaMm2,
          POWER_FILL_LIMIT,
          pipe.cableItems,
        ),
      ),
    ...communicationAllocation.allocations
      .filter((pipe) => pipe.areaMm2 > 0)
      .map((pipe) =>
        makeUtilizationRow(
          pipe.label,
          'communication',
          pipe.areaMm2,
          pipe.capacityAreaMm2,
          COMMUNICATION_FILL_LIMIT,
          pipe.cableItems,
        ),
      ),
  ];

  const warnings = [...powerAllocation.warnings, ...communicationAllocation.warnings];
  if (communicationUnits.length > 0 && communicationPipes.length === 0) {
    warnings.push('通信线必须敷设在 DN32 钢管内。');
  }
  if (powerUnits.length > 0 && powerPipes.length === 0) {
    warnings.push('配电线缺少可用管道。');
  }

  return summarizeEvaluation(spec, rows, warnings);
}

export function evaluateChannelSpec(spec: ChannelSpec | null, loads: ChannelCableLoad[]) {
  if (spec?.kind === 'duct') {
    return evaluateDuctSpec(spec, loads);
  }

  return evaluateTraySpec(spec, loads);
}

function scoreEvaluation(evaluation: ChannelSpecEvaluation, loads: ChannelCableLoad[]) {
  const spec = evaluation.spec;
  const { communicationAreaMm2, powerAreaMm2 } = aggregateLoads(loads);
  let usableCapacityMm2 = 0;

  if (spec?.kind === 'duct') {
    for (const duct of spec.ducts ?? []) {
      const capacity = capacityForCircle(duct.innerDiameterMm) * duct.count;
      if (duct.size === 'DN32' && communicationAreaMm2 > 0) {
        usableCapacityMm2 += capacity * COMMUNICATION_FILL_LIMIT;
      }
      if (powerAreaMm2 > 0) {
        usableCapacityMm2 += capacity * POWER_FILL_LIMIT;
      }
    }
  } else if (spec?.divider) {
    usableCapacityMm2 =
      spec.divider.powerWidthMm * (spec.heightMm ?? 0) * POWER_FILL_LIMIT +
      spec.divider.communicationWidthMm * (spec.heightMm ?? 0) * COMMUNICATION_FILL_LIMIT;
  } else if (spec) {
    const limit = communicationAreaMm2 > 0 && powerAreaMm2 === 0 ? COMMUNICATION_FILL_LIMIT : POWER_FILL_LIMIT;
    usableCapacityMm2 = (spec.widthMm ?? 0) * (spec.heightMm ?? 0) * limit;
  }

  const spare = Math.max(0, usableCapacityMm2 - communicationAreaMm2 - powerAreaMm2);
  return evaluation.ok ? spare : Number.POSITIVE_INFINITY;
}

function bestSpecFromCandidates(candidates: ChannelSpec[], loads: ChannelCableLoad[]) {
  const evaluations = candidates.map((spec) => evaluateChannelSpec(spec, loads));
  const compliant = evaluations.filter((evaluation) => evaluation.ok);
  if (compliant.length > 0) {
    return compliant.reduce((best, evaluation) =>
      scoreEvaluation(evaluation, loads) < scoreEvaluation(best, loads) ? evaluation : best,
    );
  }

  return evaluations[evaluations.length - 1] ?? summarizeEvaluation(null, []);
}

function inferTraySpec(loads: ChannelCableLoad[]): ChannelSpec | null {
  if (loads.length === 0) {
    return null;
  }

  const { communicationAreaMm2, powerAreaMm2 } = aggregateLoads(loads);
  const candidates =
    communicationAreaMm2 > 0 && powerAreaMm2 > 0
      ? STANDARD_DIVIDED_TRAY_SPECS
      : STANDARD_TRAY_SPECS;
  return bestSpecFromCandidates(candidates, loads).spec;
}

function inferDuctSpec(loads: ChannelCableLoad[]): ChannelSpec | null {
  if (loads.length === 0) {
    return null;
  }

  return bestSpecFromCandidates(STANDARD_DUCT_SPECS, loads).spec;
}

export function getSelectableSpecs(category: ChannelCategory) {
  return category === 'tray'
    ? [...STANDARD_TRAY_SPECS, ...STANDARD_DIVIDED_TRAY_SPECS]
    : STANDARD_DUCT_SPECS;
}

export function inferChannelSpecs(project: Project) {
  const loadsByChannelId = getChannelCableLoads(project);

  return project.topology.channels.map((channel): InferredChannelSpec => {
    const loads = loadsByChannelId.get(channel.id) ?? [];
    const { cableCount, cableAreaMm2, communicationAreaMm2, powerAreaMm2 } = aggregateLoads(loads);
    const spec = channel.category === 'tray' ? inferTraySpec(loads) : inferDuctSpec(loads);
    const finalSpec = channel.finalSpec ?? null;
    const effectiveSpec = finalSpec ?? spec;
    const signature = loadSignature(channel.category, loads);
    const evaluation = evaluateChannelSpec(effectiveSpec, loads);
    const confirmed = Boolean(finalSpec && channel.specLoadSignature === signature);
    const needsReview = Boolean(finalSpec && channel.specLoadSignature !== signature);

    return {
      channelId: channel.id,
      category: channel.category,
      spec,
      effectiveSpec,
      finalSpec,
      cableCount,
      cableAreaMm2,
      communicationAreaMm2,
      powerAreaMm2,
      loadSignature: signature,
      confirmed,
      needsReview,
      cableLoads: loads,
      evaluation,
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
    const effectiveSpec = inferred?.effectiveSpec;
    if (!effectiveSpec) {
      continue;
    }

    if (channel.depthMm === undefined) {
      missingDepthChannelIds.add(channel.id);
    }

    const key = `${channel.category}|${effectiveSpec.label}`;
    const existing = channelRowsByKey.get(key);
    const length = channelLength(channel, project.topology);
    channelRowsByKey.set(key, {
      category: channel.category,
      label: effectiveSpec.label,
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
