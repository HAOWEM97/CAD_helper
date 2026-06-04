import type { Project } from '@/domain/project/types';
import { createInitialProject } from '@/state/slices/projectSlice';

const DOWNLOAD_EXTENSIONS = ['.json', '.cadproj', '.zip'];

export function sanitizeProjectFilenameBase(input: string) {
  return input.replace(/[\\/:*?"<>|]+/g, '_').trim();
}

export function stripProjectFilenameExtension(input: string) {
  const trimmed = input.trim();
  const matchedExtension = DOWNLOAD_EXTENSIONS.find((extension) =>
    trimmed.toLowerCase().endsWith(extension),
  );

  return matchedExtension ? trimmed.slice(0, -matchedExtension.length) : trimmed;
}

export function createDefaultProjectFilenameBase(projectName: string, timestamp: string) {
  const projectFilename = sanitizeProjectFilenameBase(projectName || '未命名工程') || '未命名工程';
  return `${projectFilename}-${timestamp}`;
}

export function buildProjectDownloadFilename(input: string, extension: '.json' | '.cadproj') {
  const baseName = sanitizeProjectFilenameBase(stripProjectFilenameExtension(input));
  return baseName ? `${baseName}${extension}` : null;
}

function stableStringify(value: unknown) {
  return JSON.stringify(value);
}

export function isBlankProject(project: Project) {
  const blankProject = createInitialProject();

  return (
    project.image === null &&
    project.calibration === null &&
    stableStringify(project.calibrationDraft) === stableStringify(blankProject.calibrationDraft) &&
    project.topology.nodes.length === 0 &&
    project.topology.channels.length === 0 &&
    project.deviceInstances.length === 0 &&
    project.connectionPoints.length === 0 &&
    project.routes.length === 0 &&
    stableStringify(project.cableSpecs) === stableStringify(blankProject.cableSpecs) &&
    stableStringify(project.connectionPointPresets) ===
      stableStringify(blankProject.connectionPointPresets) &&
    stableStringify(project.deviceTypePresets) === stableStringify(blankProject.deviceTypePresets)
  );
}
