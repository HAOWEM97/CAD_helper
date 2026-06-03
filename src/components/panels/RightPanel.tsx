import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { buildCadScriptExport } from '@/domain/cad-export/cadScript';
import type { CalibrationDraftPoint, CalibrationSlot } from '@/domain/cad-coordinate/types';
import { parseCableQuantity, parseDiameterText } from '@/domain/library/defaultDeviceLibrary';
import {
  buildRouteDetail,
  createCustomDuctSpec,
  createCustomTraySpec,
  defaultDepthForSpec,
  getChannelHorizontalLength,
  getSelectableSpecs,
  serializeCableUsageDetailCsv,
  specKey,
  type CableClass,
  type ChannelCableLoad,
} from '@/domain/quantity/bom';
import type {
  CableSpec,
  ChannelCategory,
  ChannelSpec,
  ConnectionCableItem,
  ConnectionPointPreset,
  DeviceConnectionPoint,
  DeviceInstance,
  DeviceTypePreset,
} from '@/domain/project/types';
import {
  connectionItemsHaveUnlimitedCapacity,
  quantityText,
  summarizeConnectionItems,
  validateConnectionItems,
} from '@/domain/routing/connectionValidation';
import { findShortestChannelPath } from '@/domain/routing/shortestPath';
import { findConnectedChannelIds } from '@/domain/topology/topologyGeometry';
import { useAppDispatch } from '@/hooks/useAppDispatch';
import { useAppSelector } from '@/hooks/useAppSelector';
import {
  selectCableSpecs,
  selectBomSummary,
  selectCalibration,
  selectCableUsageDetailExport,
  selectCalibrationDraft,
  selectConnectionPoints,
  selectConnectionPointPresets,
  selectDeviceInstances,
  selectDeviceTypePresets,
  selectProject,
  selectProjectImage,
  selectRoutes,
  selectTopology,
} from '@/state/selectors/projectSelectors';
import {
  selectActiveStep,
  selectRightPanelCollapsed,
  selectRightPanelWidth,
  selectSelectedTopologyObject,
} from '@/state/selectors/uiSelectors';
import {
  clearConnectionPointAssignments,
  confirmTopologyChannelSpec,
  createCableRoute,
  createDefaultCustomConnectionPointName,
  createDefaultDeviceName,
  deleteCableSpec,
  deleteCableRoute,
  deleteConnectionPoint,
  deleteConnectionPointPreset,
  deleteDeviceTypePreset,
  setActiveCalibrationPoint,
  setCalibrationCadCoordinate,
  updateTopologyChannelCategory,
  updateTopologyChannelDepth,
  upsertCableSpec,
  upsertConnectionPoint,
  upsertConnectionPointPreset,
  upsertConnectionPointPresetWithSync,
  upsertDeviceInstance,
  upsertDeviceTypePreset,
  upsertDeviceTypePresetWithSync,
} from '@/state/slices/projectSlice';
import {
  setRightPanelWidth,
  setSelectedRouteId,
  setSelectedTopologyObject,
  toggleRightPanelCollapsed,
} from '@/state/slices/uiSlice';
import { downloadTextFile, timestampForFilename } from '@/services/file/downloadTextFile';
import {
  loadGlobalPresetLibrary,
  deleteGlobalCableSpec,
  deleteGlobalConnectionPointPreset,
  deleteGlobalDeviceTypePreset,
  upsertGlobalCableSpec,
  upsertGlobalConnectionPointPreset,
  upsertGlobalDeviceTypePreset,
} from '@/services/presets/globalPresetLibrary';

const stepGuidance = {
  calibration: {
    title: '坐标校准',
    body: '导入 PNG 底图后，选择两个基准点并输入对应 CAD 绝对坐标。',
  },
  drawing: {
    title: '通道绘制',
    body: '绘制节点和通道连线，设置通道类别。规格与深度在算量前保持锁定。',
  },
  devices: {
    title: '设备接线孔',
    body: '点击拓扑节点后设置设备来源或自定义接线孔，并配置线缆数量与安装高度。',
  },
  library: {
    title: '常用库',
    body: '管理线缆库和接线孔库，工程库可按需同步到全局库。',
  },
  routing: {
    title: '路由代办',
    body: '按接线孔待办选择兼容终点，整组生成路由。',
  },
  quantity: {
    title: '规格与 BOM',
    body: '根据通道内线缆推演规格，并在高度或深度变化时实时刷新 BOM。',
  },
  export: {
    title: '导出交付',
    body: '导出 CAD 脚本和工程 JSON，所有文件均由浏览器本地生成。',
  },
};

