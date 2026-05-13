# Data Model

工程数据以 `Project` 为根对象，必须保持 JSON 可序列化。

```ts
type Project = {
  id: string;
  name: string;
  image: ImageMetadata | null;
  calibration: CalibrationState | null;
  topology: TopologyGraph;
  devices: DeviceNode[];
  cableTemplates: CableTemplate[];
  routes: CableRoute[];
};
```

## 约束

- `image` 只保存元数据，不保存浏览器运行时对象。
- `calibration` 保存像素点、CAD 点、比例和偏移。
- `topology` 保存节点与通道。
- `routes` 保存路径所经过的通道 ID，并通过 `status` 标记是否需要重算。
