import { useAppSelector } from '@/hooks/useAppSelector';
import { selectCalibration } from '@/state/selectors/projectSelectors';
import { selectStatusBarState } from '@/state/selectors/uiSelectors';

const stepLabels = {
  calibration: '校准',
  drawing: '绘制',
  devices: '设备',
  library: '库',
  routing: '路由',
  quantity: '算量',
  export: '导出',
};

const topologyToolLabels = {
  draw: '绘制',
  select: '选择',
};

export function StatusBar() {
  const status = useAppSelector(selectStatusBarState);
  const calibration = useAppSelector(selectCalibration);
  const positionText = status.mouseCadPosition
    ? `X ${status.mouseCadPosition.x.toFixed(2)} / Y ${status.mouseCadPosition.y.toFixed(2)}`
    : 'CAD 坐标未定位';

  return (
    <footer className="status-bar">
      <span>当前阶段：{stepLabels[status.activeStep]}</span>
      {status.activeStep === 'drawing' && <span>工具：{topologyToolLabels[status.topologyToolMode]}</span>}
      <span>坐标：{positionText}</span>
      <span>缩放：{status.zoomPercent}%</span>
      <span>正交：{status.orthogonalLock ? '开启' : '关闭'}</span>
      <span>吸附：{status.snappingEnabled ? '开启' : '关闭'}</span>
      <span>校准：{calibration ? '已完成' : '未完成'}</span>
    </footer>
  );
}
