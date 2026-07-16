import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';

// Where rendered packages live. Local FS impl for dev; swap an object-storage
// impl at deploy (same interface). `ref` is an opaque handle stored on the
// submission row.
export interface PackageStore {
  put(id: string, bytes: Uint8Array): Promise<{ ref: string }>;
  get(ref: string): Promise<Uint8Array | null>;
}

export class LocalPackageStore implements PackageStore {
  constructor(private readonly dir = 'out/packages') {}

  async put(id: string, bytes: Uint8Array): Promise<{ ref: string }> {
    await mkdir(this.dir, { recursive: true });
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const ref = path.join(this.dir, `${safeId}.pdf`);
    await writeFile(ref, bytes);
    return { ref };
  }

  async get(ref: string): Promise<Uint8Array | null> {
    try {
      return new Uint8Array(await readFile(ref));
    } catch {
      return null;
    }
  }
}
