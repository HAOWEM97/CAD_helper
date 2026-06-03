import { inferChannelSpecs } from '@/domain/quantity/bom';
import type { CadPoint } from '@/domain/cad-coordinate/types';
import type {
  ChannelCategory,
  ChannelSegment,
  ChannelSpec,
  Project,
  TopologyNode,
} from '@/domain/project/types';

export type CadScriptFormat = 'bas' | 'scr';

export type CadScriptExport = {
  canExport: boolean;
  message: string;
  format: CadScriptFormat;
  text: string;
  channelCount: number;
};

type ExportableChannel = {
  channel: ChannelSegment;
  category: ChannelCategory;
  start: CadPoint;
  end: CadPoint;
  spec: ChannelSpec | null;
  label: string;
};

type CadRect = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

const TRAY_LAYER = 'CAD_HELPER_TRAY';
const DUCT_LAYER = 'CAD_HELPER_DUCT';
const ANNOTATION_LAYER = 'CAD_HELPER_ANNOTATION';
const DEFAULT_TEXT_HEIGHT = 250;
const GEOMETRY_EPSILON = 1e-6;

function cadNumber(value: number) {
  if (!Number.isFinite(value)) {
    return '0';
  }

  return value
    .toFixed(3)
    .replace(/\.?0+$/, '');
}

