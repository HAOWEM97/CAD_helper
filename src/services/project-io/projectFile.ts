import type { Project } from '@/domain/project/types';
import { normalizeProject } from '@/services/draft/draftPersistence';

const PROJECT_FILE_VERSION = 1;
const PROJECT_FILE_KIND = 'cad-router-web-project';
const PACKAGE_PROJECT_ENTRY = 'project.json';
const PACKAGE_IMAGE_ENTRY = 'base-image.png';

export type ProjectFile = {
  kind: typeof PROJECT_FILE_KIND;
  version: typeof PROJECT_FILE_VERSION;
  savedAt: string;
  project: Project;
  assetNotice: {
    baseImageIncluded: boolean;
    message: string;
  };
};

export type ParsedProjectPackage = {
  project: Project;
  imageBlob: Blob | null;
};

function pickSerializableProject(project: Project): Project {
  const picked: Project = {
    id: project.id,
    name: project.name,
    image: project.image,
    calibrationDraft: project.calibrationDraft,
    calibration: project.calibration,
    topology: project.topology,
    deviceInstances: project.deviceInstances,
    connectionPoints: project.connectionPoints,
    cableSpecs: project.cableSpecs,
    connectionPointPresets: project.connectionPointPresets,
    deviceTypePresets: project.deviceTypePresets,
    routes: project.routes,
  };

  return JSON.parse(JSON.stringify(picked)) as Project;
}

export function createProjectFile(
  project: Project,
  date = new Date(),
  options: { baseImageIncluded?: boolean } = {},
): ProjectFile {
  const baseImageIncluded = Boolean(options.baseImageIncluded);

  return {
    kind: PROJECT_FILE_KIND,
    version: PROJECT_FILE_VERSION,
    savedAt: date.toISOString(),
    project: pickSerializableProject(project),
    assetNotice: {
      baseImageIncluded,
      message: baseImageIncluded
        ? '工程包包含 PNG 底图，重新载入后可直接恢复底图。'
        : project.image
          ? `工程 JSON 仅保存底图元数据：${project.image.name}（${project.image.width}x${project.image.height}）。重新载入后可能需要手动选择原 PNG。`
          : '工程 JSON 不包含 PNG 底图文件。',
    },
  };
}

export function serializeProjectFile(project: Project) {
  return JSON.stringify(createProjectFile(project), null, 2);
}

export function parseProjectFile(raw: string): Project {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('无法解析工程 JSON，请检查文件内容。');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('工程 JSON 格式无效。');
  }

  const candidate = parsed as Partial<ProjectFile> & Partial<Project>;
  const project =
    candidate.kind === PROJECT_FILE_KIND && candidate.version === PROJECT_FILE_VERSION
      ? candidate.project
      : candidate;

  if (!project || typeof project !== 'object' || !('topology' in project)) {
    throw new Error('工程 JSON 中缺少工程数据。');
  }

  return normalizeProject(project as Project);
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(bytes: Uint8Array) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function uint16(value: number) {
  return value & 0xffff;
}

function uint32(value: number) {
  return value >>> 0;
}

function writeUint16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, uint16(value), true);
}

function writeUint32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, uint32(value), true);
}

