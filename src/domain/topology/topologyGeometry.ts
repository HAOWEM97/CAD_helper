import type { Point2D } from '@/domain/geometry/types';
import type { ChannelSegment, TopologyNode } from '@/domain/project/types';

export type NodeSnapResult = {
  node: TopologyNode;
  distance: number;
} | null;

export type AxisSnapResult = {
  point: Point2D;
  axis: 'horizontal' | 'vertical' | null;
};

export function getDistance(a: Point2D, b: Point2D) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function findNearestNode(
  point: Point2D,
  nodes: TopologyNode[],
  maxDistance: number,
): NodeSnapResult {
  let nearest: NodeSnapResult = null;

  for (const node of nodes) {
    const distance = getDistance(point, node.position);
    if (distance <= maxDistance && (!nearest || distance < nearest.distance)) {
      nearest = { node, distance };
    }
  }

  return nearest;
}

export function applyAxisSnap(
  point: Point2D,
  origin: Point2D,
  maxDistance: number,
): AxisSnapResult {
  const horizontalDistance = Math.abs(point.y - origin.y);
  const verticalDistance = Math.abs(point.x - origin.x);

  if (horizontalDistance > maxDistance && verticalDistance > maxDistance) {
    return { point, axis: null };
  }

  if (horizontalDistance <= verticalDistance) {
    return {
      point: { x: point.x, y: origin.y },
      axis: 'horizontal',
    };
  }

  return {
    point: { x: origin.x, y: point.y },
    axis: 'vertical',
  };
}

export function applyOrthogonalConstraint(point: Point2D, origin: Point2D): AxisSnapResult {
  const dx = Math.abs(point.x - origin.x);
  const dy = Math.abs(point.y - origin.y);

  if (dx >= dy) {
    return {
      point: { x: point.x, y: origin.y },
      axis: 'horizontal',
    };
  }

  return {
    point: { x: origin.x, y: point.y },
    axis: 'vertical',
  };
}

export function channelExistsBetween(
  channels: ChannelSegment[],
  startNodeId: string,
  endNodeId: string,
) {
  return channels.some(
    (channel) =>
      (channel.startNodeId === startNodeId && channel.endNodeId === endNodeId) ||
      (channel.startNodeId === endNodeId && channel.endNodeId === startNodeId),
  );
}

export function getPointToSegmentDistance(point: Point2D, start: Point2D, end: Point2D) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;

  if (lengthSquared === 0) {
    return getDistance(point, start);
  }

  const t = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared),
  );
  const projection = {
    x: start.x + t * dx,
    y: start.y + t * dy,
  };

  return getDistance(point, projection);
}
