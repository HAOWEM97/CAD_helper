import type { CalibrationDraft, CalibrationState, CadPoint } from '@/domain/cad-coordinate/types';

export type WorkflowStep =
  | 'calibration'
  | 'drawing'
  | 'devices'
  | 'library'
  | 'routing'
  | 'quantity'
  | 'export';

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

export type CableQuantity =
  | {
      mode: 'fixed';
      count: number;
    }
  | {
      mode: 'unlimited';
    };

export type CableSpec = {
  id: string;
  model: string;
  diameterText: string;
  diameterMinMm?: number;
  diameterMaxMm?: number;
  diameterMm?: number;
};

export type ConnectionCableItem = {
  id: string;
  cableSpecId: string;
  usage?: string;
  quantity: CableQuantity;
  connectionHeightMm: number;
};

export type ConnectionPointPreset = {
  id: string;
  kind?: 'device-port' | 'custom';
  name: string;
  items: ConnectionCableItem[];
};

export type DevicePortPreset = {
  id: string;
  portType: string;
  items: ConnectionCableItem[];
};

export type DeviceTypePreset = {
  id: string;
  deviceType: string;
  namePrefix: string;
  ports: DevicePortPreset[];
};

export type DeviceInstance = {
  id: string;
  name: string;
  deviceType: string;
};

export type DeviceConnectionPoint = {
  id: string;
  nodeId: string;
  mode: 'device' | 'custom';
  deviceId?: string;
  customInstanceName?: string;
  portType: string;
  items: ConnectionCableItem[];
  presetRef?: {
    kind: 'device-port' | 'custom';
    id: string;
  };
};

export type CableRouteStatus = 'valid' | 'needs-recalculation';

export type CableRoute = {
  id: string;
  fromConnectionPointId: string;
  toConnectionPointId: string;
  pathSegmentIds: string[];
  status: CableRouteStatus;
};

export type Project = {
  id: string;
  name: string;
  image: ImageMetadata | null;
  calibrationDraft: CalibrationDraft;
  calibration: CalibrationState | null;
  topology: TopologyGraph;
  deviceInstances: DeviceInstance[];
  connectionPoints: DeviceConnectionPoint[];
  cableSpecs: CableSpec[];
  connectionPointPresets: ConnectionPointPreset[];
  deviceTypePresets: DeviceTypePreset[];
  routes: CableRoute[];
};

export type LayerVisibility = {
  baseImage: boolean;
  topology: boolean;
  cableRoutes: boolean;
  channelOutlines: boolean;
  annotations: boolean;
};
