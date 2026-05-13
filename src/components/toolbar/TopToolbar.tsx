import type { WorkflowStep } from '@/domain/project/types';
import { useAppDispatch } from '@/hooks/useAppDispatch';
import { useAppSelector } from '@/hooks/useAppSelector';
import { selectActiveStep } from '@/state/selectors/uiSelectors';
import { setActiveStep, toggleOrthogonalLock } from '@/state/slices/uiSlice';

const workflowSteps: Array<{ id: WorkflowStep; label: string; description: string }> = [
  { id: 'calibration', label: '校准', description: '底图导入与坐标映射' },
  { id: 'drawing', label: '绘制', description: '通道拓扑网络' },
  { id: 'devices', label: '设备', description: '设备节点与高度' },
  { id: 'routing', label: '路由', description: '线缆路径生成' },
  { id: 'quantity', label: '算量', description: '规格推演与 BOM' },
  { id: 'export', label: '导出', description: 'CAD 脚本与工程文件' },
];

export function TopToolbar() {
  const dispatch = useAppDispatch();
  const activeStep = useAppSelector(selectActiveStep);
  const orthogonalLock = useAppSelector((state) => state.ui.orthogonalLock);

  return (
    <header className="top-toolbar">
      <div className="brand-block">
        <span className="brand-mark">CAD</span>
        <div>
          <h1>自动布线与通道配置</h1>
          <p>Local-First 工程工作台</p>
        </div>
      </div>

      <nav className="step-nav" aria-label="工作流步骤">
        {workflowSteps.map((step) => (
          <button
            className={step.id === activeStep ? 'step-button active' : 'step-button'}
            key={step.id}
            onClick={() => dispatch(setActiveStep(step.id))}
            title={step.description}
            type="button"
          >
            <span>{step.label}</span>
          </button>
        ))}
      </nav>

      <div className="toolbar-actions">
        <button
          className={orthogonalLock ? 'ghost-button active' : 'ghost-button'}
          onClick={() => dispatch(toggleOrthogonalLock())}
          type="button"
        >
          正交锁定 O
        </button>
        <button className="primary-button" type="button">
          保存工程
        </button>
        <button className="primary-button" type="button">
          导出 CAD 脚本
        </button>
      </div>
    </header>
  );
}
