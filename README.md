# CAD 自动布线与通道配置 Web

基于 `React + TypeScript + Vite` 的 Local-First CAD 自动布线与通道配置工具。

当前版本已完成阶段 1：底图导入与坐标校准，并已通过本地验证。

- 基础项目配置
- Redux 状态结构
- 非线性步骤导航
- 工作台四区布局
- PNG 底图导入与大图查看
- 左键标记参考点，右键或中键拖拽平移，滚轮缩放
- 两点参考点校准，参考点保存为底图像素坐标
- X/Y 独立像素到 CAD 转换比
- 状态栏 CAD 坐标显示
- 高倍率缩放黑屏修复，图纸放大后仍保持可见

下一阶段：阶段 2，拓扑网络绘制。

## 开发命令

```bash
npm install
npm run dev
npm run test:run
npm run typecheck
npm run build
```

## 项目计划

详细开发约束、阶段计划和验收标准见 [Plan.md](./Plan.md)。
