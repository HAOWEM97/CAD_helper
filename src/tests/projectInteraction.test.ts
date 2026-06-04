import { describe, expect, it } from 'vitest';
import {
  buildProjectDownloadFilename,
  createDefaultProjectFilenameBase,
  isBlankProject,
  sanitizeProjectFilenameBase,
} from '@/services/project-io/projectInteraction';
import { createInitialProject } from '@/state/slices/projectSlice';

describe('project interaction helpers', () => {
  it('creates default project file names from the project name and timestamp', () => {
    expect(createDefaultProjectFilenameBase('A/B:工程', '20260604-120000')).toBe(
      'A_B_工程-20260604-120000',
    );
  });

  it('sanitizes common invalid filename characters', () => {
    expect(sanitizeProjectFilenameBase('  A\\B/C:D*E?F"G<H>I|J  ')).toBe(
      'A_B_C_D_E_F_G_H_I_J',
    );
  });

  it('builds download names with the selected extension only once', () => {
    expect(buildProjectDownloadFilename('项目.json', '.json')).toBe('项目.json');
    expect(buildProjectDownloadFilename('项目.cadproj', '.json')).toBe('项目.json');
    expect(buildProjectDownloadFilename('项目.json', '.cadproj')).toBe('项目.cadproj');
    expect(buildProjectDownloadFilename('  ', '.json')).toBeNull();
  });

  it('treats an untouched initial project as blank', () => {
    expect(isBlankProject(createInitialProject())).toBe(true);
  });

  it('detects image, topology and library changes as non-blank work', () => {
    const withImage = createInitialProject();
    withImage.image = { id: 'image-a', name: 'floor.png', width: 1000, height: 600 };
    expect(isBlankProject(withImage)).toBe(false);

    const withTopology = createInitialProject();
    withTopology.topology.nodes.push({ id: 'node-a', position: { x: 0, y: 0 } });
    expect(isBlankProject(withTopology)).toBe(false);

    const withLibraryChange = createInitialProject();
    withLibraryChange.cableSpecs.push({
      id: 'custom-cable',
      model: 'CUSTOM',
      diameterText: '10',
      diameterMm: 10,
    });
    expect(isBlankProject(withLibraryChange)).toBe(false);
  });
});
