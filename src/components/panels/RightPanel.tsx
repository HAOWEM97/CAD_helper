import { useEffect, useMemo, useState } from 'react';
import type { CalibrationDraftPoint, CalibrationSlot } from '@/domain/cad-coordinate/types';
import { parseCableQuantity, parseDiameterText } from '@/domain/library/defaultDeviceLibrary';
import type {
  CableSpec,
  ChannelCategory,
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
  selectCalibration,
  selectCalibrationDraft,
  selectConnectionPoints,
  selectConnectionPointPresets,
  selectDeviceInstances,
  selectDeviceTypePresets,
  selectProjectImage,
  selectRoutes,
  selectTopology,
} from '@/state/selectors/projectSelectors';
import {
  selectActiveStep,
  selectRightPanelCollapsed,
  selectSelectedTopologyObject,
} from '@/state/selectors/uiSelectors';
import {
  clearConnectionPointAssignments,
  createCableRoute,
  createDefaultDeviceName,
  setActiveCalibrationPoint,
  setCalibrationCadCoordinate,
  updateTopologyChannelCategory,
  upsertCableSpec,
  upsertConnectionPoint,
  upsertConnectionPointPreset,
  upsertDeviceInstance,
  upsertDeviceTypePreset,
} from '@/state/slices/projectSlice';
import { setSelectedRouteId, toggleRightPanelCollapsed } from '@/state/slices/uiSlice';
import {
  loadGlobalPresetLibrary,
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
    body: '点击拓扑节点后设置设备来源或自定义接线孔，并配置线缆数量与接线点高度。',
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

function connectionLabel(
  point: DeviceConnectionPoint,
  devices: DeviceInstance[],
) {
  if (point.mode === 'custom') {
    return `自定义 / ${point.portType}`;
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

function buildCableSpec(model: string, usage: string, diameterText: string): CableSpec {
  const diameter = parseDiameterText(diameterText);
  return {
    id: `cable-spec-${model}`.replace(/\s+/g, '-'),
    usage: usage.trim(),
    model: model.trim(),
    diameterText: diameterText.trim(),
    ...diameter,
  };
}

function connectionPointPresetFromItems(name: string, items: ConnectionCableItem[]): ConnectionPointPreset {
  return {
    id: createPanelId('connection-point-preset'),
    name: name.trim(),
    items: cloneConnectionItems(items),
  };
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

function ChannelEditor() {
  const dispatch = useAppDispatch();
  const selectedObject = useAppSelector(selectSelectedTopologyObject);
  const topology = useAppSelector(selectTopology);
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
        <span>规格</span>
        <input disabled placeholder="规格推演阶段解锁" value={channel.recommendedSpec?.label ?? ''} />
      </label>

      <label>
        <span>敷设深度</span>
        <input
          disabled
          placeholder="规格推演后可编辑"
          value={channel.depthMm === undefined ? '' : String(channel.depthMm)}
        />
      </label>

      <div className="locked-note">规格与敷设深度在阶段 4 规格推演前保持锁定。</div>
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
        <span>线缆型号</span>
        <span>数量</span>
        <span>高度</span>
        {editable && <span />}
      </div>
      {items.map((item, index) => {
        const spec = specForItem(item, cableSpecs);
        const expanded = expandedItemIds.has(item.id);
        return (
          <div className="connection-cable-entry" key={item.id}>
            <div className="connection-cable-row">
              {editable ? (
                <select
                  onChange={(event) => onChangeItem?.(index, { cableSpecId: event.target.value })}
                  value={item.cableSpecId}
                >
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
                  {spec?.model ?? '未知型号'}
                </button>
              )}
              <input
                disabled={!editable}
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
            {(expanded || editable) && spec && (
              <div className="connection-cable-detail">
                <span>用途：{spec.usage}</span>
                <span>外径：{spec.diameterText || (spec.diameterMm ? `${spec.diameterMm}mm` : '未填写')}</span>
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
  const routes = useAppSelector(selectRoutes);
  const [globalLibrary, setGlobalLibrary] = useState(() => loadGlobalPresetLibrary());
  const allDeviceTypePresets = useMemo(
    () => [...projectDeviceTypePresets, ...globalLibrary.deviceTypePresets],
    [globalLibrary.deviceTypePresets, projectDeviceTypePresets],
  );
  const allCableSpecs = useMemo(
    () => [...cableSpecs, ...globalLibrary.cableSpecs],
    [cableSpecs, globalLibrary.cableSpecs],
  );
  const allConnectionPointPresets = useMemo(
    () => [...connectionPointPresets, ...globalLibrary.connectionPointPresets],
    [connectionPointPresets, globalLibrary.connectionPointPresets],
  );
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
  const [items, setItems] = useState<ConnectionCableItem[]>([]);
  const [saveConnectionPointPreset, setSaveConnectionPointPreset] = useState(false);
  const [saveDeviceType, setSaveDeviceType] = useState(false);
  const [newCableModel, setNewCableModel] = useState('');
  const [newCableUsage, setNewCableUsage] = useState('');
  const [newCableDiameter, setNewCableDiameter] = useState('');
  const [saveNewCableGlobal, setSaveNewCableGlobal] = useState(true);
  const selectedDevicePreset =
    source === 'custom'
      ? null
      : allDeviceTypePresets.find((preset) => preset.deviceType === source) ?? null;
  const editable = source === 'custom';
  const availableDevices = deviceInstances.filter((device) => device.deviceType === source);
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
      setItems(cloneConnectionItems(existingPoint.items));
    } else {
      setSource('custom');
      setDeviceId('');
      setDeviceName('');
      setPortType('');
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
    }
  }

  function addCableItem(cableSpecId = allCableSpecs[0]?.id ?? '') {
    if (!cableSpecId) {
      return;
    }
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
    setItems((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    );
  }

  function saveNewCableSpec() {
    if (!newCableModel.trim() || !newCableUsage.trim()) {
      return;
    }
    const spec = buildCableSpec(newCableModel, newCableUsage, newCableDiameter);
    dispatch(upsertCableSpec(spec));
    if (saveNewCableGlobal) {
      upsertGlobalCableSpec(spec);
    }
    setGlobalLibrary(loadGlobalPresetLibrary());
    setNewCableModel('');
    setNewCableUsage('');
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
              <select
                onChange={(event) => {
                  const nextDeviceId = event.target.value;
                  setDeviceId(nextDeviceId);
                  const nextDevice = deviceInstances.find((device) => device.id === nextDeviceId);
                  setDeviceName(
                    nextDevice?.name ?? createDefaultDeviceName(deviceInstances, source),
                  );
                }}
                value={deviceId}
              >
                <option value="">新建设备</option>
                {availableDevices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>设备名称</span>
              <input
                onChange={(event) => setDeviceName(event.target.value)}
                placeholder={createDefaultDeviceName(deviceInstances, source)}
                value={deviceName}
              />
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
              <span>接线孔名称</span>
              <input
                onChange={(event) => setPortType(event.target.value)}
                placeholder="主机到储能"
                value={portType}
              />
            </label>
            <label>
              <span>套用常用接线孔</span>
              <select
                onChange={(event) => {
                  const preset = allConnectionPointPresets.find(
                    (item) => item.id === event.target.value,
                  );
                  if (preset) {
                    setPortType(preset.name);
                    setItems(cloneConnectionItems(preset.items));
                  }
                }}
                value=""
              >
                <option value="">选择常用接线孔</option>
                {allConnectionPointPresets.map((preset) => (
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
            setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))
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
            <span>用途/类型</span>
            <input onChange={(event) => setNewCableUsage(event.target.value)} value={newCableUsage} />
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
            disabled={!newCableModel.trim() || !newCableUsage.trim()}
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
                portType: portType.trim(),
                items: nextItems,
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
          connectionPoints.map((point) => {
            const routeStatus = routes.some((route) => route.fromConnectionPointId === point.id)
              ? '已路由'
              : routes.some((route) => route.toConnectionPointId === point.id)
                ? '作为终点'
                : connectionItemsHaveUnlimitedCapacity(point.items)
                  ? '承接端'
                  : '待路由';
            return (
              <div className="connection-row" key={point.id}>
                <strong>{connectionLabel(point, deviceInstances)}</strong>
                <span>{point.items.length} 种线缆</span>
                <small>{summarizeConnectionItems(point.items, allCableSpecs)}</small>
                <em>{routeStatus}</em>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function RoutingTodoPanel() {
  const dispatch = useAppDispatch();
  const topology = useAppSelector(selectTopology);
  const deviceInstances = useAppSelector(selectDeviceInstances);
  const connectionPoints = useAppSelector(selectConnectionPoints);
  const cableSpecs = useAppSelector(selectCableSpecs);
  const routes = useAppSelector(selectRoutes);
  const [activeStartId, setActiveStartId] = useState<string | null>(null);
  const [targetId, setTargetId] = useState('');
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
              <button
                className={activeStartId === point.id ? 'route-row active' : 'route-row'}
                disabled={connectionItemsHaveUnlimitedCapacity(point.items)}
                key={point.id}
                onClick={() => {
                  setActiveStartId(point.id);
                  setTargetId('');
                }}
                type="button"
              >
                <span>{connectionLabel(point, deviceInstances)}</span>
                <strong>
                  {connectionItemsHaveUnlimitedCapacity(point.items) ? '终点' : '起点'}
                </strong>
              </button>
            ))
          )}
        </div>
      ))}

      <div className="property-form">
        <label>
          <span>选择终点</span>
          <select
            disabled={!activeStart}
            onChange={(event) => setTargetId(event.target.value)}
            value={targetId}
          >
            <option value="">选择兼容终点</option>
            {compatibleTargets.map(({ point, validation }) => (
              <option disabled={!validation.compatible} key={point.id} value={point.id}>
                {connectionLabel(point, deviceInstances)} - {validation.reason}
              </option>
            ))}
          </select>
        </label>
        {selectedTarget && (
          <div className={selectedTarget.validation.compatible ? 'scope-note' : 'locked-note'}>
            {selectedTarget.validation.reason}
          </div>
        )}
        <button
          className="primary-button"
          disabled={!activeStart || !selectedTarget?.validation.compatible}
          onClick={() => {
            if (!activeStart || !selectedTarget?.validation.compatible) {
              return;
            }

            const result = findShortestChannelPath(
              topology,
              activeStart.nodeId,
              selectedTarget.point.nodeId,
            );
            if (!result.reachable || result.channelIds.length === 0) {
              return;
            }

            const routeId = createPanelId('route');
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
          }}
          type="button"
        >
          生成整组路由
        </button>
      </div>

      <div className="route-list">
        <div className="panel-heading compact-heading">
          <h2>已生成路由</h2>
          <span>{routes.length}</span>
        </div>
        {routes.map((route) => {
          const from = connectionPoints.find((point) => point.id === route.fromConnectionPointId);
          const to = connectionPoints.find((point) => point.id === route.toConnectionPointId);
          return (
            <button
              className="route-row"
              key={route.id}
              onClick={() => dispatch(setSelectedRouteId(route.id))}
              type="button"
            >
              <span>
                {from ? connectionLabel(from, deviceInstances) : '未知起点'} →{' '}
                {to ? connectionLabel(to, deviceInstances) : '未知终点'}
              </span>
              <strong>{route.status === 'valid' ? '有效' : '需重算'}</strong>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function RightPanel() {
  const dispatch = useAppDispatch();
  const activeStep = useAppSelector(selectActiveStep);
  const collapsed = useAppSelector(selectRightPanelCollapsed);
  const selectedObject = useAppSelector(selectSelectedTopologyObject);
  const image = useAppSelector(selectProjectImage);
  const calibrationDraft = useAppSelector(selectCalibrationDraft);
  const calibration = useAppSelector(selectCalibration);
  const guidance = stepGuidance[activeStep];

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
        ) : activeStep === 'routing' ? (
          <RoutingTodoPanel />
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