function concatBytes(parts: Uint8Array[]) {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function byteArrayBuffer(bytes: Uint8Array) {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function zipLocalHeader(nameBytes: Uint8Array, dataBytes: Uint8Array) {
  const header = new Uint8Array(30 + nameBytes.length);
  const view = new DataView(header.buffer);
  writeUint32(view, 0, 0x04034b50);
  writeUint16(view, 4, 20);
  writeUint16(view, 6, 0);
  writeUint16(view, 8, 0);
  writeUint16(view, 10, 0);
  writeUint16(view, 12, 0);
  writeUint32(view, 14, crc32(dataBytes));
  writeUint32(view, 18, dataBytes.length);
  writeUint32(view, 22, dataBytes.length);
  writeUint16(view, 26, nameBytes.length);
  writeUint16(view, 28, 0);
  header.set(nameBytes, 30);
  return header;
}

function zipCentralHeader(nameBytes: Uint8Array, dataBytes: Uint8Array, localHeaderOffset: number) {
  const header = new Uint8Array(46 + nameBytes.length);
  const view = new DataView(header.buffer);
  writeUint32(view, 0, 0x02014b50);
  writeUint16(view, 4, 20);
  writeUint16(view, 6, 20);
  writeUint16(view, 8, 0);
  writeUint16(view, 10, 0);
  writeUint16(view, 12, 0);
  writeUint16(view, 14, 0);
  writeUint32(view, 16, crc32(dataBytes));
  writeUint32(view, 20, dataBytes.length);
  writeUint32(view, 24, dataBytes.length);
  writeUint16(view, 28, nameBytes.length);
  writeUint16(view, 30, 0);
  writeUint16(view, 32, 0);
  writeUint16(view, 34, 0);
  writeUint16(view, 36, 0);
  writeUint32(view, 38, 0);
  writeUint32(view, 42, localHeaderOffset);
  header.set(nameBytes, 46);
  return header;
}

function zipEndOfCentralDirectory(entryCount: number, centralSize: number, centralOffset: number) {
  const header = new Uint8Array(22);
  const view = new DataView(header.buffer);
  writeUint32(view, 0, 0x06054b50);
  writeUint16(view, 4, 0);
  writeUint16(view, 6, 0);
  writeUint16(view, 8, entryCount);
  writeUint16(view, 10, entryCount);
  writeUint32(view, 12, centralSize);
  writeUint32(view, 16, centralOffset);
  writeUint16(view, 20, 0);
  return header;
}

export async function createProjectPackage(project: Project, imageBlob: Blob) {
  const encoder = new TextEncoder();
  const entries = [
    {
      name: PACKAGE_PROJECT_ENTRY,
      data: encoder.encode(JSON.stringify(createProjectFile(project, new Date(), { baseImageIncluded: true }), null, 2)),
    },
    {
      name: PACKAGE_IMAGE_ENTRY,
      data: new Uint8Array(await imageBlob.arrayBuffer()),
    },
  ];
  const fileParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const localHeader = zipLocalHeader(nameBytes, entry.data);
    fileParts.push(localHeader, entry.data);
    centralParts.push(zipCentralHeader(nameBytes, entry.data, offset));
    offset += localHeader.length + entry.data.length;
  }

  const centralOffset = offset;
  const centralDirectory = concatBytes(centralParts);
  const end = zipEndOfCentralDirectory(entries.length, centralDirectory.length, centralOffset);
  const packageBytes = concatBytes([...fileParts, centralDirectory, end]);

  return new Blob([packageBytes], { type: 'application/vnd.cad-router.project' });
}

function findEndOfCentralDirectory(bytes: Uint8Array) {
  for (let offset = bytes.length - 22; offset >= 0; offset -= 1) {
    if (
      bytes[offset] === 0x50 &&
      bytes[offset + 1] === 0x4b &&
      bytes[offset + 2] === 0x05 &&
      bytes[offset + 3] === 0x06
    ) {
      return offset;
    }
  }
  return -1;
}

function readStoredZipEntries(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(bytes);
  if (eocdOffset < 0) {
    throw new Error('无法读取工程包，请检查文件是否损坏。');
  }

  const entryCount = view.getUint16(eocdOffset + 10, true);
  const centralOffset = view.getUint32(eocdOffset + 16, true);
  const decoder = new TextDecoder();
  const entries = new Map<string, Uint8Array>();
  let offset = centralOffset;

  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error('工程包目录结构无效。');
    }

    const compressionMethod = view.getUint16(offset + 10, true);
    if (compressionMethod !== 0) {
      throw new Error('工程包使用了暂不支持的压缩格式。');
    }

    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength));

    if (view.getUint32(localHeaderOffset, true) !== 0x04034b50) {
      throw new Error('工程包文件结构无效。');
    }

    const localNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const dataOffset = localHeaderOffset + 30 + localNameLength + localExtraLength;
    entries.set(name, bytes.slice(dataOffset, dataOffset + compressedSize));

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

export async function parseProjectPackage(file: Blob): Promise<ParsedProjectPackage> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const entries = readStoredZipEntries(bytes);
  const projectBytes = entries.get(PACKAGE_PROJECT_ENTRY);
  if (!projectBytes) {
    throw new Error('工程包中缺少 project.json。');
  }

  const project = parseProjectFile(new TextDecoder().decode(projectBytes));
  const imageBytes = entries.get(PACKAGE_IMAGE_ENTRY);
  const imageBlob = imageBytes ? new Blob([byteArrayBuffer(imageBytes)], { type: 'image/png' }) : null;

  return {
    project,
    imageBlob,
  };
}
