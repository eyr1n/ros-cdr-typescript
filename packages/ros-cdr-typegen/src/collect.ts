import { exec } from 'node:child_process';
import { glob, readFile } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';
import { dir } from 'tmp-promise';

export interface File {
  type: 'msg' | 'srv';
  name: string;
  content: string;
}

function execCommand(command: string, cwd?: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    exec(command, { cwd }, (error) => {
      if (error != null) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export async function collectFiles(path: string): Promise<File[]> {
  const files: File[] = [];
  for await (const relPath of glob('**/*.msg', { cwd: path })) {
    const absPath = resolve(path, relPath);
    files.push({
      type: 'msg',
      name: basename(absPath, extname(absPath)),
      content: await readFile(absPath, 'utf8'),
    });
  }
  for await (const relPath of glob('**/*.srv', { cwd: path })) {
    const absPath = resolve(path, relPath);
    files.push({
      type: 'srv',
      name: basename(absPath, extname(absPath)),
      content: await readFile(absPath, 'utf8'),
    });
  }
  return files;
}

export async function collectFilesFromGit(
  url: string,
  tag: string,
  path: string,
): Promise<File[]> {
  const { path: tmpPath, cleanup } = await dir({ unsafeCleanup: true });
  const repoPath = resolve(tmpPath, 'repo');
  let files: File[] | undefined;
  try {
    await execCommand(`git clone ${url} ${repoPath}`);
    await execCommand(`git checkout ${tag}`, repoPath);
    files = await collectFiles(resolve(repoPath, path));
  } finally {
    await cleanup();
  }
  return files;
}
