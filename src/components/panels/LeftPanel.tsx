import { useAppDispatch } from '@/hooks/useAppDispatch';
import { useAppSelector } from '@/hooks/useAppSelector';
import { selectBomSummary, selectProject, selectTopology } from '@/state/selectors/projectSelectors';
import { selectLayerVisibility, selectLeftPanelCollapsed } from '@/state/selectors/uiSelectors';
import { toggleLayer, toggleLeftPanelCollapsed } from '@/state/slices/uiSlice';
import type { LayerVisibility } from '@/domain/project/types';

const layerLabels: Record<keyof LayerVisibility, string> = {
  baseImage: '底图',
  topology: '拓扑网络',
  cableRoutes: '线缆路径',
  channelOutlines: '通道轮廓',
  annotations: '文字标注',
};

const categoryLabels = {
  tray: '线槽',
  duct: '排管',
};

function formatMeters(mm: number) {
  return `${(mm / 1000).toFixed(2)} m`;
}

export function LeftPanel() {
  const dispatch = useAppDispatch();
  const project = useAppSelector(selectProject);
  const topology = useAppSelector(selectTopology);
  const bomSummary = useAppSelector(selectBomSummary);
  const layerVisibility = useAppSelector(selectLayerVisibility);
  const collapsed = useAppSelector(selectLeftPanelCollapsed);
  const hasBomRows = bomSummary.cableRows.length > 0 || bomSummary.channelRows.length > 0;

  if (collapsed) {
    return (
      <aside className="side-panel left-panel collapsed" aria-label="工程侧栏已收起">
        <button
          aria-label="展开工程侧栏"
          className="panel-collapse-button"
          onClick={() => dispatch(toggleLeftPanelCollapsed())}
          title="展开工程侧栏"
          type="button"
        >
          ›
        </button>
        <span className="collapsed-panel-label">工程</span>
      </aside>
    );
  }

  return (
    <aside className="side-panel left-panel">
      <button
        aria-label="收起工程侧栏"
        className="panel-collapse-button expanded"
        onClick={() => dispatch(toggleLeftPanelCollapsed())}
        title="收起工程侧栏"
        type="button"
      >
        ‹
      </button>
      <section className="panel-card">
        <div className="panel-heading">
          <h2>BOM 清单</h2>
          <span>工程用量 *1.05</span>
        </div>
        {hasBomRows ? (
          <div className="bom-list">
            {bomSummary.missingDepthChannelIds.length > 0 && (
              <div className="bom-warning">
                {bomSummary.missingDepthChannelIds.length} 条已推演通道未填写敷设深度，线缆竖向长度按 0 mm 深度暂算。
              </div>
            )}

            <div className="bom-section">
              <h3>线缆工程用量（*1.05）</h3>
              {bomSummary.cableRows.length > 0 ? (
                bomSummary.cableRows.map((row) => (
                  <div className="bom-row" key={row.cableSpecId}>
                    <div>
                      <strong>{row.model}</strong>
                      <span>{row.quantity} 根</span>
                    </div>
                    <em>工程用量</em>
                    <b>{formatMeters(row.totalLengthMm)}</b>
                  </div>
                ))
              ) : (
                <p className="bom-empty">暂无有效线缆路由</p>
              )}
            </div>

            <div className="bom-section">
              <h3>通道</h3>
              {bomSummary.channelRows.length > 0 ? (
                bomSummary.channelRows.map((row) => (
                  <div className="bom-row" key={`${row.category}-${row.label}`}>
                    <div>
                      <strong>{row.label}</strong>
                      <span>{categoryLabels[row.category]}</span>
                    </div>
                    <em>{row.count} 段</em>
                    <b>{formatMeters(row.totalLengthMm)}</b>
                  </div>
                ))
              ) : (
                <p className="bom-empty">暂无已推演通道规格</p>
              )}
            </div>
          </div>
        ) : (
          <div className="empty-state">
            <strong>暂无材料数据</strong>
            <p>完成设备路由与规格推演后，这里会显示线缆工程用量、通道规格与数量。</p>
          </div>
        )}
      </section>

      <section className="panel-card">
        <div className="panel-heading">
          <h2>图层控制</h2>
          <span>显示 / 隐藏</span>
        </div>
        <div className="layer-list">
          {Object.entries(layerLabels).map(([key, label]) => (
            <label className="layer-row" key={key}>
              <input
                checked={layerVisibility[key as keyof LayerVisibility]}
                onChange={() => dispatch(toggleLayer(key as keyof LayerVisibility))}
                type="checkbox"
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="panel-card">
        <div className="panel-heading">
          <h2>对象列表</h2>
          <span>{project.name}</span>
        </div>
        <dl className="metric-list">
          <div>
            <dt>节点</dt>
            <dd>{topology.nodes.length}</dd>
          </div>
          <div>
            <dt>通道</dt>
            <dd>{topology.channels.length}</dd>
          </div>
          <div>
            <dt>设备</dt>
            <dd>{project.deviceInstances.length}</dd>
          </div>
          <div>
            <dt>接线孔</dt>
            <dd>{project.connectionPoints.length}</dd>
          </div>
          <div>
            <dt>路由</dt>
            <dd>{project.routes.length}</dd>
          </div>
        </dl>
      </section>
    </aside>
  );
}
