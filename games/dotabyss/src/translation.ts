'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { writeAtomicFileSync } = require('../../../app/atomic-file.ts');

const UPSTREAM_RAW = 'https://raw.githubusercontent.com/anosu/dotabyss-translation/main/translations';
const UPSTREAM_CDN = 'https://cdn.jsdelivr.net/gh/anosu/dotabyss-translation@main/translations';

async function fetchJsonWithCache(localFile: string, relativePath: string, fetchFn: typeof fetch = globalThis.fetch) {
  if (fs.existsSync(localFile)) {
    try {
      return JSON.parse(fs.readFileSync(localFile, 'utf8'));
    } catch {
      // 缓存文件异常则重新拉取
    }
  }

  const urls = [
    `${UPSTREAM_RAW}/${relativePath}`,
    `${UPSTREAM_CDN}/${relativePath}`,
  ];

  for (const url of urls) {
    try {
      const res = await fetchFn(url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) continue;
      const text = await res.text();
      const data = JSON.parse(text);
      fs.mkdirSync(path.dirname(localFile), { recursive: true });
      writeAtomicFileSync(localFile, JSON.stringify(data, null, 2));
      return data;
    } catch {
      // 尝试下一个镜像源
    }
  }

  return {};
}

async function getStoryTranslations({
  root,
  segments = [],
  fetchResource = globalThis.fetch,
}: {
  root: string;
  segments: string[];
  fetchResource?: typeof fetch;
}) {
  const transRoot = path.join(root, 'library/translations');
  const namesFile = path.join(transRoot, 'names/zh_Hans.json');

  const namesPromise = fetchJsonWithCache(namesFile, 'names/zh_Hans.json', fetchResource);

  const segmentPromises = segments.map(async seg => {
    const segId = path.posix.basename(seg, '.txt').replace(/^dotabyss-/, '');
    const novelFile = path.join(transRoot, 'novels', segId, 'zh_Hans.json');
    return fetchJsonWithCache(novelFile, `novels/${encodeURIComponent(segId)}/zh_Hans.json`, fetchResource);
  });

  const [names, ...novels] = await Promise.all([namesPromise, ...segmentPromises]);

  const dialogues: Record<string, string> = {};
  for (const novel of novels) {
    if (novel && typeof novel === 'object') {
      Object.assign(dialogues, novel);
    }
  }

  return {
    names: names && typeof names === 'object' ? names : {},
    dialogues,
  };
}

export { getStoryTranslations };
