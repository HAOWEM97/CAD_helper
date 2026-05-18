import { TopToolbar } from '@/components/toolbar/TopToolbar';
import { LeftPanel } from '@/components/panels/LeftPanel';
import { RightPanel } from '@/components/panels/RightPanel';
import { StatusBar } from '@/components/status-bar/StatusBar';
import { DrawingWorkspace } from '@/canvas/viewer/DrawingWorkspace';
import { useAppSelector } from '@/hooks/useAppSelector';
import { selectLeftPanelCollapsed, selectRightPanelCollapsed } from '@/state/selectors/uiSelectors';

export function AppShell() {
  const leftPanelCollapsed = useAppSelector(selectLeftPanelCollapsed);
  const rightPanelCollapsed = useAppSelector(selectRightPanelCollapsed);
  const gridClassName = [
    'workspace-grid',
    leftPanelCollapsed ? 'left-collapsed' : '',
    rightPanelCollapsed ? 'right-collapsed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="app-shell">
      <TopToolbar />
      <div className={gridClassName}>
        <LeftPanel />
        <DrawingWorkspace />
        <RightPanel />
      </div>
      <StatusBar />
    </div>
  );
}
