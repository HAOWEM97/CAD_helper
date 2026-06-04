import { useEffect, useState, useRef, type ChangeEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import type { WorkflowStep } from '@/domain/project/types';
import { useAppDispatch } from '@/hooks/useAppDispatch';
import { useAppSelector } from '@/hooks/useAppSelector';
import { downloadBlob, downloadTextFile, timestampForFilename } from '@/services/file/downloadTextFile';
import {
  clearDraftImageBlob,
  clearPersistedDraft,
  loadDraftImageBlob,
  saveDraftImageBlob,
} from '@/services/draft/draftPersistence';
import {
  createProjectPackage,
  parseProjectFile,
  parseProjectPackage,
  serializeProjectFile,
} from '@/services/project-io/projectFile';
import { selectProject } from '@/state/selectors/projectSelectors';
import { selectActiveStep } from '@/state/selectors/uiSelectors';
import { replaceProject, resetProject } from '@/state/slices/projectSlice';
import {
  setActiveStep,
  setTopologyToolMode,
  toggleOrthogonalLock,
  toggleSnappingEnabled,
} from '@/state/slices/uiSlice';

const workflowSteps: Array<{ id: WorkflowStep; label: string; description: string }> = [
  { id: 'calibration', label: '校准', description: '底图导入与坐标映射' },
  { id: 'drawing', label: '绘制', description: '通道拓扑网络' },
  { id: 'devices', label: '设备', description: '设备接线孔与接线孔明细' },
  { id: 'library', label: '库', description: '线缆库与接线孔库' },
  { id: 'routing', label: '路由', description: '线缆路径生成' },
  { id: 'quantity', label: '算量', description: '规格推演与 BOM' },
  { id: 'export', label: '导出', description: 'CAD 脚本与工程文件' },
];

const SAVE_DIALOG_WIDTH = 520;
const SAVE_DIALOG_INITIAL_TOP = 92;
const PROJECT_MENU_WIDTH = 156;

type SaveDialogPosition = {
  left: number;
  top: number;
};

export function TopToolbar() {
  const dispatch = useAppDispatch();
  const activeStep = useAppSelector(selectActiveStep);
  const project = useAppSelector(selectProject);
  const orthogonalLock = useAppSelector((state) => state.ui.orthogonalLock);
  const snappingEnabled = useAppSelector((state) => state.ui.snappingEnabled);
  const topologyToolMode = useAppSelector((state) => state.ui.topologyToolMode);
  const projectFileInputRef = useRef<HTMLInputElement | null>(null);
  const projectMenuRef = useRef<HTMLDivElement | null>(null);
  const projectMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [projectMenuPosition, setProjectMenuPosition] = useState({ left: 0, top: 0 });
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [saveDialogPosition, setSaveDialogPosition] = useState<SaveDialogPosition>(() => ({
    left:
      typeof window === 'undefined'
        ? 0
        : Math.max(16, (window.innerWidth - SAVE_DIALOG_WIDTH) / 2),
    top: SAVE_DIALOG_INITIAL_TOP,
  }));

  useEffect(() => {
    if (!saveDialogOpen || typeof window === 'undefined') {
      return;
    }

    setSaveDialogPosition((current) => ({
      left: Math.min(Math.max(16, current.left), Math.max(16, window.innerWidth - SAVE_DIALOG_WIDTH - 16)),
      top: Math.min(Math.max(16, current.top), Math.max(16, window.innerHeight - 240)),
    }));
  }, [saveDialogOpen]);

  useEffect(() => {
    if (!projectMenuOpen) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (
        event.target instanceof Node &&
        projectMenuRef.current &&
        !projectMenuRef.current.contains(event.target) &&
        !projectMenuButtonRef.current?.contains(event.target)
      ) {
        setProjectMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [projectMenuOpen]);

  function updateProjectMenuPosition() {
    const button = projectMenuButtonRef.current;
    if (!button || typeof window === 'undefined') {
      return;
    }

    const rect = button.getBoundingClientRect();
    setProjectMenuPosition({
      left: Math.min(
        Math.max(8, rect.right - PROJECT_MENU_WIDTH),
        Math.max(8, window.innerWidth - PROJECT_MENU_WIDTH - 8),
      ),
      top: Math.min(Math.max(8, rect.bottom + 8), Math.max(8, window.innerHeight - 140)),
    });
  }

  useEffect(() => {
    if (!projectMenuOpen) {
      return;
    }

    updateProjectMenuPosition();
    window.addEventListener('resize', updateProjectMenuPosition);
    window.addEventListener('scroll', updateProjectMenuPosition, true);
    return () => {
      window.removeEventListener('resize', updateProjectMenuPosition);
      window.removeEventListener('scroll', updateProjectMenuPosition, true);
    };
  }, [projectMenuOpen]);

  function toggleProjectMenu() {
    updateProjectMenuPosition();
    setProjectMenuOpen((current) => !current);
  }

  function projectFilename() {
    return (project.name || '未命名工程').replace(/[\\/:*?"<>|]+/g, '_');
  }

  function saveProjectFile() {
    downloadTextFile(
      `${projectFilename()}-${timestampForFilename()}.json`,
      serializeProjectFile(project),
      'application/json;charset=utf-8',
    );
    setSaveDialogOpen(false);
  }

  function openSaveDialog() {
    setProjectMenuOpen(false);
    setSaveDialogOpen(true);
  }

  function openProjectFilePicker() {
    setProjectMenuOpen(false);
    projectFileInputRef.current?.click();
  }

  function imageBlobMatchesProjectMetadata(imageBlob: Blob) {
    return new Promise<boolean>((resolve) => {
      if (!project.image) {
        resolve(false);
        return;
      }

      const url = URL.createObjectURL(imageBlob);
      const probe = new Image();
      probe.onload = () => {
        URL.revokeObjectURL(url);
        resolve(
          probe.naturalWidth === project.image?.width &&
            probe.naturalHeight === project.image.height,
        );
      };
      probe.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(false);
      };
      probe.src = url;
    });
  }

  async function saveProjectPackage() {
    if (!project.image) {
      window.alert('当前工程没有底图，无法保存带底图工程包。');
      return;
    }

    const imageBlob = await loadDraftImageBlob();
    if (!imageBlob) {
      window.alert('当前底图文件不可用，请先重新选择原 PNG，再保存带底图工程。');
      return;
    }

    if (!(await imageBlobMatchesProjectMetadata(imageBlob))) {
      window.alert('当前暂存底图与工程底图尺寸不一致，请先重新选择原 PNG，再保存带底图工程。');
      return;
    }

    downloadBlob(
      `${projectFilename()}-${timestampForFilename()}.cadproj`,
      await createProjectPackage(project, imageBlob),
    );
    setSaveDialogOpen(false);
  }

  async function loadProjectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    try {
      const isProjectPackage = /\.(cadproj|zip)$/i.test(file.name);
      const parsed = isProjectPackage
        ? await parseProjectPackage(file)
        : { project: parseProjectFile(await file.text()), imageBlob: null };
      if (parsed.imageBlob) {
        await saveDraftImageBlob(parsed.imageBlob);
      }

      const nextProject = parsed.project;
      const loadMessage = parsed.imageBlob
        ? '工程包已载入，底图已随工程恢复。'
        : nextProject.image
          ? `工程已载入。JSON 不包含 PNG 底图文件，请重新选择原底图：${nextProject.image.name}。`
          : '工程已载入。该工程未保存底图元数据。';
      dispatch(replaceProject(nextProject));
      dispatch(setActiveStep('calibration'));
      window.alert(loadMessage);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : '载入工程 JSON 失败。');
    }
  }

  async function clearCurrentProject() {
    setProjectMenuOpen(false);
    const confirmed = window.confirm(
      [
        '确认清除当前工程？',
        '',
        '这将清除当前图纸、校准、拓扑、设备接线孔、路由、规格和本地草稿。',
        '此操作不会删除你已经下载保存的工程文件。',
      ].join('\n'),
    );
    if (!confirmed) {
      return;
    }

    await clearDraftImageBlob();
    clearPersistedDraft();
    dispatch(resetProject());
    dispatch(setActiveStep('calibration'));
    setSaveDialogOpen(false);
  }

  function handleSaveDialogDragStart(event: ReactMouseEvent<HTMLElement>) {
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const startPosition = saveDialogPosition;

    function handleMouseMove(moveEvent: MouseEvent) {
      const nextLeft = startPosition.left + moveEvent.clientX - startX;
      const nextTop = startPosition.top + moveEvent.clientY - startY;
      setSaveDialogPosition({
        left: Math.min(Math.max(8, nextLeft), Math.max(8, window.innerWidth - 80)),
        top: Math.min(Math.max(8, nextTop), Math.max(8, window.innerHeight - 80)),
      });
    }

    function handleMouseUp() {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    document.body.style.cursor = 'move';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }

  const saveDialog = saveDialogOpen ? (
    <div className="modal-backdrop" role="presentation">
      <section
        className="save-project-dialog"
        aria-modal="true"
        role="dialog"
        style={{ left: saveDialogPosition.left, top: saveDialogPosition.top }}
      >
        <div
          className="panel-heading compact-heading draggable-dialog-heading"
          onMouseDown={handleSaveDialogDragStart}
        >
          <h2>保存工程</h2>
          <span>选择保存方式</span>
        </div>
        <div className="save-project-options">
          <button className="save-project-option" onClick={saveProjectFile} type="button">
            <strong>仅保存工程数据</strong>
            <span>导出 .json 文件，文件较小；重新打开后需要重新选择 PNG 底图。</span>
          </button>
          <button className="save-project-option" onClick={saveProjectPackage} type="button">
            <strong>保存工程数据和底图</strong>
            <span>导出 .cadproj 工程包，文件较大；重新打开后可直接恢复底图。</span>
          </button>
        </div>
        <div className="dialog-actions">
          <button className="ghost-button" onClick={() => setSaveDialogOpen(false)} type="button">
            取消
          </button>
        </div>
      </section>
    </div>
  ) : null;

  const projectMenu = projectMenuOpen ? (
    <div
      className="project-menu-popover"
      ref={projectMenuRef}
      style={{ left: projectMenuPosition.left, top: projectMenuPosition.top }}
    >
      <button onClick={openSaveDialog} type="button">
        保存工程
      </button>
      <button onClick={openProjectFilePicker} type="button">
        载入工程
      </button>
      <button className="danger-menu-item" onClick={clearCurrentProject} type="button">
        清除当前工程
      </button>
    </div>
  ) : null;

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
        {activeStep === 'drawing' && (
          <div className="segmented-control" aria-label="拓扑工具模式">
            <button
              className={topologyToolMode === 'draw' ? 'segment-button active' : 'segment-button'}
              onClick={() => dispatch(setTopologyToolMode('draw'))}
              type="button"
            >
              绘制
            </button>
            <button
              className={
                topologyToolMode === 'select' ? 'segment-button active' : 'segment-button'
              }
              onClick={() => dispatch(setTopologyToolMode('select'))}
              type="button"
            >
              选择
            </button>
          </div>
        )}
        <button
          className={snappingEnabled ? 'ghost-button active' : 'ghost-button'}
          onClick={() => dispatch(toggleSnappingEnabled())}
          type="button"
        >
          吸附
        </button>
        <button
          className={orthogonalLock ? 'ghost-button active' : 'ghost-button'}
          onClick={() => dispatch(toggleOrthogonalLock())}
          type="button"
        >
          正交锁定 O
        </button>
        <input
          ref={projectFileInputRef}
          accept="application/json,.json,.cadproj,.zip"
          className="visually-hidden-file-input"
          onChange={loadProjectFile}
          type="file"
        />
        <div className="project-menu">
          <button
            ref={projectMenuButtonRef}
            className={projectMenuOpen ? 'primary-button active' : 'primary-button'}
            onClick={toggleProjectMenu}
            type="button"
          >
            工程 ▾
          </button>
        </div>
      </div>
      {projectMenu && typeof document !== 'undefined' && createPortal(projectMenu, document.body)}
      {saveDialog && typeof document !== 'undefined' && createPortal(saveDialog, document.body)}
    </header>
  );
}
