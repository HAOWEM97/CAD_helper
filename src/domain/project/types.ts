import type { CalibrationState, CadPoint } from '@/domain/cad-coordinate/types';

export type WorkflowStep = 'calibration' | 'drawing' | 'devices' | 'routing' | 'quantity' | 'export';

export type ImageMetadata = {
  id: string;
  name: string;
  width: number;
  height: number;
};

export type ChannelCategory = 'tray' | 'duct';

export type ChannelSpec = {
  label: string;
  widthMm?: number;
  heightMm?: number;
  rows?: number;
  columns?: number;
};

export type TopologyNode = {
  id: string;
  position: CadPoint;
};

export type ChannelSegment = {
  id: string;
  startNodeId: string;
  endNodeId: string;
  category: ChannelCategory;
  depthMm?: number;
  recommendedSpec?: ChannelSpec;
  cableIds: string[];
};

export type TopologyGraph = {
  nodes: TopologyNode[];
  channels: ChannelSegment[];
};

export type DeviceNode = {
  id: string;
  nodeId: string;
  name: string;
  deviceType: string;
  connectionHeightMm: number;
};

export type CableTemplate = {
  id: string;
  name: string;
  cableIds: string[];
};

export type CableRouteStatus = 'valid' | 'needs-recalculation';

export type CableRoute = {
  id: string;
  fromDeviceId: string;
  toDeviceId: string;
  cableIds: string[];
  pathSegmentIds: string[];
  status: CableRouteStatus;
};

export type Project = {
  id: string;
  name: string;
  image: ImageMetadata | null;
  calibration: CalibrationState | null;
  topology: TopologyGraph;
  devices: DeviceNode[];
  cableTemplates: CableTemplate[];
  routes: CableRoute[];
};

export type LayerVisibility = {
  baseImage: boolean;
  topology: boolean;
  cableRoutes: boolean;
  channelOutlines: boolean;
  annotations: boolean;
};
