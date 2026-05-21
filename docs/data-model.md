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
  cableBundlePresets: CableBundlePreset[];
  deviceTypePresets: DeviceTypePreset[];
  routes: CableRoute[];
};
```

## 约束

- `image` 只保存元数据，不保存浏览器运行时对象。
- `calibration` 保存像素点、CAD 点、比例和偏移。
- `topology` 保存节点与通道。
- `deviceInstances` 保存真实设备实例；同一设备可关联多个 `connectionPoints`。
- `connectionPoints` 保存绑定到拓扑节点的设备接线孔、安装高度和线缆组合。
- `cableSpecs`、`cableBundlePresets`、`deviceTypePresets` 保存当前工程内常用库；浏览器全局常用库由独立 `localStorage` key 保存。
- `routes` 保存接线孔到接线孔的路径，并通过 `status` 标记是否需要重算。
