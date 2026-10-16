/** Types for store/tools/preview.mjs (BUG-49), so the TypeScript tests can import it. */
import type { ChildProcess } from 'node:child_process';

export type PreviewErrorCode = 'NO_DIST' | 'BAD_PORT' | 'PORT_BUSY' | 'CHILD_EXITED' | 'TIMEOUT' | 'INDEX_MISMATCH';

export class PreviewError extends Error {
  constructor(code: PreviewErrorCode, message: string);
  readonly code: PreviewErrorCode;
}

export function resolveDist(o: { root: string; distArg?: string; envDist?: string }): string;

export function portListeners(port: number): Promise<string[]>;

export function httpGet(url: string, timeoutMs?: number): Promise<{ status: number; body: Buffer }>;

export interface Preview {
  child: ChildProcess;
  /** `http://localhost:<port>/` */
  url: string;
  /** SIGTERM, SIGKILL after 3 s; resolves once the child has exited. */
  stop: () => Promise<void>;
  /** SIGKILL now (for a `process.on('exit')` handler). */
  killSync: () => void;
  /** Everything the child printed so far. */
  output: () => string;
}

export function startPreview(o: { root: string; dist: string; port: number; timeoutMs?: number; viteBin?: string }): Promise<Preview>;