function createPanelId(prefix: string) {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now()}-${Math.round(Math.random() * 10000)}`;
}

function parseNumberInput(value: string) {
  if (value.trim() === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatMeters(mm: number) {
  return `${(mm / 1000).toFixed(2)} m`;
}

function connectionLabel(point: DeviceConnectionPoint, devices: DeviceInstance[]) {
  if (point.mode === 'custom') {
    return `${point.customInstanceName ?? '自定义'} / ${point.portType}`;
  }

  const device = devices.find((item) => item.id === point.deviceId);
  return `${device?.name ?? '未知设备'} / ${point.portType}`;
}

function cloneConnectionItems(items: ConnectionCableItem[]) {
  return items.map((item) => ({ ...item, id: createPanelId('connection-cable') }));
}

function specForItem(item: ConnectionCableItem, cableSpecs: CableSpec[]) {
  return cableSpecs.find((spec) => spec.id === item.cableSpecId) ?? null;
}

function buildCableSpec(model: string, diameterText: string): CableSpec {
  const diameter = parseDiameterText(diameterText);
  return {
    id: `cable-spec-${model}`.replace(/\s+/g, '-'),
    model: model.trim(),
    diameterText: diameterText.trim(),
    ...diameter,
  };
}

function createBlankCableSpec(): CableSpec {
  return {
    id: '',
    model: '',
    diameterText: '',
  };
}

function uniqueCableSpecsByModel(...specGroups: CableSpec[][]) {
  const specsByModel = new Map<string, CableSpec>();

  for (const spec of specGroups.flat()) {
    const model = spec.model.trim();
    if (!model || specsByModel.has(model)) {
      continue;
    }

    specsByModel.set(model, { ...spec, model });
  }

  return Array.from(specsByModel.values());
}

function connectionPointPresetFromItems(name: string, items: ConnectionCableItem[]): ConnectionPointPreset {
  return {
    id: createPanelId('connection-point-preset'),
    kind: 'custom',
    name: name.trim(),
    items: cloneConnectionItems(items),
  };
}

const naturalCollator = new Intl.Collator('zh-CN', {
  numeric: true,
  sensitivity: 'base',
});

function nodeLabel(index: number) {
  return `N${String(index + 1).padStart(3, '0')}`;
}

function compareText(a: string, b: string) {
  return naturalCollator.compare(a, b);
}

function formatImagePoint(point: CalibrationDraftPoint['imagePoint']) {
  if (!point) {
    return '未标记';
  }

  return `X ${point.x.toFixed(2)} / Y ${point.y.toFixed(2)} px`;
}

type CalibrationPointEditorProps = {
  activePoint: CalibrationSlot;
  point: CalibrationDraftPoint;
  slot: CalibrationSlot;
};

type CadCoordinateInputProps = {
  axis: 'x' | 'y';
  slot: CalibrationSlot;
  value: number | null;
};

function CadCoordinateInput({ axis, slot, value }: CadCoordinateInputProps) {
  const dispatch = useAppDispatch();
  const [inputValue, setInputValue] = useState(value === null ? '' : String(value));

  useEffect(() => {
    setInputValue(value === null ? '' : String(value));
  }, [value]);

  return (
    <input
      inputMode="decimal"
      onBlur={() => {
        if (parseNumberInput(inputValue) === null) {
          setInputValue(value === null ? '' : String(value));
        }
      }}
      onChange={(event) => {
        const nextValue = event.target.value;
        setInputValue(nextValue);
        dispatch(
          setCalibrationCadCoordinate({
            slot,
            axis,
            value: parseNumberInput(nextValue),
          }),
        );
      }}
      placeholder="0"
      type="text"
      value={inputValue}
    />
  );
}

function CalibrationPointEditor({ activePoint, point, slot }: CalibrationPointEditorProps) {
  const dispatch = useAppDispatch();
  const isActive = activePoint === slot;

  return (
    <section className={isActive ? 'calibration-point-card active' : 'calibration-point-card'}>
      <div className="calibration-point-header">
        <div>
          <strong>参考点 {slot}</strong>
          <span>{formatImagePoint(point.imagePoint)}</span>
        </div>
        <button
          className={isActive ? 'ghost-button compact active' : 'ghost-button compact'}
          onClick={() => dispatch(setActiveCalibrationPoint(slot))}
          type="button"
        >
          {isActive ? '正在标记' : '重选落点'}
        </button>
      </div>

      <div className="coordinate-grid">
        <label>
          <span>CAD X</span>
          <CadCoordinateInput axis="x" slot={slot} value={point.cadPoint.x} />
        </label>
        <label>
          <span>CAD Y</span>
          <CadCoordinateInput axis="y" slot={slot} value={point.cadPoint.y} />
        </label>
      </div>
    </section>
  );
}

const channelCategoryLabels: Record<ChannelCategory, string> = {
  tray: '线槽',
  duct: '排管',
};

type ChannelApplyScope = 'single' | 'connected';

function specText(spec: ChannelSpec | null | undefined) {
  return spec?.label ?? '';
}

function formatArea(mm2: number) {
  return `${mm2.toFixed(1)} mm²`;
}

function formatPercent(value: number) {
  if (!Number.isFinite(value)) {
    return '无效';
  }

  return `${(value * 100).toFixed(1)}%`;
}

const cableClassLabels: Record<CableClass, string> = {
  communication: '通信线',
  power: '配电线',
};

function loadRowKey(load: ChannelCableLoad) {
  return [load.model, load.usage, load.cableClass, load.diameterMm].join('|');
}

function summarizeCableLoads(loads: ChannelCableLoad[]) {
  const summaryByKey = new Map<string, ChannelCableLoad>();

  for (const load of loads) {
    const key = [load.model, load.usage, load.diameterMm, load.cableClass].join('|');
    const existing = summaryByKey.get(key);
    summaryByKey.set(key, {
      ...load,
      quantity: (existing?.quantity ?? 0) + load.quantity,
      areaMm2: (existing?.areaMm2 ?? 0) + load.areaMm2,
    });
  }

  return Array.from(summaryByKey.values()).sort(
    (a, b) =>
      a.model.localeCompare(b.model, 'zh-Hans-CN') ||
      a.usage.localeCompare(b.usage, 'zh-Hans-CN'),
  );
}

function ChannelEditor() {
  const dispatch = useAppDispatch();
  const selectedObject = useAppSelector(selectSelectedTopologyObject);
  const topology = useAppSelector(selectTopology);
  const bomSummary = useAppSelector(selectBomSummary);
  const [applyScope, setApplyScope] = useState<ChannelApplyScope>('single');
  const channel =
    selectedObject?.type === 'channel'
      ? topology.channels.find((item) => item.id === selectedObject.id)
      : null;

  if (!channel) {
    return (
      <div className="empty-state">
        <strong>未选择通道</strong>
        <p>切换到选择模式后，点击通道可编辑通道类型。</p>
      </div>
    );
  }

  const connectedChannelIds = findConnectedChannelIds(topology, channel.id);
  const targetChannelIds = applyScope === 'connected' ? connectedChannelIds : [channel.id];
  const affectedCount = targetChannelIds.length;
  const inferredSpec = bomSummary.inferredChannelSpecs.find((item) => item.channelId === channel.id);
  const depthEditable = Boolean(inferredSpec?.effectiveSpec);

  return (
    <div className="property-form">
      <label>
        <span>应用范围</span>
        <select
          onChange={(event) => setApplyScope(event.target.value as ChannelApplyScope)}
          value={applyScope}
        >
          <option value="single">当前通道</option>
          <option value="connected">连通通道组</option>
        </select>
      </label>

      <label>
        <span>通道类型</span>
        <select
          onChange={(event) =>
            dispatch(
              updateTopologyChannelCategory({
                channelIds: targetChannelIds,
                category: event.target.value as ChannelCategory,
              }),
            )
          }
          value={channel.category}
        >
          {Object.entries(channelCategoryLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <div className="scope-note">
        {applyScope === 'connected'
          ? `将影响 ${affectedCount} 条连通通道。`
          : '只修改当前选中的这一段通道。'}
      </div>

      <label>
        <span>有效规格</span>
        <input disabled placeholder="等待有效路由" value={specText(inferredSpec?.effectiveSpec)} />
      </label>

      <label>
        <span>通道高度</span>
        <input
          disabled={!depthEditable}
          onChange={(event) => {
            const parsed = parseNumberInput(event.target.value);
            for (const channelId of targetChannelIds) {
              dispatch(updateTopologyChannelDepth({ channelId, depthMm: parsed }));
            }
          }}
          placeholder="规格推演后可编辑，地下填负数"
          type="number"
          value={channel.depthMm === undefined ? '' : String(channel.depthMm)}
        />
      </label>

      <div className={depthEditable ? 'scope-note' : 'locked-note'}>
        {depthEditable
          ? `${inferredSpec?.confirmed ? '规格已确认' : inferredSpec?.needsReview ? '规格需复核' : '规格待确认'}，深度修改会立即刷新 BOM。`
          : '当前通道没有有效路由线缆，暂不能填写敷设深度。'}
      </div>
    </div>
  );
}

function SelectedTopologySummary() {
  const selectedObject = useAppSelector(selectSelectedTopologyObject);
  const topology = useAppSelector(selectTopology);

  if (selectedObject?.type === 'channel') {
    return <ChannelEditor />;
  }

  if (selectedObject?.type === 'node') {
    const node = topology.nodes.find((item) => item.id === selectedObject.id);

    return node ? (
      <div className="empty-state">
        <strong>已选择节点</strong>
        <p>
          CAD X {node.position.x.toFixed(2)} / Y {node.position.y.toFixed(2)}。拖动节点可调整位置，
          Delete 会删除该节点及其连接通道。
        </p>
      </div>
    ) : null;
  }

  return null;
}

function CableItemsTable({
  cableSpecs,
  editable,
  items,
  onChangeItem,
  onRemoveItem,
}: {
  cableSpecs: CableSpec[];
  editable: boolean;
  items: ConnectionCableItem[];
  onChangeItem?: (index: number, patch: Partial<ConnectionCableItem>) => void;
  onRemoveItem?: (index: number) => void;
}) {
  const [expandedItemIds, setExpandedItemIds] = useState<Set<string>>(new Set());

  if (items.length === 0) {
    return (
      <div className="empty-state compact-empty">
        <strong>暂无线缆</strong>
      </div>
    );
  }

  return (
    <div className="connection-cable-table">
      <div className="connection-cable-head">
        <span>用途</span>
        <span>线缆型号</span>
        <span>数量</span>
        <span>安装高度</span>
        {editable && <span />}
      </div>
      {items.map((item, index) => {
        const spec = specForItem(item, cableSpecs);
        const expanded = expandedItemIds.has(item.id);
        const itemAcceptsAnyCable = Boolean(item.acceptsAnyCable);
        return (
          <div className="connection-cable-entry" key={item.id}>
            <div className="connection-cable-row">
              {editable ? (
                <input
                  onChange={(event) => onChangeItem?.(index, { usage: event.target.value })}
                  placeholder="可选"
                  value={item.usage ?? ''}
                />
              ) : (
                <span>{item.usage?.trim() || '-'}</span>
              )}
              {editable ? (
                <select
                  disabled={itemAcceptsAnyCable}
                  onChange={(event) => onChangeItem?.(index, { cableSpecId: event.target.value })}
                  value={item.cableSpecId}
                >
                  {itemAcceptsAnyCable && <option value={item.cableSpecId}>不限</option>}
                  {cableSpecs.map((cableSpec) => (
                    <option key={cableSpec.id} value={cableSpec.id}>
                      {cableSpec.model}
                    </option>
                  ))}
                </select>
              ) : (
                <button
                  className="link-button cable-model-button"
                  onClick={() => {
                    setExpandedItemIds((current) => {
                      const next = new Set(current);
                      if (next.has(item.id)) {
                        next.delete(item.id);
                      } else {
                        next.add(item.id);
                      }
                      return next;
                    });
                  }}
                  type="button"
                >
                  {itemAcceptsAnyCable ? '不限' : spec?.model ?? '未知型号'}
                </button>
              )}
              <input
                disabled={!editable || itemAcceptsAnyCable}
                onChange={(event) =>
                  onChangeItem?.(index, { quantity: parseCableQuantity(event.target.value) })
                }
                value={quantityText(item.quantity)}
              />
              <input
                disabled={!editable}
                inputMode="decimal"
                onChange={(event) => {
                  const nextHeight = parseNumberInput(event.target.value);
                  if (nextHeight !== null) {
                    onChangeItem?.(index, { connectionHeightMm: nextHeight });
                  }
                }}
                value={String(item.connectionHeightMm)}
              />
              {editable && (
                <button
                  aria-label="删除线缆"
                  className="icon-button danger-icon"
                  onClick={() => onRemoveItem?.(index)}
                  title="删除线缆"
                  type="button"
                >
                  ×
                </button>
              )}
            </div>
            {(expanded || editable) && (spec || itemAcceptsAnyCable) && (
              <div className="connection-cable-detail">
                <span>
                  外径：
                  {itemAcceptsAnyCable
                    ? '不限'
                    : spec?.diameterText || (spec?.diameterMm ? `${spec.diameterMm}mm` : '未填写')}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DeviceConnectionEditor() {
  const dispatch = useAppDispatch();
  const selectedObject = useAppSelector(selectSelectedTopologyObject);
  const topology = useAppSelector(selectTopology);
  const deviceInstances = useAppSelector(selectDeviceInstances);
  const connectionPoints = useAppSelector(selectConnectionPoints);
  const cableSpecs = useAppSelector(selectCableSpecs);
  const connectionPointPresets = useAppSelector(selectConnectionPointPresets);
  const projectDeviceTypePresets = useAppSelector(selectDeviceTypePresets);
  const [globalLibrary, setGlobalLibrary] = useState(() => loadGlobalPresetLibrary());
  const [expandedPointId, setExpandedPointId] = useState<string | null>(null);
  const allDeviceTypePresets = useMemo(
    () => [...projectDeviceTypePresets, ...globalLibrary.deviceTypePresets],
    [globalLibrary.deviceTypePresets, projectDeviceTypePresets],
  );
  const allCableSpecs = useMemo(
    () => uniqueCableSpecsByModel(cableSpecs, globalLibrary.cableSpecs),
    [cableSpecs, globalLibrary.cableSpecs],
  );
  const allConnectionPointPresets = useMemo(
    () => [...connectionPointPresets, ...globalLibrary.connectionPointPresets],
    [connectionPointPresets, globalLibrary.connectionPointPresets],
  );
  const customConnectionPointPresets = useMemo(() => {
    const devicePortNames = new Set(
      allDeviceTypePresets.flatMap((preset) => preset.ports.map((port) => port.portType)),
    );
    return allConnectionPointPresets.filter(
      (preset) => preset.kind === 'custom' || (!preset.kind && !devicePortNames.has(preset.name)),
    );
  }, [allConnectionPointPresets, allDeviceTypePresets]);
  const node =
    selectedObject?.type === 'node'
      ? topology.nodes.find((item) => item.id === selectedObject.id)
      : null;
  const existingPoint = node
    ? connectionPoints.find((point) => point.nodeId === node.id) ?? null
    : null;
  const existingDevice = existingPoint?.deviceId
    ? deviceInstances.find((device) => device.id === existingPoint.deviceId) ?? null
    : null;
  const [source, setSource] = useState('custom');
  const [deviceId, setDeviceId] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [portType, setPortType] = useState('');
  const [customInstanceName, setCustomInstanceName] = useState('');
  const [selectedPresetRef, setSelectedPresetRef] = useState<DeviceConnectionPoint['presetRef']>();
  const [items, setItems] = useState<ConnectionCableItem[]>([]);
  const [saveConnectionPointPreset, setSaveConnectionPointPreset] = useState(false);
  const [saveDeviceType, setSaveDeviceType] = useState(false);
  const [newCableModel, setNewCableModel] = useState('');
  const [newCableDiameter, setNewCableDiameter] = useState('');
  const [saveNewCableGlobal, setSaveNewCableGlobal] = useState(true);
  const selectedDevicePreset =
    source === 'custom'
      ? null
      : allDeviceTypePresets.find((preset) => preset.deviceType === source) ?? null;
  const editable = source === 'custom';
  const availableDevices = deviceInstances.filter((device) => device.deviceType === source);
  const nodeLabelById = useMemo(
    () => new Map(topology.nodes.map((topologyNode, index) => [topologyNode.id, nodeLabel(index)])),
    [topology.nodes],
  );
  const deviceById = useMemo(
    () => new Map(deviceInstances.map((device) => [device.id, device])),
    [deviceInstances],
  );
  const sortedConnectionPoints = useMemo(
    () =>
      connectionPoints
        .map((point) => {
          const device = point.deviceId ? deviceById.get(point.deviceId) : null;
          return {
            point,
            deviceName:
              point.mode === 'custom'
                ? point.customInstanceName ?? point.portType
                : device?.name ?? '未知设备',
            deviceType: point.mode === 'custom' ? '自定义接线孔' : device?.deviceType ?? '未知类型',
            nodeLabel: nodeLabelById.get(point.nodeId) ?? 'N---',
          };
        })
        .sort((a, b) => {
          const typeCompare = compareText(a.deviceType, b.deviceType);
          if (typeCompare !== 0) {
            return typeCompare;
          }
          const nameCompare = compareText(a.deviceName, b.deviceName);
          if (nameCompare !== 0) {
            return nameCompare;
          }
          const portCompare = compareText(a.point.portType, b.point.portType);
          if (portCompare !== 0) {
            return portCompare;
          }
          return compareText(a.nodeLabel, b.nodeLabel);
        }),
    [connectionPoints, deviceById, nodeLabelById],
  );
  const canSave =
    portType.trim() !== '' &&
    items.length > 0 &&
    items.every((item) => item.cableSpecId && Number.isFinite(item.connectionHeightMm)) &&
    (source === 'custom' || deviceName.trim() !== '');
  const clearAllButton = connectionPoints.length > 0 ? (
    <button
      className="danger-button"
      onClick={() => dispatch(clearConnectionPointAssignments())}
      type="button"
    >
      清除所有节点属性设定
    </button>
  ) : null;

  useEffect(() => {
    if (existingPoint) {
      setSource(existingPoint.mode === 'custom' ? 'custom' : existingDevice?.deviceType ?? 'custom');
      setDeviceId(existingPoint.deviceId ?? '');
      setDeviceName(existingDevice?.name ?? '');
      setPortType(existingPoint.portType);
      setCustomInstanceName(existingPoint.customInstanceName ?? '');
      setSelectedPresetRef(existingPoint.presetRef);
      setItems(cloneConnectionItems(existingPoint.items));
    } else {
      setSource('custom');
      setDeviceId('');
      setDeviceName('');
      setPortType('');
      setCustomInstanceName('');
      setSelectedPresetRef(undefined);
      setItems([]);
    }
    setSaveConnectionPointPreset(false);
    setSaveDeviceType(false);
  }, [existingDevice?.deviceType, existingDevice?.id, existingDevice?.name, existingPoint?.id, node?.id]);

  if (!node) {
    return (
      <div className="device-panel">
        <div className="empty-state">
          <strong>请选择拓扑节点</strong>
          <p>在画布中点击一个拓扑节点，将它设置为设备接线孔或自定义接线孔。</p>
        </div>
        {clearAllButton}
      </div>
    );
  }

  function applyPortPreset(nextPortType: string) {
    const portPreset = selectedDevicePreset?.ports.find((port) => port.portType === nextPortType);
    setPortType(nextPortType);
    if (portPreset) {
      setItems(cloneConnectionItems(portPreset.items));
      setSelectedPresetRef({ kind: 'device-port', id: portPreset.id });
    }
  }

  function addCableItem(cableSpecId = allCableSpecs[0]?.id ?? '') {
    if (!cableSpecId) {
      return;
    }
    setSelectedPresetRef(undefined);
    setItems((current) => [
      ...current,
      {
        id: createPanelId('connection-cable'),
        cableSpecId,
        quantity: { mode: 'fixed', count: 1 },
        connectionHeightMm: 500,
      },
    ]);
  }

  function updateCableItem(index: number, patch: Partial<ConnectionCableItem>) {
    if (source === 'custom') {
      setSelectedPresetRef(undefined);
    }
    setItems((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    );
  }

  function saveNewCableSpec() {
    const model = newCableModel.trim();
    if (!model) {
      return;
    }
    if (allCableSpecs.some((spec) => spec.model.trim() === model)) {
      window.alert('线缆型号已存在。');
      return;
    }
    const spec = buildCableSpec(newCableModel, newCableDiameter);
    dispatch(upsertCableSpec(spec));
    if (saveNewCableGlobal) {
      upsertGlobalCableSpec(spec);
    }
    setGlobalLibrary(loadGlobalPresetLibrary());
    setNewCableModel('');
    setNewCableDiameter('');
  }

  return (
    <div className="device-panel">
      <div className="property-form compact-form">
        <label>
          <span>接线孔来源</span>
          <select
            onChange={(event) => {
              const nextSource = event.target.value;
              setSource(nextSource);
              setDeviceId('');
              setSelectedPresetRef(undefined);
              setDeviceName(
                nextSource === 'custom'
                  ? ''
                  : createDefaultDeviceName(
                      deviceInstances,
                      allDeviceTypePresets.find((preset) => preset.deviceType === nextSource)
                        ?.namePrefix ?? nextSource,
                    ),
              );
              setPortType('');
              setCustomInstanceName('');
              setItems([]);
            }}
            value={source}
          >
            <option value="custom">自定义接线孔</option>
            {allDeviceTypePresets.map((preset) => (
              <option key={preset.id} value={preset.deviceType}>
                {preset.deviceType}
              </option>
            ))}
          </select>
        </label>

        {source !== 'custom' && (
          <>
            <label>
              <span>设备实例</span>
              <input
                list="device-instance-options"
                onChange={(event) => {
                  const nextName = event.target.value;
                  const nextDevice = availableDevices.find((device) => device.name === nextName);
                  setDeviceName(nextName);
                  setDeviceId(nextDevice?.id ?? '');
                }}
                placeholder={createDefaultDeviceName(deviceInstances, source)}
                value={deviceName}
              />
              <datalist id="device-instance-options">
                {availableDevices.map((device) => (
                  <option key={device.id} value={device.name} />
                ))}
              </datalist>
            </label>
            <label>
              <span>接线孔类型</span>
              <select onChange={(event) => applyPortPreset(event.target.value)} value={portType}>
                <option value="">选择接线孔</option>
                {selectedDevicePreset?.ports.map((port) => (
                  <option key={port.id} value={port.portType}>
                    {port.portType}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}

        {source === 'custom' && (
          <>
            <label>
              <span>接线孔种类</span>
              <input
                onChange={(event) => {
                  const nextPortType = event.target.value;
                  setPortType(nextPortType);
                  setSelectedPresetRef(undefined);
                  if (!customInstanceName.trim()) {
                    setCustomInstanceName(
                      createDefaultCustomConnectionPointName(
                        connectionPoints,
                        nextPortType,
                        existingPoint?.id,
                      ),
                    );
                  }
                }}
                placeholder="主机到储能"
                value={portType}
              />
            </label>
            <label>
              <span>节点名称</span>
              <input
                onChange={(event) => setCustomInstanceName(event.target.value)}
                placeholder={createDefaultCustomConnectionPointName(
                  connectionPoints,
                  portType,
                  existingPoint?.id,
                )}
                value={customInstanceName}
              />
            </label>
            <label>
              <span>套用常用接线孔</span>
              <select
                onChange={(event) => {
                  const preset = customConnectionPointPresets.find(
                    (item) => item.id === event.target.value,
                  );
                  if (preset) {
                    setPortType(preset.name);
                    setCustomInstanceName(
                      createDefaultCustomConnectionPointName(
                        connectionPoints,
                        preset.name,
                        existingPoint?.id,
                      ),
                    );
                    setSelectedPresetRef({ kind: 'custom', id: preset.id });
                    setItems(cloneConnectionItems(preset.items));
                  }
                }}
                value=""
              >
                <option value="">选择常用接线孔</option>
                {customConnectionPointPresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>

      <div className="cable-editor">
        <div className="panel-heading compact-heading">
          <h2>接线孔明细</h2>
          <span>{items.length} 种线缆</span>
        </div>
        <CableItemsTable
          cableSpecs={allCableSpecs}
          editable={editable}
          items={items}
          onChangeItem={updateCableItem}
          onRemoveItem={(index) =>
            setItems((current) => {
              setSelectedPresetRef(undefined);
              return current.filter((_, itemIndex) => itemIndex !== index);
            })
          }
        />
        {source !== 'custom' && items.length > 0 && (
          <button
            className="ghost-button compact"
            onClick={() => {
              setSource('custom');
              setDeviceId('');
              setDeviceName('');
              setPortType(portType ? `${portType} 自定义` : '自定义接线孔');
              setCustomInstanceName(
                createDefaultCustomConnectionPointName(
                  connectionPoints,
                  portType ? `${portType} 自定义` : '自定义接线孔',
                  existingPoint?.id,
                ),
              );
              setSelectedPresetRef(undefined);
              setItems(cloneConnectionItems(items));
            }}
            type="button"
          >
            复制为自定义
          </button>
        )}
        {source === 'custom' && (
          <button className="ghost-button compact" onClick={() => addCableItem()} type="button">
            添加线缆
          </button>
        )}
      </div>

      {source === 'custom' && (
        <div className="property-form compact-form new-cable-form">
          <div className="panel-heading compact-heading">
            <h2>新增线缆到线缆库</h2>
            <span>可选</span>
          </div>
          <label>
            <span>线缆型号</span>
            <input onChange={(event) => setNewCableModel(event.target.value)} value={newCableModel} />
          </label>
          <label>
            <span>外径</span>
            <input
              onChange={(event) => setNewCableDiameter(event.target.value)}
              placeholder="约 11.0"
              value={newCableDiameter}
            />
          </label>
          <label className="inline-check">
            <input
              checked={saveNewCableGlobal}
              onChange={(event) => setSaveNewCableGlobal(event.target.checked)}
              type="checkbox"
            />
            <span>加入全局线缆库</span>
          </label>
          <button
            className="ghost-button compact"
            disabled={!newCableModel.trim()}
            onClick={saveNewCableSpec}
            type="button"
          >
            保存线缆
          </button>
        </div>
      )}

      <div className="property-form compact-form">
        {source === 'custom' && (
          <label className="inline-check">
            <input
              checked={saveConnectionPointPreset}
              onChange={(event) => setSaveConnectionPointPreset(event.target.checked)}
              type="checkbox"
            />
            <span>自定义接线孔加入全局常用库</span>
          </label>
        )}
        {source === 'custom' && (
          <label className="inline-check">
            <input
              checked={saveDeviceType}
              onChange={(event) => setSaveDeviceType(event.target.checked)}
              type="checkbox"
            />
            <span>另存为自定义设备类型模板</span>
          </label>
        )}
        <button
          className="primary-button"
          disabled={!canSave}
          onClick={() => {
            const nextItems = cloneConnectionItems(items);
            for (const item of nextItems) {
              const selectedSpec = allCableSpecs.find((spec) => spec.id === item.cableSpecId);
              if (selectedSpec && !cableSpecs.some((spec) => spec.id === selectedSpec.id)) {
                dispatch(upsertCableSpec(selectedSpec));
              }
            }
            let nextDeviceId: string | undefined;
            if (source !== 'custom') {
              nextDeviceId = deviceId || createPanelId('device');
              dispatch(
                upsertDeviceInstance({
                  id: nextDeviceId,
                  name: deviceName.trim(),
                  deviceType: source,
                }),
              );
            }

            dispatch(
              upsertConnectionPoint({
                id: existingPoint?.id ?? createPanelId('connection-point'),
                nodeId: node.id,
                mode: source === 'custom' ? 'custom' : 'device',
                deviceId: nextDeviceId,
                customInstanceName:
                  source === 'custom'
                    ? customInstanceName.trim() ||
                      createDefaultCustomConnectionPointName(
                        connectionPoints,
                        portType,
                        existingPoint?.id,
                      )
                    : undefined,
                portType: portType.trim(),
                items: nextItems,
                presetRef: selectedPresetRef,
              }),
            );

            if (source === 'custom' && saveConnectionPointPreset) {
              const preset = connectionPointPresetFromItems(portType, nextItems);
              dispatch(upsertConnectionPointPreset(preset));
              upsertGlobalConnectionPointPreset(preset);
            }
            if (source === 'custom' && saveDeviceType) {
              const preset: DeviceTypePreset = {
                id: createPanelId('device-type-preset'),
                deviceType: portType.trim(),
                namePrefix: portType.trim(),
                ports: [
                  {
                    id: createPanelId('port-preset'),
                    portType: portType.trim(),
                    items: nextItems,
                  },
                ],
              };
              dispatch(upsertDeviceTypePreset(preset));
              upsertGlobalDeviceTypePreset(preset);
            }
            setGlobalLibrary(loadGlobalPresetLibrary());
          }}
          type="button"
        >
          保存接线孔
        </button>
      </div>

      <div className="connection-table">
        <div className="panel-heading compact-heading">
          <h2>接线孔核对</h2>
          <span>{connectionPoints.length}</span>
        </div>
        {clearAllButton}
        {connectionPoints.length === 0 ? (
          <div className="empty-state">
            <strong>暂无接线孔</strong>
            <p>选择节点并保存设备接线孔后，这里会列出核对清单。</p>
          </div>
        ) : (
          <div className="connection-audit-table">
            <div className="connection-audit-head">
              <span>节点</span>
              <span>设备</span>
              <span>接线孔</span>
              <span />
            </div>
            {sortedConnectionPoints.map(({ deviceName, deviceType, nodeLabel: label, point }, index) => {
              const previous = sortedConnectionPoints[index - 1];
              const showGroup = !previous || previous.deviceType !== deviceType;
              const expanded = expandedPointId === point.id;
              const selected =
                selectedObject?.type === 'node' && selectedObject.id === point.nodeId;
              return (
                <div className="connection-audit-entry" key={point.id}>
                  {showGroup && <div className="connection-audit-group">{deviceType}</div>}
                  <div
                    className={selected ? 'connection-audit-row selected' : 'connection-audit-row'}
                    onClick={() => {
                      dispatch(setSelectedTopologyObject({ type: 'node', id: point.nodeId }));
                      setExpandedPointId((current) => (current === point.id ? null : point.id));
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        dispatch(setSelectedTopologyObject({ type: 'node', id: point.nodeId }));
                        setExpandedPointId((current) => (current === point.id ? null : point.id));
                      }
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    <strong>{label}</strong>
                    <span>{deviceName}</span>
                    <span>{point.portType}</span>
                    <button
                      aria-label={`删除 ${label} 的接线孔属性`}
                      className="icon-button danger-icon"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (
                          window.confirm(
                            '确定删除这个节点的接线孔属性吗？拓扑节点和通道不会删除。',
                          )
                        ) {
                          dispatch(deleteConnectionPoint(point.id));
                          if (selectedObject?.type === 'node' && selectedObject.id === point.nodeId) {
                            dispatch(setSelectedTopologyObject(null));
                          }
                          setExpandedPointId((current) => (current === point.id ? null : current));
                        }
                      }}
                      title="删除接线孔属性"
                      type="button"
                    >
                      ×
                    </button>
                  </div>
                  {expanded && (
                    <div className="connection-audit-detail">
                      <CableItemsTable cableSpecs={allCableSpecs} editable={false} items={point.items} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function RoutingTodoPanel() {
  const dispatch = useAppDispatch();
  const project = useAppSelector(selectProject);
  const topology = useAppSelector(selectTopology);
  const deviceInstances = useAppSelector(selectDeviceInstances);
  const connectionPoints = useAppSelector(selectConnectionPoints);
  const cableSpecs = useAppSelector(selectCableSpecs);
  const routes = useAppSelector(selectRoutes);
  const [activeStartId, setActiveStartId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState('');
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
  const [expandedRouteId, setExpandedRouteId] = useState<string | null>(null);
  const [routeError, setRouteError] = useState('');
  const activeStart = connectionPoints.find((point) => point.id === activeStartId) ?? null;
  const routeFromIds = new Set(routes.map((route) => route.fromConnectionPointId));
  const routeToIds = new Set(routes.map((route) => route.toConnectionPointId));
  const activeCandidates = connectionPoints.filter(
    (point) => !connectionItemsHaveUnlimitedCapacity(point.items),
  );
  const compatibleTargets = activeStart
    ? connectionPoints
        .filter((point) => point.id !== activeStart.id)
        .map((point) => ({
          point,
          validation: validateConnectionItems(activeStart.items, point.items, cableSpecs),
        }))
    : [];
  const selectedTarget = compatibleTargets.find((item) => item.point.id === targetId) ?? null;

  function selectStart(pointId: string, nextTargetId = '', routeId: string | null = null) {
    setActiveStartId(pointId);
    setTargetId(nextTargetId);
    setEditingRouteId(routeId);
    setRouteError('');
  }

  function generateRoute() {
    if (!activeStart || !selectedTarget?.validation.compatible) {
      return;
    }

    const result = findShortestChannelPath(
      topology,
      activeStart.nodeId,
      selectedTarget.point.nodeId,
    );
    if (!result.reachable || result.channelIds.length === 0) {
      setRouteError('当前拓扑中无法到达该终点，请检查通道是否连通。');
      return;
    }

    const routeId = editingRouteId ?? createPanelId('route');
    dispatch(
      createCableRoute({
        id: routeId,
        fromConnectionPointId: activeStart.id,
        toConnectionPointId: selectedTarget.point.id,
        pathSegmentIds: result.channelIds,
        status: 'valid',
      }),
    );
    dispatch(setSelectedRouteId(routeId));
    setTargetId('');
    setEditingRouteId(null);
    setRouteError('');
  }

  function renderTargetEditor(point: DeviceConnectionPoint) {
    if (activeStartId !== point.id) {
      return null;
    }

    return (
      <div className="route-inline-editor">
        <label>
          <span>{editingRouteId ? '重算终点' : '选择终点'}</span>
          <select onChange={(event) => setTargetId(event.target.value)} value={targetId}>
            <option value="">选择兼容终点</option>
            {compatibleTargets.map(({ point: targetPoint, validation }) => (
              <option disabled={!validation.compatible} key={targetPoint.id} value={targetPoint.id}>
                {connectionLabel(targetPoint, deviceInstances)} - {validation.reason}
              </option>
            ))}
          </select>
        </label>
        {selectedTarget && (
          <div className={selectedTarget.validation.compatible ? 'scope-note' : 'locked-note'}>
            {selectedTarget.validation.reason}
          </div>
        )}
        {routeError && <div className="locked-note">{routeError}</div>}
        <button
          className="primary-button"
          disabled={!selectedTarget?.validation.compatible}
          onClick={generateRoute}
          type="button"
        >
          {editingRouteId ? '重新生成路由' : '生成整组路由'}
        </button>
      </div>
    );
  }

  const groups = [
    {
      title: '待路由',
      items: activeCandidates.filter(
        (point) => !routeFromIds.has(point.id) && !routeToIds.has(point.id),
      ),
    },
    {
      title: '已完成起点',
      items: activeCandidates.filter((point) => routeFromIds.has(point.id)),
    },
    {
      title: '已作为终点',
      items: activeCandidates.filter((point) => !routeFromIds.has(point.id) && routeToIds.has(point.id)),
    },
    {
      title: '不限承接端',
      items: connectionPoints.filter((point) => connectionItemsHaveUnlimitedCapacity(point.items)),
    },
  ];

  return (
    <div className="routing-panel">
      {groups.map((group) => (
        <div className="route-list" key={group.title}>
          <div className="panel-heading compact-heading">
            <h2>{group.title}</h2>
            <span>{group.items.length}</span>
          </div>
          {group.items.length === 0 ? (
            <div className="empty-state">
              <strong>暂无</strong>
            </div>
          ) : (
            group.items.map((point) => (
              <div className="route-entry" key={point.id}>
                <button
                  className={activeStartId === point.id ? 'route-row active' : 'route-row'}
                  disabled={connectionItemsHaveUnlimitedCapacity(point.items)}
                  onClick={() => selectStart(point.id)}
                  type="button"
                >
                  <span>{connectionLabel(point, deviceInstances)}</span>
                  <strong>
                    {connectionItemsHaveUnlimitedCapacity(point.items) ? '终点' : '起点'}
                  </strong>
                </button>
                {renderTargetEditor(point)}
              </div>
            ))
          )}
        </div>
      ))}

      <div className="route-list">
        <div className="panel-heading compact-heading">
          <h2>已生成路由</h2>
          <span>{routes.length}</span>
        </div>
        {routes.map((route) => {
          const from = connectionPoints.find((point) => point.id === route.fromConnectionPointId);
          const to = connectionPoints.find((point) => point.id === route.toConnectionPointId);
          const expanded = expandedRouteId === route.id;
          const routeDetail = expanded ? buildRouteDetail(project, route.id) : null;
          return (
            <div className="route-entry" key={route.id}>
              <div
                className={[
                  route.status === 'valid' ? 'route-row route-record' : 'route-row route-record stale',
                  expanded ? 'active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => {
                  dispatch(setSelectedRouteId(route.id));
                  setExpandedRouteId(expanded ? null : route.id);
                }}
              >
                <div className="route-record-main">
                  <span>
                    <b>起点：</b>
                    {from ? connectionLabel(from, deviceInstances) : '未知起点'}
                  </span>
                  <span>
                    <b>终点：</b>
                    {to ? connectionLabel(to, deviceInstances) : '未知终点'}
                  </span>
                </div>
                <div className="route-record-actions">
                  <strong>{route.status === 'valid' ? '有效' : '需重算'}</strong>
                  <button
                    className="ghost-button compact"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (!from || !to) {
                        window.alert('这条路由的起点或终点已不存在，无法重算。');
                        return;
                      }
                      selectStart(from.id, to.id, route.id);
                    }}
                    type="button"
                  >
                    重算
                  </button>
                  <button
                    className="danger-button compact"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (window.confirm('确定删除这条路由吗？通道和接线孔不会删除。')) {
                        dispatch(deleteCableRoute(route.id));
                        dispatch(setSelectedRouteId(null));
                        if (expandedRouteId === route.id) {
                          setExpandedRouteId(null);
                        }
                        if (editingRouteId === route.id) {
                          setEditingRouteId(null);
                          setActiveStartId(null);
                          setTargetId('');
                        }
                      }
                    }}
                    type="button"
                  >
                    删除
                  </button>
                </div>
              </div>
              {expanded && (
                <div className="route-record-detail">
                  {route.status !== 'valid' && (
                    <div className="locked-note">该路由需重算，当前长度基于旧路径暂算。</div>
                  )}
                  {routeDetail ? (
                    <div className="route-detail-row">
                      <span>二维平面路由长度</span>
                      <strong>{formatMeters(routeDetail.horizontalLengthMm)}</strong>
                    </div>
                  ) : (
                    <div className="locked-note">这条路由已不存在，无法计算长度。</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function QuantityPanel() {
  const dispatch = useAppDispatch();
  const topology = useAppSelector(selectTopology);
  const bomSummary = useAppSelector(selectBomSummary);
  const cableUsageDetailExport = useAppSelector(selectCableUsageDetailExport);
  const selectedObject = useAppSelector(selectSelectedTopologyObject);
  const [expandedChannelId, setExpandedChannelId] = useState<string | null>(null);
  const [exportMessage, setExportMessage] = useState('');
  const channelRowRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const quantityPanelSelectionRef = useRef<string | null>(null);
  const pendingScrollChannelIdRef = useRef<string | null>(null);
  const [customTrayDrafts, setCustomTrayDrafts] = useState<
    Record<string, { widthMm: string; heightMm: string; powerWidthMm: string; communicationWidthMm: string }>
  >({});
  const [customDuctDrafts, setCustomDuctDrafts] = useState<
    Record<string, { DN125: string; DN100: string; DN32: string }>
  >({});

  function commitSpec(channelId: string, spec: ChannelSpec, loadSignature: string) {
    dispatch(
      confirmTopologyChannelSpec({
        channelId,
        spec,
        loadSignature,
        defaultDepthMm: defaultDepthForSpec(spec),
      }),
    );
  }

  function highlightChannel(channelId: string) {
    quantityPanelSelectionRef.current = channelId;
    dispatch(setSelectedTopologyObject({ type: 'channel', id: channelId }));
  }

  function exportCableUsageDetails() {
    if (!cableUsageDetailExport.canExport) {
      setExportMessage(cableUsageDetailExport.message);
      return;
    }

    downloadTextFile(
      `线缆用量明细-${timestampForFilename()}.csv`,
      serializeCableUsageDetailCsv(cableUsageDetailExport.rows),
      'text/csv;charset=utf-8',
    );
    setExportMessage(`已导出 ${cableUsageDetailExport.rows.length} 条线缆用量明细。`);
  }

  function applyDefaultDepthIfEmpty(channelId: string) {
    const channel = topology.channels.find((item) => item.id === channelId);
    const inferred = bomSummary.inferredChannelSpecs.find((item) => item.channelId === channelId);
    const defaultDepthMm = defaultDepthForSpec(inferred?.effectiveSpec);
    if (
      channel?.depthMm === undefined &&
      typeof defaultDepthMm === 'number' &&
      Number.isFinite(defaultDepthMm)
    ) {
      dispatch(updateTopologyChannelDepth({ channelId, depthMm: defaultDepthMm }));
    }
  }

  function selectChannel(channelId: string) {
    highlightChannel(channelId);
    applyDefaultDepthIfEmpty(channelId);
    setExpandedChannelId((current) => (current === channelId ? null : channelId));
  }

  function shouldIgnoreChannelRowClick(event: { target: EventTarget | null }) {
    return (
      event.target instanceof HTMLElement &&
      Boolean(event.target.closest('select, input, button, .custom-spec-form'))
    );
  }

  function getTrayDraft(channelId: string) {
    return (
      customTrayDrafts[channelId] ?? {
        widthMm: '',
        heightMm: '150',
        powerWidthMm: '',
        communicationWidthMm: '',
      }
    );
  }

  function getDuctDraft(channelId: string) {
    return customDuctDrafts[channelId] ?? { DN125: '', DN100: '', DN32: '' };
  }

  function trayDraftIsValid(channelId: string) {
    const draft = getTrayDraft(channelId);
    return Number(draft.widthMm) > 0 && Number(draft.heightMm) > 0;
  }

  function ductDraftIsValid(channelId: string) {
    const draft = getDuctDraft(channelId);
    return Number(draft.DN125 || 0) + Number(draft.DN100 || 0) + Number(draft.DN32 || 0) > 0;
  }

  useEffect(() => {
    if (selectedObject?.type !== 'channel') {
      return;
    }

    const channelExists = topology.channels.some((channel) => channel.id === selectedObject.id);
    if (!channelExists) {
      return;
    }

    const selectedFromQuantityPanel = quantityPanelSelectionRef.current === selectedObject.id;
    quantityPanelSelectionRef.current = null;
    if (selectedFromQuantityPanel) {
      return;
    }

    pendingScrollChannelIdRef.current = selectedObject.id;
    setExpandedChannelId(selectedObject.id);
  }, [selectedObject, topology.channels]);

  useEffect(() => {
    if (!expandedChannelId || pendingScrollChannelIdRef.current !== expandedChannelId) {
      return;
    }

    pendingScrollChannelIdRef.current = null;
    window.requestAnimationFrame(() => {
      channelRowRefs.current[expandedChannelId]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
      });
    });
  }, [expandedChannelId]);

  return (
    <div className="routing-panel">
      <div className="route-list">
        <div className="panel-heading compact-heading">
          <h2>通道规格</h2>
          <span>{bomSummary.inferredChannelSpecs.filter((item) => item.spec).length}</span>
        </div>

        {topology.channels.length === 0 ? (
          <div className="empty-state">
            <strong>暂无通道</strong>
            <p>绘制通道并生成有效路由后，会自动推演规格。</p>
          </div>
        ) : (
          <div className="quantity-channel-list">
            {topology.channels.map((channel, index) => {
              const inferred = bomSummary.inferredChannelSpecs.find(
                (item) => item.channelId === channel.id,
              );
              const selected =
                selectedObject?.type === 'channel' && selectedObject.id === channel.id;
              const options = getSelectableSpecs(channel.category);
              const selectedSpecKey = specKey(inferred?.effectiveSpec);
              const selectedSpecIsStandard = options.some(
                (option) => specKey(option) === selectedSpecKey,
              );
              const expanded = expandedChannelId === channel.id;
              const evaluation = inferred?.evaluation;
              const hasWarnings = Boolean(evaluation?.warnings.length);
              const maxUtilizationRatio = evaluation?.utilizationRows.length
                ? evaluation.maxUtilizationRatio
                : null;
              const channelLengthDetail = getChannelHorizontalLength(topology, channel.id);
              const rowClassName = [
                'quantity-channel-row',
                selected ? 'selected' : '',
                expanded ? 'expanded' : '',
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <div
                  aria-expanded={expanded}
                  className={rowClassName}
                  key={channel.id}
                  ref={(element) => {
                    channelRowRefs.current[channel.id] = element;
                  }}
                  onClick={(event) => {
                    if (!shouldIgnoreChannelRowClick(event)) {
                      selectChannel(channel.id);
                    }
                  }}
                  onKeyDown={(event) => {
                    if ((event.key === 'Enter' || event.key === ' ') && !shouldIgnoreChannelRowClick(event)) {
                      event.preventDefault();
                      selectChannel(channel.id);
                    }
                  }}
                  onPointerDownCapture={() => highlightChannel(channel.id)}
                  role="button"
                  tabIndex={0}
                >
                  <div className="quantity-channel-compact">
                    <div className="quantity-channel-summary">
                      <strong>C{String(index + 1).padStart(3, '0')}</strong>
                      <span>{channelCategoryLabels[channel.category]}</span>
                    </div>

                    <select
                      className="quantity-channel-spec-select"
                      disabled={!inferred?.effectiveSpec}
                      onChange={(event) => {
                        const selectedSpec = options.find(
                          (option) => specKey(option) === event.target.value,
                        );
                        if (selectedSpec && inferred) {
                          commitSpec(channel.id, selectedSpec, inferred.loadSignature);
                        }
                      }}
                      value={selectedSpecKey || ''}
                    >
                      {!inferred?.effectiveSpec && <option value="">无有效线缆</option>}
                      {options.map((option) => (
                        <option key={specKey(option)} value={specKey(option)}>
                          {option.label}
                        </option>
                      ))}
                      {inferred?.effectiveSpec && !selectedSpecIsStandard && (
                        <option value={selectedSpecKey}>{inferred.effectiveSpec.label}</option>
                      )}
                    </select>

                    <input
                      className="quantity-channel-depth"
                      disabled={!inferred?.effectiveSpec}
                      onChange={(event) =>
                        dispatch(
                          updateTopologyChannelDepth({
                            channelId: channel.id,
                            depthMm: parseNumberInput(event.target.value),
                          }),
                        )
                      }
                      placeholder="高度 mm"
                      type="number"
                      value={channel.depthMm === undefined ? '' : String(channel.depthMm)}
                    />

                    <span
                      className={[
                        'quantity-channel-utilization',
                        hasWarnings || evaluation?.ok === false ? 'warning' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      最大 {maxUtilizationRatio === null ? '--' : formatPercent(maxUtilizationRatio)}
                    </span>
                  </div>

                  {expanded && inferred && (
                    <div className="channel-detail-panel">
                      <div className="channel-length-row">
                        <span>通道长度</span>
                        <strong>
                          {channelLengthDetail
                            ? formatMeters(channelLengthDetail.horizontalLengthMm)
                            : '--'}
                        </strong>
                      </div>

                      {evaluation && evaluation.utilizationRows.length > 0 && (
                        <div className="utilization-list">
                          {evaluation.utilizationRows.map((row) => (
                            <div
                              className={row.ok ? 'utilization-row' : 'utilization-row warning'}
                              key={row.label}
                            >
                              <span>{row.label}</span>
                              <em>{cableClassLabels[row.cableClass]}</em>
                              <strong>{formatPercent(row.utilizationRatio)}</strong>
                              <b>上限 {formatPercent(row.limitRatio)}</b>
                              {row.cableItems.length > 0 && (
                                <i>
                                  {row.cableItems
                                    .map(
                                      (item) =>
                                        `${item.usage ? `${item.usage} / ` : ''}${item.model} x ${item.quantity}`,
                                    )
                                    .join('；')}
                                </i>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {evaluation?.warnings.map((warning) => (
                        <div className="locked-note" key={warning}>
                          {warning}
                        </div>
                      ))}

                      <div className="panel-heading compact-heading">
                        <h2>线缆明细</h2>
                        <span>总截面 {formatArea(inferred.cableAreaMm2)}</span>
                      </div>
                      {inferred.cableLoads.length === 0 ? (
                        <div className="empty-state">
                          <strong>暂无有效线缆</strong>
                        </div>
                      ) : (
                        <div className="channel-cable-table">
                          {summarizeCableLoads(inferred.cableLoads).map((load) => (
                            <div className="channel-cable-row" key={loadRowKey(load)}>
                              <strong>{load.model}</strong>
                              <span>{load.usage || cableClassLabels[load.cableClass]}</span>
                              <em>{load.quantity} 根</em>
                              <b>外径 {load.diameterMm.toFixed(1)} mm</b>
                              <i>{formatArea(load.areaMm2)}</i>
                            </div>
                          ))}
                        </div>
                      )}

                      {channel.category === 'tray' ? (
                        <div className="custom-spec-form">
                          <strong>自定义线槽</strong>
                          <input
                            onChange={(event) =>
                              setCustomTrayDrafts((current) => ({
                                ...current,
                                [channel.id]: { ...getTrayDraft(channel.id), widthMm: event.target.value },
                              }))
                            }
                            placeholder="宽 mm"
                            type="number"
                            value={getTrayDraft(channel.id).widthMm}
                          />
                          <input
                            onChange={(event) =>
                              setCustomTrayDrafts((current) => ({
                                ...current,
                                [channel.id]: { ...getTrayDraft(channel.id), heightMm: event.target.value },
                              }))
                            }
                            placeholder="高 mm"
                            type="number"
                            value={getTrayDraft(channel.id).heightMm}
                          />
                          <input
                            onChange={(event) =>
                              setCustomTrayDrafts((current) => ({
                                ...current,
                                [channel.id]: { ...getTrayDraft(channel.id), powerWidthMm: event.target.value },
                              }))
                            }
                            placeholder="配电仓宽"
                            type="number"
                            value={getTrayDraft(channel.id).powerWidthMm}
                          />
                          <input
                            onChange={(event) =>
                              setCustomTrayDrafts((current) => ({
                                ...current,
                                [channel.id]: {
                                  ...getTrayDraft(channel.id),
                                  communicationWidthMm: event.target.value,
                                },
                              }))
                            }
                            placeholder="通信仓宽"
                            type="number"
                            value={getTrayDraft(channel.id).communicationWidthMm}
                          />
                          <button
                            className="primary-button compact"
                            disabled={!trayDraftIsValid(channel.id)}
                            onClick={() => {
                              const draft = getTrayDraft(channel.id);
                              const powerWidthMm = parseNumberInput(draft.powerWidthMm);
                              const communicationWidthMm = parseNumberInput(draft.communicationWidthMm);
                              commitSpec(
                                channel.id,
                                createCustomTraySpec({
                                  widthMm: Number(draft.widthMm),
                                  heightMm: Number(draft.heightMm),
                                  powerWidthMm: powerWidthMm ?? undefined,
                                  communicationWidthMm: communicationWidthMm ?? undefined,
                                }),
                                inferred.loadSignature,
                              );
                            }}
                            type="button"
                          >
                            保存自定义
                          </button>
                        </div>
                      ) : (
                        <div className="custom-spec-form">
                          <strong>自定义排管</strong>
                          {(['DN125', 'DN100', 'DN32'] as const).map((size) => (
                            <input
                              key={size}
                              min="0"
                              onChange={(event) =>
                                setCustomDuctDrafts((current) => ({
                                  ...current,
                                  [channel.id]: { ...getDuctDraft(channel.id), [size]: event.target.value },
                                }))
                              }
                              placeholder={`${size} 数量`}
                              type="number"
                              value={getDuctDraft(channel.id)[size]}
                            />
                          ))}
                          <button
                            className="primary-button compact"
                            disabled={!ductDraftIsValid(channel.id)}
                            onClick={() => {
                              const draft = getDuctDraft(channel.id);
                              commitSpec(
                                channel.id,
                                createCustomDuctSpec({
                                  DN125: Number(draft.DN125 || 0),
                                  DN100: Number(draft.DN100 || 0),
                                  DN32: Number(draft.DN32 || 0),
                                }),
                                inferred.loadSignature,
                              );
                            }}
                            type="button"
                          >
                            保存自定义
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="route-list">
        <div className="panel-heading compact-heading">
          <h2>BOM 摘要</h2>
          <div className="quantity-export-actions">
            <span>{bomSummary.validRouteCount} 条有效路由，线缆工程用量 *1.05</span>
            <button
              className="primary-button compact"
              disabled={!cableUsageDetailExport.canExport}
              onClick={exportCableUsageDetails}
              title={cableUsageDetailExport.message || '导出当前有效路由的线缆用量明细'}
              type="button"
            >
              导出线缆明细 CSV
            </button>
          </div>
        </div>
        {(exportMessage || cableUsageDetailExport.message) && (
          <div className={cableUsageDetailExport.canExport ? 'scope-note' : 'locked-note'}>
            {cableUsageDetailExport.canExport ? exportMessage : cableUsageDetailExport.message}
          </div>
        )}
        {bomSummary.cableRows.length === 0 ? (
          <div className="empty-state">
            <strong>暂无有效线缆路由</strong>
          </div>
        ) : (
          bomSummary.cableRows.map((row) => (
            <div className="quantity-summary-row" key={row.cableSpecId}>
              <span>{row.model}</span>
              <strong>{formatMeters(row.totalLengthMm)}</strong>
            </div>
          ))
        )}
        {bomSummary.missingDepthChannelIds.length > 0 && (
          <div className="locked-note">
            {bomSummary.missingDepthChannelIds.length} 条通道未填写敷设深度，当前 BOM 按 0 mm 深度暂算。
          </div>
        )}
      </div>
    </div>
  );
}

function ExportPanel() {
  const project = useAppSelector(selectProject);
  const cadScriptExport = useMemo(() => buildCadScriptExport(project, 'bas'), [project]);
  const [exportMessage, setExportMessage] = useState('');

  useEffect(() => {
    setExportMessage('');
  }, [cadScriptExport.text, cadScriptExport.message]);

  function exportBasScript() {
    if (!cadScriptExport.canExport) {
      setExportMessage(cadScriptExport.message);
      return;
    }

    downloadTextFile(
      `CAD脚本-${timestampForFilename()}.bas`,
      cadScriptExport.text,
      'text/plain;charset=utf-8',
    );
    setExportMessage(`已导出 ${cadScriptExport.channelCount} 条通道脚本。`);
  }

  return (
    <div className="export-panel">
      <div className="route-list">
        <div className="panel-heading compact-heading">
          <h2>CAD 脚本</h2>
          <span>.bas</span>
        </div>
        <div className="quantity-export-actions">
          <span>{cadScriptExport.channelCount} 条可导出通道</span>
          <button
            className="primary-button compact"
            disabled={!cadScriptExport.canExport}
            onClick={exportBasScript}
            title={cadScriptExport.message || '导出当前拓扑的 CAD VBA 脚本'}
            type="button"
          >
            导出 .bas
          </button>
        </div>
        {(exportMessage || cadScriptExport.message) && (
          <div className={cadScriptExport.canExport ? 'scope-note' : 'locked-note'}>
            {cadScriptExport.canExport ? exportMessage : cadScriptExport.message}
          </div>
        )}
      </div>

      <div className="route-list">
        <div className="panel-heading compact-heading">
          <h2>输出规则</h2>
          <span>Local-First</span>
        </div>
        <div className="route-detail-row">
          <span>线槽图层</span>
          <strong>CAD_HELPER_TRAY</strong>
        </div>
        <div className="route-detail-row">
          <span>排管图层</span>
          <strong>CAD_HELPER_DUCT</strong>
        </div>
        <div className="route-detail-row">
          <span>标注图层</span>
          <strong>CAD_HELPER_ANNOTATION</strong>
        </div>
      </div>

      {cadScriptExport.canExport && (
        <div className="route-list">
          <div className="panel-heading compact-heading">
            <h2>脚本预览</h2>
            <span>CAD 坐标</span>
          </div>
          <pre className="script-preview">{cadScriptExport.text}</pre>
        </div>
      )}
    </div>
  );
}

type LibraryTab = 'cables' | 'connection-points';
type ConnectionLibraryMode = 'custom' | 'device';

function cableIsReferenced(
  cableSpecId: string,
  connectionPoints: DeviceConnectionPoint[],
  connectionPointPresets: ConnectionPointPreset[],
  deviceTypePresets: DeviceTypePreset[],
) {
  return (
    connectionPoints.some((point) => point.items.some((item) => item.cableSpecId === cableSpecId)) ||
    connectionPointPresets.some((preset) =>
      preset.items.some((item) => item.cableSpecId === cableSpecId),
    ) ||
    deviceTypePresets.some((preset) =>
      preset.ports.some((port) => port.items.some((item) => item.cableSpecId === cableSpecId)),
    )
  );
}

function LibraryPanel() {
  const dispatch = useAppDispatch();
  const cableSpecs = useAppSelector(selectCableSpecs);
  const connectionPoints = useAppSelector(selectConnectionPoints);
  const connectionPointPresets = useAppSelector(selectConnectionPointPresets);
  const deviceTypePresets = useAppSelector(selectDeviceTypePresets);
  const [globalLibrary, setGlobalLibrary] = useState(() => loadGlobalPresetLibrary());
  const [tab, setTab] = useState<LibraryTab>('cables');
  const [connectionMode, setConnectionMode] = useState<ConnectionLibraryMode>('custom');
  const [cableDraft, setCableDraft] = useState<CableSpec>(() => createBlankCableSpec());
  const [customDraft, setCustomDraft] = useState<ConnectionPointPreset>(() =>
    connectionPointPresetFromItems('', []),
  );
  const [deviceDraft, setDeviceDraft] = useState<{
    deviceTypePresetId?: string;
    portId?: string;
    deviceType: string;
    portType: string;
    items: ConnectionCableItem[];
  }>({ deviceType: '', portType: '', items: [] });

  const customPresets = useMemo(() => {
    const devicePortNames = new Set(
      deviceTypePresets.flatMap((preset) => preset.ports.map((port) => port.portType)),
    );
    return connectionPointPresets.filter(
      (preset) => preset.kind === 'custom' || (!preset.kind && !devicePortNames.has(preset.name)),
    );
  }, [connectionPointPresets, deviceTypePresets]);

  const cableModelDuplicate = uniqueCableSpecsByModel(cableSpecs, globalLibrary.cableSpecs).some(
    (spec) => spec.id !== cableDraft.id && spec.model.trim() === cableDraft.model.trim(),
  );

  function refreshGlobalLibrary() {
    setGlobalLibrary(loadGlobalPresetLibrary());
  }

  function resetCableDraft() {
    setCableDraft(createBlankCableSpec());
  }

  function importMissingCableSpecs(items: ConnectionCableItem[]) {
    for (const item of items) {
      const selectedSpec = allCableSpecs.find((spec) => spec.id === item.cableSpecId);
      if (selectedSpec && !cableSpecs.some((spec) => spec.id === selectedSpec.id)) {
        dispatch(upsertCableSpec(selectedSpec));
      }
    }
  }

  function saveCableDraft() {
    if (!cableDraft.model.trim() || cableModelDuplicate) {
      return;
    }

    const nextSpec = buildCableSpec(cableDraft.model, cableDraft.diameterText);
    dispatch(upsertCableSpec(cableDraft.id ? { ...nextSpec, id: cableDraft.id } : nextSpec));
    resetCableDraft();
  }

  function selectCustomPreset(preset: ConnectionPointPreset) {
    setCustomDraft({ ...preset, kind: 'custom', items: cloneConnectionItems(preset.items) });
    setConnectionMode('custom');
  }

  function saveCustomPreset() {
    if (!customDraft.name.trim() || customDraft.items.length === 0) {
      return;
    }
    importMissingCableSpecs(customDraft.items);

    const existing = connectionPointPresets.find(
      (preset) => preset.id === customDraft.id || preset.name === customDraft.name,
    );
    const affected = existing
      ? connectionPoints.filter(
          (point) =>
            (point.presetRef?.kind === 'custom' && point.presetRef.id === existing.id) ||
            (!point.presetRef && point.mode === 'custom' && point.portType === existing.name),
        )
      : [];
    const syncToProject =
      affected.length === 0 ||
      window.confirm(
        `当前图纸中有 ${affected.length} 个节点应用了该接线孔。是否同步修改这些节点的接线孔明细？`,
      );

    dispatch(
      upsertConnectionPointPresetWithSync({
        preset: { ...customDraft, kind: 'custom', name: customDraft.name.trim() },
        syncToProject,
      }),
    );
    setCustomDraft(connectionPointPresetFromItems('', []));
  }

  function selectDevicePort(preset: DeviceTypePreset, portId: string) {
    const port = preset.ports.find((item) => item.id === portId);
    if (!port) {
      return;
    }

    setConnectionMode('device');
    setDeviceDraft({
      deviceTypePresetId: preset.id,
      portId: port.id,
      deviceType: preset.deviceType,
      portType: port.portType,
      items: cloneConnectionItems(port.items),
    });
  }

  function saveDevicePortDraft() {
    if (!deviceDraft.deviceType.trim() || !deviceDraft.portType.trim() || deviceDraft.items.length === 0) {
      return;
    }
    importMissingCableSpecs(deviceDraft.items);

    const existingPreset = deviceTypePresets.find(
      (preset) =>
        preset.id === deviceDraft.deviceTypePresetId ||
        preset.deviceType === deviceDraft.deviceType,
    );
    const portId = deviceDraft.portId ?? createPanelId('port-preset');
    const nextPort = {
      id: portId,
      portType: deviceDraft.portType.trim(),
      items: cloneConnectionItems(deviceDraft.items),
    };
    const nextPreset: DeviceTypePreset = existingPreset
      ? {
          ...existingPreset,
          deviceType: deviceDraft.deviceType.trim(),
          ports: [
            ...existingPreset.ports.filter((port) => port.id !== portId),
            nextPort,
          ],
        }
      : {
          id: createPanelId('device-type-preset'),
          deviceType: deviceDraft.deviceType.trim(),
          namePrefix: deviceDraft.deviceType.trim(),
          ports: [nextPort],
        };
    const affected = connectionPoints.filter(
      (point) =>
        point.presetRef?.kind === 'device-port' && point.presetRef.id === portId,
    );
    const syncToProject =
      affected.length === 0 ||
      window.confirm(
        `当前图纸中有 ${affected.length} 个节点应用了该设备接线孔。是否同步修改这些节点的接线孔明细？`,
      );

    dispatch(upsertDeviceTypePresetWithSync({ preset: nextPreset, syncToProject }));
    setDeviceDraft({ deviceType: '', portType: '', items: [] });
  }

  const allCableSpecs = uniqueCableSpecsByModel(cableSpecs, globalLibrary.cableSpecs);

  return (
    <div className="library-panel">
      <div className="segmented-control full-width" aria-label="库类型">
        <button
          className={tab === 'cables' ? 'segment-button active' : 'segment-button'}
          onClick={() => setTab('cables')}
          type="button"
        >
          线缆库
        </button>
        <button
          className={tab === 'connection-points' ? 'segment-button active' : 'segment-button'}
          onClick={() => setTab('connection-points')}
          type="button"
        >
          接线孔库
        </button>
      </div>

      {tab === 'cables' ? (
        <div className="library-section">
          <div className="property-form compact-form">
            <div className="panel-heading compact-heading">
              <h2>{cableDraft.id ? '编辑线缆' : '新增线缆'}</h2>
              <span>工程库</span>
            </div>
            <label>
              <span>线缆型号</span>
              <input
                onChange={(event) =>
                  setCableDraft((current) => ({ ...current, model: event.target.value }))
                }
                value={cableDraft.model}
              />
            </label>
            <label>
              <span>外径</span>
              <input
                onChange={(event) =>
                  setCableDraft((current) => ({
                    ...buildCableSpec(current.model, event.target.value),
                    id: current.id,
                  }))
                }
                placeholder="约 11.0"
                value={cableDraft.diameterText}
              />
            </label>
            {cableModelDuplicate && <div className="locked-note">线缆型号已存在。</div>}
            <button
              className="primary-button"
              disabled={!cableDraft.model.trim() || cableModelDuplicate}
              onClick={saveCableDraft}
              type="button"
            >
              保存线缆
            </button>
          </div>

          <div className="route-list">
            {cableSpecs.map((spec) => (
              <div className="library-row" key={spec.id}>
                <div>
                  <strong>{spec.model}</strong>
                  <span>{spec.diameterText || '外径未填写'}</span>
                </div>
                <button className="ghost-button compact" onClick={() => setCableDraft(spec)} type="button">
                  编辑
                </button>
                <button
                  className="danger-button compact"
                  onClick={() => {
                    if (
                      cableIsReferenced(
                        spec.id,
                        connectionPoints,
                        connectionPointPresets,
                        deviceTypePresets,
                      )
                    ) {
                      window.alert('该线缆已被节点或接线孔模板引用，不能删除。');
                      return;
                    }
                    dispatch(deleteCableSpec(spec.id));
                  }}
                  type="button"
                >
                  删除
                </button>
                <button
                  className="ghost-button compact"
                  onClick={() => {
                    upsertGlobalCableSpec(spec);
                    refreshGlobalLibrary();
                  }}
                  type="button"
                >
                  同步到全局
                </button>
              </div>
            ))}
          </div>

          {globalLibrary.cableSpecs.length > 0 && (
            <div className="route-list">
              <div className="panel-heading compact-heading">
                <h2>全局线缆</h2>
                <span>{globalLibrary.cableSpecs.length}</span>
              </div>
              {globalLibrary.cableSpecs.map((spec) => (
                <div className="library-row" key={spec.id}>
                  <div>
                    <strong>{spec.model}</strong>
                    <span>{spec.diameterText || '外径未填写'}</span>
                  </div>
                  <button
                    className="ghost-button compact"
                    disabled={cableSpecs.some((item) => item.model.trim() === spec.model.trim())}
                    onClick={() => {
                      if (cableSpecs.some((item) => item.model.trim() === spec.model.trim())) {
                        window.alert('线缆型号已存在。');
                        return;
                      }
                      dispatch(upsertCableSpec(spec));
                    }}
                    type="button"
                  >
                    导入
                  </button>
                  <button
                    className="danger-button compact"
                    onClick={() => {
                      deleteGlobalCableSpec(spec.id);
                      refreshGlobalLibrary();
                    }}
                    type="button"
                  >
                    删除全局
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="library-section">
          <div className="segmented-control full-width" aria-label="接线孔库类型">
            <button
              className={connectionMode === 'custom' ? 'segment-button active' : 'segment-button'}
              onClick={() => setConnectionMode('custom')}
              type="button"
            >
              自定义接线孔
            </button>
            <button
              className={connectionMode === 'device' ? 'segment-button active' : 'segment-button'}
              onClick={() => setConnectionMode('device')}
              type="button"
            >
              设备接线孔
            </button>
          </div>

          {connectionMode === 'custom' ? (
            <>
              <div className="property-form compact-form">
                <label>
                  <span>接线孔种类</span>
                  <input
                    onChange={(event) =>
                      setCustomDraft((current) => ({ ...current, name: event.target.value }))
                    }
                    value={customDraft.name}
                  />
                </label>
                <CableItemsTable
                  cableSpecs={allCableSpecs}
                  editable
                  items={customDraft.items}
                  onChangeItem={(index, patch) =>
                    setCustomDraft((current) => ({
                      ...current,
                      items: current.items.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, ...patch } : item,
                      ),
                    }))
                  }
                  onRemoveItem={(index) =>
                    setCustomDraft((current) => ({
                      ...current,
                      items: current.items.filter((_, itemIndex) => itemIndex !== index),
                    }))
                  }
                />
                <button
                  className="ghost-button compact"
                  onClick={() =>
                    setCustomDraft((current) => ({
                      ...current,
                      items: [
                        ...current.items,
                        {
                          id: createPanelId('connection-cable'),
                          cableSpecId: allCableSpecs[0]?.id ?? '',
                          quantity: { mode: 'fixed', count: 1 },
                          connectionHeightMm: 500,
                        },
                      ],
                    }))
                  }
                  type="button"
                >
                  添加线缆
                </button>
                <button
                  className="primary-button"
                  disabled={!customDraft.name.trim() || customDraft.items.length === 0}
                  onClick={saveCustomPreset}
                  type="button"
                >
                  保存接线孔
                </button>
              </div>
              <div className="route-list">
                {customPresets.map((preset) => (
                  <div className="library-row" key={preset.id}>
                    <div>
                      <strong>{preset.name}</strong>
                      <span>{preset.items.length} 种线缆</span>
                    </div>
                    <button className="ghost-button compact" onClick={() => selectCustomPreset(preset)} type="button">
                      编辑
                    </button>
                    <button
                      className="danger-button compact"
                      onClick={() => {
                        const referenced = connectionPoints.some(
                          (point) =>
                            point.presetRef?.kind === 'custom' && point.presetRef.id === preset.id,
                        );
                        if (referenced) {
                          window.alert('该接线孔已被当前图纸节点引用，不能删除。');
                          return;
                        }
                        dispatch(deleteConnectionPointPreset(preset.id));
                      }}
                      type="button"
                    >
                      删除
                    </button>
                    <button
                      className="ghost-button compact"
                      onClick={() => {
                        upsertGlobalConnectionPointPreset(preset);
                        refreshGlobalLibrary();
                      }}
                      type="button"
                    >
                      同步到全局
                    </button>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="property-form compact-form">
                <label>
                  <span>设备类型</span>
                  <input
                    onChange={(event) =>
                      setDeviceDraft((current) => ({ ...current, deviceType: event.target.value }))
                    }
                    value={deviceDraft.deviceType}
                  />
                </label>
                <label>
                  <span>接线孔类型</span>
                  <input
                    onChange={(event) =>
                      setDeviceDraft((current) => ({ ...current, portType: event.target.value }))
                    }
                    value={deviceDraft.portType}
                  />
                </label>
                <CableItemsTable
                  cableSpecs={allCableSpecs}
                  editable
                  items={deviceDraft.items}
                  onChangeItem={(index, patch) =>
                    setDeviceDraft((current) => ({
                      ...current,
                      items: current.items.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, ...patch } : item,
                      ),
                    }))
                  }
                  onRemoveItem={(index) =>
                    setDeviceDraft((current) => ({
                      ...current,
                      items: current.items.filter((_, itemIndex) => itemIndex !== index),
                    }))
                  }
                />
                <button
                  className="ghost-button compact"
                  onClick={() =>
                    setDeviceDraft((current) => ({
                      ...current,
                      items: [
                        ...current.items,
                        {
                          id: createPanelId('connection-cable'),
                          cableSpecId: allCableSpecs[0]?.id ?? '',
                          quantity: { mode: 'fixed', count: 1 },
                          connectionHeightMm: 500,
                        },
                      ],
                    }))
                  }
                  type="button"
                >
                  添加线缆
                </button>
                <button
                  className="primary-button"
                  disabled={
                    !deviceDraft.deviceType.trim() ||
                    !deviceDraft.portType.trim() ||
                    deviceDraft.items.length === 0
                  }
                  onClick={saveDevicePortDraft}
                  type="button"
                >
                  保存设备接线孔
                </button>
              </div>
              <div className="route-list">
                {deviceTypePresets.flatMap((preset) =>
                  preset.ports.map((port) => (
                    <div className="library-row" key={`${preset.id}-${port.id}`}>
                      <div>
                        <strong>{preset.deviceType} / {port.portType}</strong>
                        <span>{port.items.length} 种线缆</span>
                      </div>
                      <button className="ghost-button compact" onClick={() => selectDevicePort(preset, port.id)} type="button">
                        编辑
                      </button>
                      <button
                        className="danger-button compact"
                        onClick={() => {
                          const referenced = connectionPoints.some(
                            (point) =>
                              point.presetRef?.kind === 'device-port' && point.presetRef.id === port.id,
                          );
                          if (referenced) {
                            window.alert('该设备接线孔已被当前图纸节点引用，不能删除。');
                            return;
                          }
                          const nextPorts = preset.ports.filter((item) => item.id !== port.id);
                          if (nextPorts.length === 0) {
                            dispatch(deleteDeviceTypePreset(preset.id));
                          } else {
                            dispatch(upsertDeviceTypePreset({ ...preset, ports: nextPorts }));
                          }
                        }}
                        type="button"
                      >
                        删除
                      </button>
                      <button
                        className="ghost-button compact"
                        onClick={() => {
                          upsertGlobalDeviceTypePreset(preset);
                          refreshGlobalLibrary();
                        }}
                        type="button"
                      >
                        同步到全局
                      </button>
                    </div>
                  )),
                )}
              </div>
            </>
          )}

          {globalLibrary.connectionPointPresets.length > 0 && connectionMode === 'custom' && (
            <div className="route-list">
              <div className="panel-heading compact-heading">
                <h2>全局自定义接线孔</h2>
                <span>{globalLibrary.connectionPointPresets.length}</span>
              </div>
              {globalLibrary.connectionPointPresets.map((preset) => (
                <div className="library-row" key={preset.id}>
                  <div>
                    <strong>{preset.name}</strong>
                    <span>{preset.items.length} 种线缆</span>
                  </div>
                  <button
                    className="ghost-button compact"
                    onClick={() => {
                      importMissingCableSpecs(preset.items);
                      dispatch(upsertConnectionPointPreset({ ...preset, kind: 'custom' }));
                    }}
                    type="button"
                  >
                    导入
                  </button>
                  <button
                    className="danger-button compact"
                    onClick={() => {
                      deleteGlobalConnectionPointPreset(preset.id);
                      refreshGlobalLibrary();
                    }}
                    type="button"
                  >
                    删除全局
                  </button>
                </div>
              ))}
            </div>
          )}

          {globalLibrary.deviceTypePresets.length > 0 && connectionMode === 'device' && (
            <div className="route-list">
              <div className="panel-heading compact-heading">
                <h2>全局设备接线孔</h2>
                <span>{globalLibrary.deviceTypePresets.length}</span>
              </div>
              {globalLibrary.deviceTypePresets.map((preset) => (
                <div className="library-row" key={preset.id}>
                  <div>
                    <strong>{preset.deviceType}</strong>
                    <span>{preset.ports.length} 个接线孔</span>
                  </div>
                  <button
                    className="ghost-button compact"
                    onClick={() => {
                      for (const port of preset.ports) {
                        importMissingCableSpecs(port.items);
                      }
                      dispatch(upsertDeviceTypePreset(preset));
                    }}
                    type="button"
                  >
                    导入
                  </button>
                  <button
                    className="danger-button compact"
                    onClick={() => {
                      deleteGlobalDeviceTypePreset(preset.id);
                      refreshGlobalLibrary();
                    }}
                    type="button"
                  >
                    删除全局
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function RightPanel() {
  const dispatch = useAppDispatch();
  const activeStep = useAppSelector(selectActiveStep);
  const collapsed = useAppSelector(selectRightPanelCollapsed);
  const rightPanelWidth = useAppSelector(selectRightPanelWidth);
  const selectedObject = useAppSelector(selectSelectedTopologyObject);
  const image = useAppSelector(selectProjectImage);
  const calibrationDraft = useAppSelector(selectCalibrationDraft);
  const calibration = useAppSelector(selectCalibration);
  const guidance = stepGuidance[activeStep];

  function handleResizeMouseDown(event: ReactMouseEvent<HTMLDivElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = rightPanelWidth;

    function handleMouseMove(moveEvent: globalThis.MouseEvent) {
      dispatch(setRightPanelWidth(startWidth - (moveEvent.clientX - startX)));
    }

    function handleMouseUp() {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }

  if (collapsed) {
    return (
      <aside className="side-panel right-panel collapsed" aria-label="属性面板已收起">
        <button
          aria-label="展开属性面板"
          className="panel-collapse-button"
          onClick={() => dispatch(toggleRightPanelCollapsed())}
          title="展开属性面板"
          type="button"
        >
          ‹
        </button>
        <span className="collapsed-panel-label">属性</span>
      </aside>
    );
  }

  return (
    <aside className="side-panel right-panel">
      <div
        aria-label="调整属性面板宽度"
        aria-orientation="vertical"
        aria-valuemax={640}
        aria-valuemin={300}
        aria-valuenow={rightPanelWidth}
        className="right-panel-resize-handle"
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            dispatch(setRightPanelWidth(rightPanelWidth + 24));
          }
          if (event.key === 'ArrowRight') {
            event.preventDefault();
            dispatch(setRightPanelWidth(rightPanelWidth - 24));
          }
        }}
        onMouseDown={handleResizeMouseDown}
        role="separator"
        tabIndex={0}
        title="拖拽调整属性面板宽度"
      />
      <button
        aria-label="收起属性面板"
        className="panel-collapse-button expanded"
        onClick={() => dispatch(toggleRightPanelCollapsed())}
        title="收起属性面板"
        type="button"
      >
        ›
      </button>
      <section className="panel-card">
        <div className="panel-heading">
          <h2>属性面板</h2>
          <span>{guidance.title}</span>
        </div>

        {activeStep === 'calibration' ? (
          <div className="calibration-panel">
            <div className="empty-state">
              <strong>{image ? '左键标记参考点' : '先导入 PNG 底图'}</strong>
              <p>
                左键用于业务点位，右键或中键按住拖拽用于平移，滚轮用于缩放。视图变化不会改变已标记的底图像素坐标。
              </p>
            </div>

            <CalibrationPointEditor
              activePoint={calibrationDraft.activePoint}
              point={calibrationDraft.pointA}
              slot="A"
            />
            <CalibrationPointEditor
              activePoint={calibrationDraft.activePoint}
              point={calibrationDraft.pointB}
              slot="B"
            />

            <div className={calibration ? 'calibration-status complete' : 'calibration-status'}>
              {calibration
                ? `校准完成：X ${calibration.scaleX.toFixed(4)} / Y ${calibration.scaleY.toFixed(4)} CAD/px`
                : '完成两个参考点落点和 CAD 坐标输入后，将自动生成 X/Y 独立坐标转换；两个参考点需同时形成有效的 X/Y 差值。'}
            </div>
          </div>
        ) : activeStep === 'drawing' && selectedObject ? (
          <SelectedTopologySummary />
        ) : activeStep === 'devices' ? (
          <DeviceConnectionEditor />
        ) : activeStep === 'library' ? (
          <LibraryPanel />
        ) : activeStep === 'routing' ? (
          <RoutingTodoPanel />
        ) : activeStep === 'quantity' ? (
          <QuantityPanel />
        ) : activeStep === 'export' ? (
          <ExportPanel />
        ) : (
          <div className="empty-state">
            <strong>未选择对象</strong>
            <p>{guidance.body}</p>
          </div>
        )}
      </section>

      <section className="panel-card">
        <div className="panel-heading">
          <h2>阶段规则</h2>
          <span>可返回修改</span>
        </div>
        <ul className="rule-list">
          <li>节点保存为设备接线孔，不再等同于整台设备。</li>
          <li>不限数量接线孔只作为承接终点，不生成主动待办。</li>
          <li>常用库保存线缆规格、接线孔模板和设备类型模板。</li>
        </ul>
      </section>
    </aside>
  );
}
