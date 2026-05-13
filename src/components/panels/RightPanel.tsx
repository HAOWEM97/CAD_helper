import { useAppSelector } from '@/hooks/useAppSelector';
import { selectActiveStep } from '@/state/selectors/uiSelectors';

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
    title: '设备节点',
    body: '将拓扑节点标记为设备，并录入设备名称、类型与接线高度。',
  },
  routing: {
    title: '路由生成',
    body: '选择起点设备、终点设备与线缆模板，沿拓扑网络生成最短路径。',
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

export function RightPanel() {
  const activeStep = useAppSelector(selectActiveStep);
  const selectedObjectId = useAppSelector((state) => state.ui.selectedObjectId);
  const guidance = stepGuidance[activeStep];

  return (
    <aside className="side-panel right-panel">
      <section className="panel-card">
        <div className="panel-heading">
          <h2>属性面板</h2>
          <span>{guidance.title}</span>
        </div>

        {selectedObjectId ? (
          <div className="empty-state">
            <strong>已选择对象</strong>
            <p>对象属性编辑将在对应阶段实现后显示。</p>
          </div>
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
          <li>步骤导航允许随时切换，不做单向向导。</li>
          <li>修改拓扑后，相关路由应进入需重算状态。</li>
          <li>修改高度或深度后，BOM 必须由状态派生重算。</li>
        </ul>
      </section>
    </aside>
  );
}
