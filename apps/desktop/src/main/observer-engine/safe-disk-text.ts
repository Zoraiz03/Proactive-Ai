import { constants, closeSync, fstatSync, lstatSync, openSync, readSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';
import { redactContextSecrets } from '../../shared/context-tray.ts';
import { normalizeWorkspaceRelativePath } from '../workspace-files.ts';

/** Bounded synchronous fallback for the synchronous readCurrent contract. */
export function safeDiskText(root: string, path: string, maxBytes: number): string {
  const check = () => {
    let file = root;
    for (const part of normalizeWorkspaceRelativePath(path).segments) {
      file = join(file, part); if (lstatSync(file).isSymbolicLink()) throw new Error('memory_unsafe_path');
    }
    const canonical = realpathSync(file), part = relative(root, canonical);
    if (!part || isAbsolute(part) || part === '..' || part.startsWith(`..${sep}`)) throw new Error('memory_unsafe_path');
    return canonical;
  };
  const pathOnDisk = check(), descriptor = openSync(pathOnDisk, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const before = fstatSync(descriptor);
    if (!before.isFile() || before.nlink > 1 || before.size > maxBytes) throw new Error('memory_unsafe_file');
    const bytes = Buffer.alloc(maxBytes + 1); let count = 0;
    while (count < bytes.length) { const read = readSync(descriptor, bytes, count, bytes.length - count, count); if (!read) break; count += read; }
    const after = fstatSync(descriptor), info = lstatSync(check());
    if (check() !== pathOnDisk || count > maxBytes || before.size !== after.size || before.mtimeMs !== after.mtimeMs || count !== after.size || before.ino !== info.ino || before.dev !== info.dev) throw new Error('memory_file_changed');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, count));
    if (text.includes('\0') || redactContextSecrets(text).redacted) throw new Error('memory_secret');
    return text;
  } finally { closeSync(descriptor); }
}
