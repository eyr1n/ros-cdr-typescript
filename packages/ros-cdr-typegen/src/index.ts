#!/usr/bin/env node

import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import * as v from 'valibot';
import { collectFiles, collectFilesFromGit, type File } from './collect.js';
import { generatePackage } from './generate.js';
import { parseInterfaceFile } from './parse.js';

const FsInputSchema = v.object({
  type: v.literal('fs'),
  name: v.string(),
  path: v.string(),
});

const GitInputSchema = v.object({
  type: v.literal('git'),
  name: v.string(),
  url: v.string(),
  tag: v.string(),
  path: v.string(),
});

const ConfigSchema = v.object({
  output: v.string(),
  input: v.array(v.union([FsInputSchema, GitInputSchema])),
});

async function main(): Promise<void> {
  if (process.argv.length !== 3) {
    throw new Error('Usage: ros-cdr-typegen [config.json]');
  }

  const configPath = process.argv[2];
  const json = await readFile(resolve(configPath), 'utf8');
  const config = v.parse(ConfigSchema, JSON.parse(json));

  const outputPath = resolve(config.output);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    "import * as ros from '@eyr1n/ros-cdr-serialization';\n",
    'utf8',
  );

  for (const source of config.input) {
    let files: File[] | undefined;
    switch (source.type) {
      case 'fs':
        files = await collectFiles(source.path);
        break;
      case 'git':
        files = await collectFilesFromGit(source.url, source.tag, source.path);
        break;
    }
    const definitions = files.map((file) => parseInterfaceFile(file));
    await appendFile(
      outputPath,
      `\n${[...generatePackage(source.name, definitions)].join('\n')}\n`,
      'utf8',
    );
  }
}

main();
