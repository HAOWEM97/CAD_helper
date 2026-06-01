import type { CSSProperties } from 'react';
import { TopToolbar } from '@/components/toolbar/TopToolbar';
import { LeftPanel } from '@/components/panels/LeftPanel';
import { RightPanel } from '@/components/panels/RightPanel';
import { StatusBar } from '@/components/status-bar/StatusBar';
import { DrawingWorkspace } from '@/canvas/viewer/DrawingWorkspace';
import { useAppSelector } from '@/hooks/useAppSelector';
import {
  selectLeftPanelCollapsed,
  selectRightPanelCollapsed,
  selectRightPanelWidth,
} from '@/state/selectors/uiSelectors';

export function AppShell() {
  const leftPanelCollapsed = useAppSelector(selectLeftPanelCollapsed);
  const rightPanelCollapsed = useAppSelector(selectRightPanelCollapsed);
  const rightPanelWidth = useAppSelector(selectRightPanelWidth);
  const gridClassName = [
    'workspace-grid',
    leftPanelCollapsed ? 'left-collapsed' : '',
    rightPanelCollapsed ? 'right-collapsed' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const gridStyle = {
    '--right-panel-width': `${rightPanelCollapsed ? 52 : rightPanelWidth}px`,
  } as CSSProperties;

  return (
    <div className="app-shell">
      <TopToolbar />
      <div className={gridClassName} style={gridStyle}>
        <LeftPanel />
        <DrawingWorkspace />
        <RightPanel />
      </div>
      <StatusBar />
    </div>
  );
}
