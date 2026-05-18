import { useEffect, useState } from 'react';
import type { CalibrationDraftPoint, CalibrationSlot } from '@/domain/cad-coordinate/types';
import type { ChannelCategory } from '@/domain/project/types';
import { useAppDispatch } from '@/hooks/useAppDispatch';
import { useAppSelector } from '@/hooks/useAppSelector';
import {
  selectCalibration,
  selectCalibrationDraft,
  selectProjectImage,
  selectTopology,
} from '@/state/selectors/projectSelectors';
import { selectActiveStep, selectSelectedTopologyObject } from '@/state/selectors/uiSelectors';
import {
  setActiveCalibrationPoint,
  setCalibrationCadCoordinate,
  updateTopologyChannelCategory,
} from '@/state/slices/projectSlice';

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

function formatImagePoint(point: CalibrationDraftPoint['imagePoint']) {
  if (!point) {
    return '未标记';
  }

  return `X ${point.x.toFixed(2)} / Y ${point.y.toFixed(2)} px`;
}

function parseNumberInput(value: string) {
  if (value.trim() === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

type CalibrationPointEditorProps = {
  activePoint: CalibrationSlot;
  point: CalibrationDraftPoint;
  slot: CalibrationSlot;
};

type CadCoordinateInputProps = {
  axis: 'x' | 'y';
  slot: CalibrationSlot;
  value: number | null;
};

function CadCoordinateInput({ axis, slot, value }: CadCoordinateInputProps) {
  const dispatch = useAppDispatch();
  const [inputValue, setInputValue] = useState(value === null ? '' : String(value));

  useEffect(() => {
    setInputValue(value === null ? '' : String(value));
  }, [value]);

  return (
    <input
      inputMode="decimal"
      onBlur={() => {
        if (parseNumberInput(inputValue) === null) {
          setInputValue(value === null ? '' : String(value));
        }
      }}
      onChange={(event) => {
        const nextValue = event.target.value;
        setInputValue(nextValue);
        dispatch(
          setCalibrationCadCoordinate({
            slot,
            axis,
            value: parseNumberInput(nextValue),
          }),
        );
      }}
      placeholder="0"
      type="text"
      value={inputValue}
    />
  );
}

function CalibrationPointEditor({ activePoint, point, slot }: CalibrationPointEditorProps) {
  const dispatch = useAppDispatch();
  const isActive = activePoint === slot;

  return (
    <section className={isActive ? 'calibration-point-card active' : 'calibration-point-card'}>
      <div className="calibration-point-header">
        <div>
          <strong>参考点 {slot}</strong>
          <span>{formatImagePoint(point.imagePoint)}</span>
        </div>
        <button
          className={isActive ? 'ghost-button compact active' : 'ghost-button compact'}
          onClick={() => dispatch(setActiveCalibrationPoint(slot))}
          type="button"
        >
          {isActive ? '正在标记' : '重选落点'}
        </button>
      </div>

      <div className="coordinate-grid">
        <label>
          <span>CAD X</span>
          <CadCoordinateInput axis="x" slot={slot} value={point.cadPoint.x} />
        </label>
        <label>
          <span>CAD Y</span>
          <CadCoordinateInput axis="y" slot={slot} value={point.cadPoint.y} />
        </label>
      </div>
    </section>
  );
}

const channelCategoryLabels: Record<ChannelCategory, string> = {
  tray: '线槽',
  duct: '排管',
};

function ChannelEditor() {
  const dispatch = useAppDispatch();
  const selectedObject = useAppSelector(selectSelectedTopologyObject);
  const topology = useAppSelector(selectTopology);
  const channel =
    selectedObject?.type === 'channel'
      ? topology.channels.find((item) => item.id === selectedObject.id)
      : null;

  if (!channel) {
    return (
      <div className="empty-state">
        <strong>未选择通道</strong>
        <p>切换到选择模式后，点击通道可编辑通道类型。</p>
      </div>
    );
  }

  return (
    <div className="property-form">
      <label>
        <span>通道类型</span>
        <select
          onChange={(event) =>
            dispatch(
              updateTopologyChannelCategory({
                channelId: channel.id,
                category: event.target.value as ChannelCategory,
              }),
            )
          }
          value={channel.category}
        >
          {Object.entries(channelCategoryLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span>规格</span>
        <input disabled placeholder="规格推演阶段解锁" value={channel.recommendedSpec?.label ?? ''} />
      </label>

      <label>
        <span>敷设深度</span>
        <input
          disabled
          placeholder="规格推演后可编辑"
          value={channel.depthMm === undefined ? '' : String(channel.depthMm)}
        />
      </label>

      <div className="locked-note">规格与敷设深度在阶段 4 规格推演前保持锁定。</div>
    </div>
  );
}

function SelectedTopologySummary() {
  const selectedObject = useAppSelector(selectSelectedTopologyObject);
  const topology = useAppSelector(selectTopology);

  if (selectedObject?.type === 'channel') {
    return <ChannelEditor />;
  }

  if (selectedObject?.type === 'node') {
    const node = topology.nodes.find((item) => item.id === selectedObject.id);

    return node ? (
      <div className="empty-state">
        <strong>已选择节点</strong>
        <p>
          CAD X {node.position.x.toFixed(2)} / Y {node.position.y.toFixed(2)}。拖动节点可调整位置，
          Delete 会删除该节点及其连接通道。
        </p>
      </div>
    ) : null;
  }

  return null;
}

export function RightPanel() {
  const activeStep = useAppSelector(selectActiveStep);
  const selectedObject = useAppSelector(selectSelectedTopologyObject);
  const image = useAppSelector(selectProjectImage);
  const calibrationDraft = useAppSelector(selectCalibrationDraft);
  const calibration = useAppSelector(selectCalibration);
  const guidance = stepGuidance[activeStep];

  return (
    <aside className="side-panel right-panel">
      <section className="panel-card">
        <div className="panel-heading">
          <h2>属性面板</h2>
          <span>{guidance.title}</span>
        </div>

        {activeStep === 'calibration' ? (
          <div className="calibration-panel">
            <div className="empty-state">
              <strong>{image ? '左键标记参考点' : '先导入 PNG 底图'}</strong>
              <p>
                左键用于业务点位，右键或中键按住拖拽用于平移，滚轮用于缩放。视图变化不会改变已标记的底图像素坐标。
              </p>
            </div>

            <CalibrationPointEditor
              activePoint={calibrationDraft.activePoint}
              point={calibrationDraft.pointA}
              slot="A"
            />
            <CalibrationPointEditor
              activePoint={calibrationDraft.activePoint}
              point={calibrationDraft.pointB}
              slot="B"
            />

            <div className={calibration ? 'calibration-status complete' : 'calibration-status'}>
              {calibration
                ? `校准完成：X ${calibration.scaleX.toFixed(4)} / Y ${calibration.scaleY.toFixed(4)} CAD/px`
                : '完成两个参考点落点和 CAD 坐标输入后，将自动生成 X/Y 独立坐标转换；两个参考点需同时形成有效的 X/Y 差值。'}
            </div>
          </div>
        ) : activeStep === 'drawing' && selectedObject ? (
          <SelectedTopologySummary />
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
          <li>修改校准后，既有路由会进入需重算状态。</li>
          <li>核心状态只保存业务数据和数学数据，不保存渲染实例。</li>
        </ul>
      </section>
    </aside>
  );
}
