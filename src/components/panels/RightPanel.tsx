import { useEffect, useState } from 'react';
import type { CalibrationDraftPoint, CalibrationSlot } from '@/domain/cad-coordinate/types';
import { useAppDispatch } from '@/hooks/useAppDispatch';
import { useAppSelector } from '@/hooks/useAppSelector';
import {
  selectCalibration,
  selectCalibrationDraft,
  selectProjectImage,
} from '@/state/selectors/projectSelectors';
import { selectActiveStep } from '@/state/selectors/uiSelectors';
import {
  setActiveCalibrationPoint,
  setCalibrationCadCoordinate,
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

export function RightPanel() {
  const activeStep = useAppSelector(selectActiveStep);
  const selectedObjectId = useAppSelector((state) => state.ui.selectedObjectId);
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
                ? `校准完成：1 px = ${calibration.scale.toFixed(4)} CAD 单位`
                : '完成两个参考点落点和 CAD 坐标输入后，将自动生成坐标转换。'}
            </div>
          </div>
        ) : selectedObjectId ? (
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
          <li>修改校准后，既有路由会进入需重算状态。</li>
          <li>核心状态只保存业务数据和数学数据，不保存渲染实例。</li>
        </ul>
      </section>
    </aside>
  );
}