function vbaString(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function scrString(value: string) {
  return value.replace(/\r?\n/g, ' ').trim() || '-';
}

function channelSpecLabel(channel: ChannelSegment, inferredSpec: ChannelSpec | null | undefined) {
  return channel.finalSpec?.label ?? inferredSpec?.label ?? channel.recommendedSpec?.label ?? '';
}

function channelWidthMm(channel: ExportableChannel) {
  if (channel.category !== 'tray') {
    return 0;
  }

  return channel.spec?.widthMm ?? 0;
}

function pointKey(point: CadPoint) {
  return `${point.x.toFixed(6)},${point.y.toFixed(6)}`;
}

function pointsEqual(a: CadPoint, b: CadPoint) {
  return Math.abs(a.x - b.x) <= GEOMETRY_EPSILON && Math.abs(a.y - b.y) <= GEOMETRY_EPSILON;
}

function normalizeRect(rect: CadRect): CadRect | null {
  const x1 = Math.min(rect.x1, rect.x2);
  const x2 = Math.max(rect.x1, rect.x2);
  const y1 = Math.min(rect.y1, rect.y2);
  const y2 = Math.max(rect.y1, rect.y2);

  if (x2 - x1 <= GEOMETRY_EPSILON || y2 - y1 <= GEOMETRY_EPSILON) {
    return null;
  }

  return { x1, y1, x2, y2 };
}

function uniqueSorted(values: number[]) {
  return Array.from(new Set(values.map((value) => Number(value.toFixed(6))))).sort(
    (a, b) => a - b,
  );
}

function rectContainsCenter(rect: CadRect, x: number, y: number) {
  return (
    x > rect.x1 + GEOMETRY_EPSILON &&
    x < rect.x2 - GEOMETRY_EPSILON &&
    y > rect.y1 + GEOMETRY_EPSILON &&
    y < rect.y2 - GEOMETRY_EPSILON
  );
}

function simplifyOrthogonalLoop(points: CadPoint[]) {
  const simplified: CadPoint[] = [];

  for (const point of points) {
    const previous = simplified[simplified.length - 1];
    if (!previous || !pointsEqual(previous, point)) {
      simplified.push(point);
    }
  }

  if (simplified.length > 1 && pointsEqual(simplified[0], simplified[simplified.length - 1])) {
    simplified.pop();
  }

  let changed = true;
  while (changed && simplified.length > 2) {
    changed = false;
    for (let index = 0; index < simplified.length; index += 1) {
      const previous = simplified[(index - 1 + simplified.length) % simplified.length];
      const current = simplified[index];
      const next = simplified[(index + 1) % simplified.length];
      const collinearX =
        Math.abs(previous.x - current.x) <= GEOMETRY_EPSILON &&
        Math.abs(current.x - next.x) <= GEOMETRY_EPSILON;
      const collinearY =
        Math.abs(previous.y - current.y) <= GEOMETRY_EPSILON &&
        Math.abs(current.y - next.y) <= GEOMETRY_EPSILON;
      if (collinearX || collinearY) {
        simplified.splice(index, 1);
        changed = true;
        break;
      }
    }
  }

  return simplified;
}

function traceBoundaryLoops(rects: CadRect[]) {
  if (rects.length === 0) {
    return [];
  }

  const xs = uniqueSorted(rects.flatMap((rect) => [rect.x1, rect.x2]));
  const ys = uniqueSorted(rects.flatMap((rect) => [rect.y1, rect.y2]));
  const occupied = Array.from({ length: Math.max(0, xs.length - 1) }, () =>
    Array.from({ length: Math.max(0, ys.length - 1) }, () => false),
  );

  for (let xIndex = 0; xIndex < xs.length - 1; xIndex += 1) {
    for (let yIndex = 0; yIndex < ys.length - 1; yIndex += 1) {
      const centerX = (xs[xIndex] + xs[xIndex + 1]) / 2;
      const centerY = (ys[yIndex] + ys[yIndex + 1]) / 2;
      occupied[xIndex][yIndex] = rects.some((rect) => rectContainsCenter(rect, centerX, centerY));
    }
  }

  const edges: Array<{ from: CadPoint; to: CadPoint; used: boolean }> = [];
  const cellOccupied = (xIndex: number, yIndex: number) =>
    xIndex >= 0 &&
    yIndex >= 0 &&
    xIndex < occupied.length &&
    yIndex < (occupied[xIndex]?.length ?? 0) &&
    occupied[xIndex][yIndex];

  for (let xIndex = 0; xIndex < xs.length - 1; xIndex += 1) {
    for (let yIndex = 0; yIndex < ys.length - 1; yIndex += 1) {
      if (!occupied[xIndex][yIndex]) {
        continue;
      }

      const leftBottom = { x: xs[xIndex], y: ys[yIndex] };
      const rightBottom = { x: xs[xIndex + 1], y: ys[yIndex] };
      const rightTop = { x: xs[xIndex + 1], y: ys[yIndex + 1] };
      const leftTop = { x: xs[xIndex], y: ys[yIndex + 1] };

      if (!cellOccupied(xIndex, yIndex - 1)) {
        edges.push({ from: leftBottom, to: rightBottom, used: false });
      }
      if (!cellOccupied(xIndex + 1, yIndex)) {
        edges.push({ from: rightBottom, to: rightTop, used: false });
      }
      if (!cellOccupied(xIndex, yIndex + 1)) {
        edges.push({ from: rightTop, to: leftTop, used: false });
      }
      if (!cellOccupied(xIndex - 1, yIndex)) {
        edges.push({ from: leftTop, to: leftBottom, used: false });
      }
    }
  }

  const edgesByStart = new Map<string, Array<(typeof edges)[number]>>();
  for (const edge of edges) {
    const key = pointKey(edge.from);
    edgesByStart.set(key, [...(edgesByStart.get(key) ?? []), edge]);
  }

  const loops: CadPoint[][] = [];
  for (const edge of edges) {
    if (edge.used) {
      continue;
    }

    const loop = [edge.from];
    let current = edge;
    current.used = true;

    while (true) {
      loop.push(current.to);
      if (pointsEqual(current.to, loop[0])) {
        break;
      }

      const next = edgesByStart.get(pointKey(current.to))?.find((candidate) => !candidate.used);
      if (!next) {
        break;
      }

      next.used = true;
      current = next;
    }

    const simplified = simplifyOrthogonalLoop(loop);
    if (simplified.length >= 4) {
      loops.push(simplified);
    }
  }

  return loops;
}

function traySegmentRect(channel: ExportableChannel) {
  const width = channelWidthMm(channel);
  if (width <= 0) {
    return null;
  }

  const halfWidth = width / 2;
  if (Math.abs(channel.start.y - channel.end.y) <= GEOMETRY_EPSILON) {
    return normalizeRect({
      x1: channel.start.x,
      y1: channel.start.y - halfWidth,
      x2: channel.end.x,
      y2: channel.end.y + halfWidth,
    });
  }

  if (Math.abs(channel.start.x - channel.end.x) <= GEOMETRY_EPSILON) {
    return normalizeRect({
      x1: channel.start.x - halfWidth,
      y1: channel.start.y,
      x2: channel.end.x + halfWidth,
      y2: channel.end.y,
    });
  }

  return null;
}

function trayJointRects(channels: ExportableChannel[]) {
  const jointsByNodeId = new Map<string, { point: CadPoint; widths: number[] }>();

  for (const channel of channels) {
    const width = channelWidthMm(channel);
    if (width <= 0) {
      continue;
    }

    for (const [nodeId, point] of [
      [channel.channel.startNodeId, channel.start],
      [channel.channel.endNodeId, channel.end],
    ] as const) {
      const joint = jointsByNodeId.get(nodeId) ?? { point, widths: [] };
      joint.widths.push(width);
      jointsByNodeId.set(nodeId, joint);
    }
  }

  return Array.from(jointsByNodeId.values())
    .filter((joint) => joint.widths.length > 1)
    .map((joint) => {
      const halfWidth = Math.max(...joint.widths) / 2;
      return normalizeRect({
        x1: joint.point.x - halfWidth,
        y1: joint.point.y - halfWidth,
        x2: joint.point.x + halfWidth,
        y2: joint.point.y + halfWidth,
      });
    })
    .filter((rect): rect is CadRect => Boolean(rect));
}

function trayBoundaryLoops(channels: ExportableChannel[]) {
  const orthogonalRects = channels.map(traySegmentRect).filter((rect): rect is CadRect => Boolean(rect));
  return traceBoundaryLoops([...orthogonalRects, ...trayJointRects(channels)]);
}

function fallbackTrayBoundary(channel: ExportableChannel) {
  const width = channelWidthMm(channel);
  if (width <= 0) {
    return null;
  }

  const dx = channel.end.x - channel.start.x;
  const dy = channel.end.y - channel.start.y;
  const length = Math.hypot(dx, dy);
  if (length <= GEOMETRY_EPSILON) {
    return null;
  }

  const offsetX = (-dy / length) * (width / 2);
  const offsetY = (dx / length) * (width / 2);
  return [
    { x: channel.start.x + offsetX, y: channel.start.y + offsetY },
    { x: channel.end.x + offsetX, y: channel.end.y + offsetY },
    { x: channel.end.x - offsetX, y: channel.end.y - offsetY },
    { x: channel.start.x - offsetX, y: channel.start.y - offsetY },
  ];
}

function isFiniteCadPoint(point: CadPoint) {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function midpoint(a: CadPoint, b: CadPoint): CadPoint {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

function exportableChannels(project: Project) {
  const nodesById = new Map<string, TopologyNode>(
    project.topology.nodes.map((node) => [node.id, node]),
  );
  const inferredByChannelId = new Map(
    inferChannelSpecs(project).map((item) => [item.channelId, item.effectiveSpec]),
  );

  return project.topology.channels
    .map((channel): ExportableChannel | null => {
      const start = nodesById.get(channel.startNodeId)?.position;
      const end = nodesById.get(channel.endNodeId)?.position;
      if (!start || !end || !isFiniteCadPoint(start) || !isFiniteCadPoint(end)) {
        return null;
      }

      const spec = inferredByChannelId.get(channel.id) ?? channel.finalSpec ?? null;
      const specLabel = channelSpecLabel(channel, spec);
      return {
        channel,
        category: channel.category,
        start,
        end,
        spec,
        label: specLabel || (channel.category === 'tray' ? '线槽' : '排管'),
      };
    })
    .filter((channel): channel is ExportableChannel => Boolean(channel));
}

export function validateCadScriptExport(project: Project) {
  if (!project.calibration) {
    return {
      canExport: false,
      message: '未完成坐标校准，不能导出 CAD 脚本。',
      channelCount: 0,
    };
  }

  const channels = exportableChannels(project);
  if (channels.length === 0) {
    return {
      canExport: false,
      message: '暂无有效通道拓扑，不能导出 CAD 脚本。',
      channelCount: 0,
    };
  }

  return {
    canExport: true,
    message: '',
    channelCount: channels.length,
  };
}

function buildBasHeader(project: Project, channels: ExportableChannel[]) {
  return [
    'Attribute VB_Name = "CadHelperExport"',
    'Option Explicit',
    '',
    "' CAD Helper generated VBA module.",
    "' Uses late binding for better AutoCAD/ZWCAD VBA compatibility.",
    `' Project: ${project.name}`,
    `' Channels: ${channels.length}`,
    "' Layers: CAD_HELPER_TRAY, CAD_HELPER_DUCT, CAD_HELPER_ANNOTATION",
    '',
  ];
}

function buildBasHelpers() {
  return [
    'Private Function MakeCadPoint(ByVal x As Double, ByVal y As Double) As Variant',
    '  Dim pt(0 To 2) As Double',
    '  pt(0) = x',
    '  pt(1) = y',
    '  pt(2) = 0',
    '  MakeCadPoint = pt',
    'End Function',
    '',
    'Private Sub EnsureCadHelperLayer(ByVal layerName As String, ByVal colorIndex As Integer, Optional ByVal linetypeName As String = "Continuous")',
    '  Dim layer As Object',
    '  On Error Resume Next',
    '  ThisDrawing.Linetypes.Load linetypeName, "acad.lin"',
    '  Set layer = ThisDrawing.Layers.Item(layerName)',
    '  If layer Is Nothing Then',
    '    Set layer = ThisDrawing.Layers.Add(layerName)',
    '  End If',
    '  layer.color = colorIndex',
    '  layer.Linetype = linetypeName',
    '  On Error GoTo 0',
    'End Sub',
    '',
    'Private Sub AddCadHelperText(ByVal label As String, ByVal x As Double, ByVal y As Double, ByVal height As Double, ByVal layerName As String)',
    '  Dim textEntity As Object',
    '  Set textEntity = ThisDrawing.ModelSpace.AddText(label, MakeCadPoint(x, y), height)',
    '  textEntity.Layer = layerName',
    'End Sub',
    '',
  ];
}

function buildBasChannel(channel: ExportableChannel, index: number) {
  const center = midpoint(channel.start, channel.end);
  const lines = [
    `  ' Channel ${channel.channel.id} / ${channel.category} / ${channel.label}`,
    `  Dim duct${index} As Object`,
    `  Set duct${index} = ThisDrawing.ModelSpace.AddLine(MakeCadPoint(${cadNumber(
      channel.start.x,
    )}, ${cadNumber(channel.start.y)}), MakeCadPoint(${cadNumber(channel.end.x)}, ${cadNumber(
      channel.end.y,
    )}))`,
    `  duct${index}.Layer = ${vbaString(DUCT_LAYER)}`,
    `  Call AddCadHelperText(${vbaString(channel.label)}, ${cadNumber(center.x)}, ${cadNumber(
      center.y,
    )}, ${DEFAULT_TEXT_HEIGHT}, ${vbaString(ANNOTATION_LAYER)})`,
  ];

  return [...lines, ''];
}

function buildBasClosedPolyline(
  variableName: string,
  pointsVariableName: string,
  points: CadPoint[],
  layerName: string,
) {
  const lines = [`  Dim ${pointsVariableName}(0 To ${points.length * 2 - 1}) As Double`];
  points.forEach((point, index) => {
    lines.push(`  ${pointsVariableName}(${index * 2}) = ${cadNumber(point.x)}`);
    lines.push(`  ${pointsVariableName}(${index * 2 + 1}) = ${cadNumber(point.y)}`);
  });
  lines.push(`  Dim ${variableName} As Object`);
  lines.push(
    `  Set ${variableName} = ThisDrawing.ModelSpace.AddLightWeightPolyline(${pointsVariableName})`,
  );
  lines.push(`  ${variableName}.Layer = ${vbaString(layerName)}`);
  lines.push(`  ${variableName}.Closed = True`);
  return lines;
}

function buildBasTrayBoundaries(channels: ExportableChannel[]) {
  const lines = [
    `  ' Tray boundary outlines use confirmed tray widths and node joint patches.`,
    ...channels.map(
      (channel) =>
        `  ' Tray source ${channel.channel.id} / ${channel.label} / width ${cadNumber(
          channelWidthMm(channel),
        )}`,
    ),
  ];
  const loops = trayBoundaryLoops(channels);

  if (loops.length > 0) {
    loops.forEach((loop, index) => {
      lines.push(
        ...buildBasClosedPolyline(`trayBoundary${index}`, `trayBoundaryPts${index}`, loop, TRAY_LAYER),
        '',
      );
    });
    return lines;
  }

  channels.forEach((channel, index) => {
    const fallback = fallbackTrayBoundary(channel);
    if (!fallback) {
      return;
    }
    lines.push(
      ...buildBasClosedPolyline(
        `trayBoundaryFallback${index}`,
        `trayBoundaryFallbackPts${index}`,
        fallback,
        TRAY_LAYER,
      ),
      '',
    );
  });

  return lines;
}

function buildBasScript(project: Project, channels: ExportableChannel[]) {
  const trayChannels = channels.filter((channel) => channel.category === 'tray');
  const ductChannels = channels.filter((channel) => channel.category === 'duct');

  return [
    ...buildBasHeader(project, channels),
    ...buildBasHelpers(),
    'Public Sub DrawCadHelperChannels()',
    `  Call EnsureCadHelperLayer(${vbaString(TRAY_LAYER)}, 3, "Continuous")`,
    `  Call EnsureCadHelperLayer(${vbaString(DUCT_LAYER)}, 5, "DASHED")`,
    `  Call EnsureCadHelperLayer(${vbaString(ANNOTATION_LAYER)}, 2, "Continuous")`,
    '',
    ...buildBasTrayBoundaries(trayChannels),
    ...ductChannels.flatMap(buildBasChannel),
    '  ThisDrawing.Regen 1',
    'End Sub',
    '',
  ].join('\r\n');
}

function buildScrScript(project: Project, channels: ExportableChannel[]) {
  const lines = [
    '; CAD Helper generated SCR script',
    `; Project: ${project.name}`,
    `; Channels: ${channels.length}`,
    '-LAYER',
    'M',
    TRAY_LAYER,
    'C',
    '3',
    TRAY_LAYER,
    '',
    '-LAYER',
    'M',
    DUCT_LAYER,
    'C',
    '5',
    DUCT_LAYER,
    'L',
    'DASHED',
    DUCT_LAYER,
    '',
    '-LAYER',
    'M',
    ANNOTATION_LAYER,
    'C',
    '2',
    ANNOTATION_LAYER,
    '',
  ];

  for (const channel of channels) {
    lines.push(`; Channel ${channel.channel.id} / ${channel.category} / ${channel.label}`);
    if (channel.category === 'tray') {
      lines.push(
        'PLINE',
        `${cadNumber(channel.start.x)},${cadNumber(channel.start.y)}`,
        `${cadNumber(channel.end.x)},${cadNumber(channel.end.y)}`,
        '',
        'CHPROP',
        'L',
        '',
        'LA',
        TRAY_LAYER,
        '',
      );
    } else {
      const center = midpoint(channel.start, channel.end);
      lines.push(
        'LINE',
        `${cadNumber(channel.start.x)},${cadNumber(channel.start.y)}`,
        `${cadNumber(channel.end.x)},${cadNumber(channel.end.y)}`,
        '',
        'CHPROP',
        'L',
        '',
        'LA',
        DUCT_LAYER,
        '',
        'TEXT',
        `${cadNumber(center.x)},${cadNumber(center.y)}`,
        String(DEFAULT_TEXT_HEIGHT),
        '0',
        scrString(channel.label),
      );
    }
  }

  return `${lines.join('\r\n')}\r\n`;
}

export function buildCadScriptExport(
  project: Project,
  format: CadScriptFormat = 'bas',
): CadScriptExport {
  const validation = validateCadScriptExport(project);
  if (!validation.canExport) {
    return {
      ...validation,
      format,
      text: '',
    };
  }

  const channels = exportableChannels(project);
  return {
    canExport: true,
    message: '',
    format,
    text: format === 'bas' ? buildBasScript(project, channels) : buildScrScript(project, channels),
    channelCount: channels.length,
  };
}
