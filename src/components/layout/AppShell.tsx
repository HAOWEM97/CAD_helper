import { TopToolbar } from '@/components/toolbar/TopToolbar';
import { LeftPanel } from '@/components/panels/LeftPanel';
import { RightPanel } from '@/components/panels/RightPanel';
import { StatusBar } from '@/components/status-bar/StatusBar';
import { DrawingWorkspace } from '@/canvas/viewer/DrawingWorkspace';

export function AppShell() {
  return (
    <div className="app-shell">
      <TopToolbar />
      <div className="workspace-grid">
        <LeftPanel />
        <DrawingWorkspace />
        <RightPanel />
      </div>
      <StatusBar />
    </div>
  );
}
