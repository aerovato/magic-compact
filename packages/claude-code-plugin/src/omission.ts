import { mkdir, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname } from "node:path";

type OmissionEntry = {
  content: string;
};

type OmissionCache = {
  version: 1;
  nextId: number;
  entries: Record<string, OmissionEntry>;
};

export async function loadOmissionCache(
  sessionId: string,
): Promise<OmissionCache> {
  const file = Bun.file(cachePath(sessionId));
  if (!(await file.exists())) {
    return createEmptyCache();
  }

  const value: unknown = await file.json();
  if (!isOmissionCache(value)) {
    return createEmptyCache();
  }

  return value;
}

export async function saveOmissionCache(
  sessionId: string,
  cache: OmissionCache,
): Promise<void> {
  const path = cachePath(sessionId);
  await mkdir(dirname(path), { recursive: true });
  await Bun.write(path, `${JSON.stringify(cache, null, 2)}\n`);
}

export function allocateOmission(
  cache: OmissionCache,
  sessionId: string,
  content: string,
): string {
  const contentId = `${sessionId.slice(-12)}:omitted-${cache.nextId.toString().padStart(3, "0")}`;
  cache.nextId += 1;
  cache.entries[contentId] = { content };
  return contentId;
}

export async function readOmittedContent(
  contentId: string,
): Promise<string | null> {
  const [sessionSuffix] = contentId.split(":", 1);
  if (!sessionSuffix || sessionSuffix.length !== 12) {
    return null;
  }

  const sessionId = await findSessionIdBySuffix(sessionSuffix);
  if (!sessionId) {
    return null;
  }

  const cache = await loadOmissionCache(sessionId);
  return cache.entries[contentId]?.content ?? null;
}

export function inputOmissionNotice(
  description: string,
  length: number,
  contentId: string,
): string {
  return `<tool-input-omission-notice>
${description}

Omitted Length: ${length} characters
Content ID: ${contentId}
</tool-input-omission-notice>`;
}

export function outputOmissionNotice(
  description: string,
  length: number,
  contentId: string,
): string {
  return `<tool-output-omission-notice>
${description}

Output Length: ${length} characters
Content ID: ${contentId}
</tool-output-omission-notice>`;
}

async function findSessionIdBySuffix(suffix: string): Promise<string | null> {
  const directory = cacheDirectory();

  try {
    const entries = await readdir(directory);
    for (const entry of entries) {
      if (entry === `${suffix}.json` || entry.endsWith(`${suffix}.json`)) {
        return entry.slice(0, -".json".length);
      }
    }
  } catch {
    return null;
  }

  return null;
}

function cachePath(sessionId: string): string {
  return `${cacheDirectory()}/${sessionId}.json`;
}

function cacheDirectory(): string {
  return `${homedir()}/.claude/magic-compact`;
}

function createEmptyCache(): OmissionCache {
  return {
    version: 1,
    nextId: 1,
    entries: {},
  };
}

function isOmissionCache(value: unknown): value is OmissionCache {
  return (
    typeof value === "object"
    && value !== null
    && "version" in value
    && value.version === 1
    && "nextId" in value
    && typeof value.nextId === "number"
    && "entries" in value
    && typeof value.entries === "object"
    && value.entries !== null
  );
}
