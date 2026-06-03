# Data Model

工程数据以 `Project` 为根对象，必须保持 JSON 可序列化。

```ts
type Project = {
  id: string;
  name: string;
  image: ImageMetadata | null;
  calibration: CalibrationState | null;
  topology: TopologyGraph;
  deviceInstances: DeviceInstance[];
  connectionPoints: DeviceConnectionPoint[];
  cableSpecs: CableSpec[];
  connectionPointPresets: ConnectionPointPreset[];
  deviceTypePresets: DeviceTypePreset[];
  routes: CableRoute[];
};
```

## 阶段 3 核心类型

```ts
type DeviceInstance = {
  id: string;
  name: string;
  deviceType: string;
};

type DeviceConnectionPoint = {
  id: string;
  nodeId: string;
  mode: 'device' | 'custom';
  deviceId?: string;
  portType: string;
  items: ConnectionCableItem[];
};

type CableSpec = {
  id: string;
  model: string;
  diameterText: string;
  diameterMinMm?: number;
  diameterMaxMm?: number;
  diameterMm?: number;
};

type ConnectionCableItem = {
  id: string;
  cableSpecId: string;
  acceptsAnyCable?: boolean;
  usage?: string;
  quantity: CableQuantity;
  connectionHeightMm: number;
};

type ConnectionPointPreset = {
  id: string;
  kind?: 'device-port' | 'custom';
  name: string;
  items: ConnectionCableItem[];
};

type DeviceTypePreset = {
  id: string;
  deviceType: string;
  namePrefix: string;
  ports: DevicePortPreset[];
};
```

## 约束

- `image` 只保存元数据，不保存浏览器运行时对象。
- `calibration` 保存像素点、CAD 点、比例和偏移。
- `topology` 保存节点与通道。
- `deviceInstances` 保存真实设备实例；同一设备可关联多个 `connectionPoints`。
- `connectionPoints` 保存绑定到拓扑节点的接线孔；设备模式关联设备实例，自定义模式可独立存在。
- `CableSpec` 只保存线缆型号和外径信息；型号在当前工程线缆库中唯一。
- `ConnectionCableItem` 保存接线孔内某种线缆的型号引用、数量、安装高度和可选用途。
- `ConnectionCableItem.acceptsAnyCable` 配合不限数量表示万能承接点，例如默认“电缆井 / 电缆汇总点”。
- `cableSpecs`、`connectionPointPresets`、`deviceTypePresets` 保存当前工程内常用库；浏览器全局常用库由独立 `localStorage` key 保存。
- `DeviceConnectionPoint.presetRef` 记录节点来源模板，用于模板修改时确认同步；取消同步后节点保留当前快照并解除绑定。
- `routes` 保存接线孔到接线孔的路径，并通过 `status` 标记是否需要重算。
- 当前路由业务约束是一个 `fromConnectionPointId` 只保留一条路由；同一起点重新生成或重算时替换旧记录。
- `ChannelSegment.cableIds` 是从有效路由和起点接线孔明细派生写回的可追踪摘要。
- `ChannelSegment.depthMm` 保存用户输入的通道敷设深度；推荐规格和 BOM 由当前工程状态实时派生。
- 阶段 4 不把 BOM 汇总或线缆用量明细落库，避免路由、安装高度、通道高度或线缆数量修改后出现旧统计残留。
- 页面 BOM 线缆汇总显示工程用量，计算口径为“单根长度 * 1.05 * 数量”；单根长度由路由平面长度、起终点接线长度和路径高度变换长度组成。
- 线缆用量明细 CSV 是导出时派生的交付结果，每行对应“一条有效路由中的一种起点线缆明细”，不改变工程 JSON 数据结构。
- 一键清除节点属性只清空 `deviceInstances`、`connectionPoints`、`routes` 和通道上的线缆登记，不清空拓扑和常用库。

## UI 草稿状态

- `UiState.rightPanelWidth` 记录右侧属性面板展开时的用户宽度偏好，默认 `320`，范围 `300-640`。
- `rightPanelWidth` 只属于浏览器本地草稿状态，不属于 `Project` 工程业务数据；右侧栏收起时仍显示为窄栏。
