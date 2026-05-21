import type { ChannelSegment, TopologyGraph } from '@/domain/project/types';
import { getDistance } from '@/domain/topology/topologyGeometry';

type RouteEdge = {
  channel: ChannelSegment;
  nextNodeId: string;
  weight: number;
};

export type ShortestPathResult =
  | {
      reachable: true;
      channelIds: string[];
      distance: number;
    }
  | {
      reachable: false;
      channelIds: [];
      distance: null;
    };

function buildAdjacency(topology: TopologyGraph) {
  const nodeById = new Map(topology.nodes.map((node) => [node.id, node]));
  const adjacency = new Map<string, RouteEdge[]>();

  for (const channel of topology.channels) {
    const start = nodeById.get(channel.startNodeId);
    const end = nodeById.get(channel.endNodeId);
    if (!start || !end) {
      continue;
    }

    const weight = getDistance(start.position, end.position);
    adjacency.set(channel.startNodeId, [
      ...(adjacency.get(channel.startNodeId) ?? []),
      { channel, nextNodeId: channel.endNodeId, weight },
    ]);
    adjacency.set(channel.endNodeId, [
      ...(adjacency.get(channel.endNodeId) ?? []),
      { channel, nextNodeId: channel.startNodeId, weight },
    ]);
  }

  return adjacency;
}

export function findShortestChannelPath(
  topology: TopologyGraph,
  startNodeId: string,
  endNodeId: string,
): ShortestPathResult {
  if (startNodeId === endNodeId) {
    return { reachable: true, channelIds: [], distance: 0 };
  }

  const nodeIds = new Set(topology.nodes.map((node) => node.id));
  if (!nodeIds.has(startNodeId) || !nodeIds.has(endNodeId)) {
    return { reachable: false, channelIds: [], distance: null };
  }

  const adjacency = buildAdjacency(topology);
  const distances = new Map<string, number>();
  const previous = new Map<string, { nodeId: string; channelId: string }>();
  const unvisited = new Set(nodeIds);

  for (const nodeId of nodeIds) {
    distances.set(nodeId, nodeId === startNodeId ? 0 : Number.POSITIVE_INFINITY);
  }

  while (unvisited.size > 0) {
    let currentNodeId: string | null = null;
    let currentDistance = Number.POSITIVE_INFINITY;

    for (const nodeId of unvisited) {
      const distance = distances.get(nodeId) ?? Number.POSITIVE_INFINITY;
      if (distance < currentDistance) {
        currentDistance = distance;
        currentNodeId = nodeId;
      }
    }

    if (!currentNodeId || currentDistance === Number.POSITIVE_INFINITY) {
      break;
    }

    if (currentNodeId === endNodeId) {
      break;
    }

    unvisited.delete(currentNodeId);

    for (const edge of adjacency.get(currentNodeId) ?? []) {
      if (!unvisited.has(edge.nextNodeId)) {
        continue;
      }

      const nextDistance = currentDistance + edge.weight;
      if (nextDistance < (distances.get(edge.nextNodeId) ?? Number.POSITIVE_INFINITY)) {
        distances.set(edge.nextNodeId, nextDistance);
        previous.set(edge.nextNodeId, {
          nodeId: currentNodeId,
          channelId: edge.channel.id,
        });
      }
    }
  }

  const finalDistance = distances.get(endNodeId) ?? Number.POSITIVE_INFINITY;
  if (finalDistance === Number.POSITIVE_INFINITY) {
    return { reachable: false, channelIds: [], distance: null };
  }

  const channelIds: string[] = [];
  let cursor = endNodeId;
  while (cursor !== startNodeId) {
    const step = previous.get(cursor);
    if (!step) {
      return { reachable: false, channelIds: [], distance: null };
    }

    channelIds.unshift(step.channelId);
    cursor = step.nodeId;
  }

  return {
    reachable: true,
    channelIds,
    distance: finalDistance,
  };
}
