import { useAppSelector } from '@/hooks/useAppSelector';
import { selectProjectImage } from '@/state/selectors/projectSelectors';
import { selectActiveStep } from '@/state/selectors/uiSelectors';

const stepHints = {
  calibration: '导入底图后点击两个 CAD 基准点，建立像素与真实坐标映射。',
  drawing: '在图纸上绘制通道骨架，使用正交锁定和吸附保证拓扑清晰。',
  devices: '选择拓扑节点并标记为设备，录入接线点绝对高度。',
  routing: '选择起点、终点和线缆模板，生成沿拓扑网络的最短路径。',
  quantity: '查看规格推演结果，录入敷设深度并刷新 BOM。',
  export: '导出 CAD 脚本或工程 JSON，交付物均在浏览器本地生成。',
};

export function DrawingWorkspace() {
  const image = useAppSelector(selectProjectImage);
  const activeStep = useAppSelector(selectActiveStep);

  return (
    <main className="drawing-workspace">
      <div className="canvas-stage">
        <div className="grid-backdrop" />
        <div className="workspace-empty-card">
          <span className="stage-label">图纸交互区</span>
          <h2>{image ? image.name : '尚未导入 PNG 底图'}</h2>
          <p>{stepHints[activeStep]}</p>
          <button className="primary-button" type="button">
            导入 PNG 底图
          </button>
        </div>
      </div>
    </main>
  );
}
