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
  usage: string;
  model: string;
  diameterText: string;
  diameterMinMm?: number;
  diameterMaxMm?: number;
  diameterMm?: number;
};

type ConnectionCableItem = {
  id: string;
  cableSpecId: string;
  quantity: CableQuantity;
  connectionHeightMm: number;
};

type ConnectionPointPreset = {
  id: string;
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
- `ConnectionCableItem` 保存接线孔内某种线缆的数量和接线点高度，线缆型号、用途和外径来自 `CableSpec`。
- `cableSpecs`、`connectionPointPresets`、`deviceTypePresets` 保存当前工程内常用库；浏览器全局常用库由独立 `localStorage` key 保存。
- `routes` 保存接线孔到接线孔的路径，并通过 `status` 标记是否需要重算。
- `ChannelSegment.cableIds` 是从有效路由和起点接线孔明细派生写回的可追踪摘要。
- 一键清除节点属性只清空 `deviceInstances`、`connectionPoints`、`routes` 和通道上的线缆登记，不清空拓扑和常用库。
