# DOTABYSS 剧情翻译资源集成实施计划 (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 DOTABYSS 剧情播放器集成 `anosu/dotabyss-translation` 汉化资源，实现底部工具栏【翻译：开/关】实时切换、本地磁盘按需缓存及优雅降级。

**Architecture:** 本地 Node.js 服务提供 `/api/translation` 端点按需下载并持久化缓存上游翻译文件；播放器（DotabyssStoryPlayer）通过底部工具栏控制翻译状态并在渲染对白、说话人及历史记录时动态映射文本。

**Tech Stack:** TypeScript, Node.js (v22+), Fetch API, CSS3, esbuild.

## Global Constraints

- 翻译开关按钮文字必须为 `【翻译：开】` / `【翻译：关】`。
- 开关按钮排列顺序必须为：`【上一页】` / `【下一页】` / `【从头播放】` / `【翻译：开/关】`。
- 翻译开启时，`<user>` 和 `<player>` 必须显示为 `司令官`（日文下为 `プレイヤー`）。
- 缓存路径必须保存在 `parsed-data/dotabyss/library/translations/`。
- 上游请求失败或单句缺失时必须优雅降级为日文原文，严禁中断播放。

---

### Task 1: 翻译获取与本地磁盘持久化缓存模块 (Backend Module)

**Files:**
- Create: `games/dotabyss/src/translation.ts`
- Test: `tools/test-translation-service.ts`

**Interfaces:**
- Consumes: `fetchPublicResource` from `app/public-fetch.ts`
- Produces: `getStoryTranslations({ root, segments, fetchResource }): Promise<{ names: Record<string, string>; dialogues: Record<string, string> }>`

- [ ] **Step 1: 编写测试脚本验证翻译获取与本地缓存行为**

创建 `tools/test-translation-service.ts`：
```typescript
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { getStoryTranslations } from '../games/dotabyss/src/translation.ts';

async function run() {
  const testRoot = path.resolve(__dirname, '../parsed-data/dotabyss');
  const result = await getStoryTranslations({
    root: testRoot,
    segments: ['hmr_11000100011'],
  });

  assert(result && typeof result === 'object', '返回对象有效');
  assert(result.names && typeof result.names === 'object', '包含人名表');
  assert(result.dialogues && typeof result.dialogues === 'object', '包含对白表');

  // 验证具体汉化条目
  assert.strictEqual(result.names['ナイア'], '奈亚', '人名汉化正确');
  assert.strictEqual(
    result.dialogues['これなに？　うま？　ガブガブ。'],
    '这是什么？好吃吗？啊呜啊呜。',
    '对白汉化正确'
  );

  // 验证本地文件缓存已写入磁盘
  const namesFile = path.join(testRoot, 'library/translations/names/zh_Hans.json');
  const novelFile = path.join(testRoot, 'library/translations/novels/hmr_11000100011/zh_Hans.json');
  assert(fs.existsSync(namesFile), '人名表已持久化缓存');
  assert(fs.existsSync(novelFile), '章节表已持久化缓存');

  console.log('Task 1 backend translation test passed!');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: 运行测试并确认失败**

运行：`node --import tsx tools/test-translation-service.ts`
预期：FAIL（模块 `translation.ts` 尚未创建）

- [ ] **Step 3: 实现 `games/dotabyss/src/translation.ts`**

编写 `games/dotabyss/src/translation.ts`：
```typescript
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { writeAtomicFileSync } = require('../../../app/atomic-file.ts');
const { fetchPublicResource } = require('../../../app/public-fetch.ts');

const UPSTREAM_RAW = 'https://raw.githubusercontent.com/anosu/dotabyss-translation/main/translations';

async function fetchJsonWithCache(localFile: string, url: string, fetchFn: typeof fetchPublicResource) {
  if (fs.existsSync(localFile)) {
    try {
      return JSON.parse(fs.readFileSync(localFile, 'utf8'));
    } catch {
      // 缓存文件异常则重新拉取
    }
  }

  try {
    const res = await fetchFn(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return {};
    const text = await res.text();
    const data = JSON.parse(text);
    fs.mkdirSync(path.dirname(localFile), { recursive: true });
    writeAtomicFileSync(localFile, JSON.stringify(data, null, 2));
    return data;
  } catch {
    return {};
  }
}

async function getStoryTranslations({
  root,
  segments = [],
  fetchResource = fetchPublicResource,
}: {
  root: string;
  segments: string[];
  fetchResource?: typeof fetchPublicResource;
}) {
  const transRoot = path.join(root, 'library/translations');
  const namesFile = path.join(transRoot, 'names/zh_Hans.json');
  const namesUrl = `${UPSTREAM_RAW}/names/zh_Hans.json`;

  const namesPromise = fetchJsonWithCache(namesFile, namesUrl, fetchResource);

  const segmentPromises = segments.map(async seg => {
    const segId = path.posix.basename(seg, '.txt').replace(/^dotabyss-/, '');
    const novelFile = path.join(transRoot, 'novels', segId, 'zh_Hans.json');
    const novelUrl = `${UPSTREAM_RAW}/novels/${encodeURIComponent(segId)}/zh_Hans.json`;
    return fetchJsonWithCache(novelFile, novelUrl, fetchResource);
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
```

- [ ] **Step 4: 运行测试并确认通过**

运行：`node --import tsx tools/test-translation-service.ts`
预期：PASS（输出 `Task 1 backend translation test passed!`）

- [ ] **Step 5: 提交代码**

```bash
git add games/dotabyss/src/translation.ts tools/test-translation-service.ts
git commit -m "feat(dotabyss): add translation fetch and local cache module"
```

---

### Task 2: 后端路由端点挂载 (Service Route Mount)

**Files:**
- Modify: `games/dotabyss/src/service.ts:5-27`
- Test: `tools/test-translation-api.ts`

**Interfaces:**
- Consumes: `getStoryTranslations` from `./translation.ts`
- Produces: `GET /api/translation?segments=...` on `adapter.createService`

- [ ] **Step 1: 编写端点集成测试**

创建 `tools/test-translation-api.ts`：
```typescript
import assert from 'node:assert';
import path from 'node:path';
import { createCatalogService } from '../games/dotabyss/src/service.ts';

async function run() {
  const root = path.resolve(__dirname, '../parsed-data/dotabyss');
  const service = createCatalogService({
    root,
    origin: 'http://127.0.0.1:8787',
    fetchResource: require('../app/public-fetch.ts').fetchPublicResource,
    validId: (id: string) => /^\d+$/.test(id),
    readCatalog: () => ({ characters: [] }),
    collectionScope: (s: string) => s,
    collect: async () => {},
    statusName: 'dotabyss',
  });

  const request = new Request('http://127.0.0.1:8787/api/translation?segments=hmr_11000100011', {
    method: 'GET',
  });

  const res = await service.handle(request);
  assert(res && res.status === 200, 'API 返回 200');
  const data = await res.json();
  assert(data.names && data.dialogues, '返回格式正确');
  assert.strictEqual(data.names['ナイア'], '奈亚', '人名包含奈亚');
  console.log('Task 2 service endpoint test passed!');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: 运行测试并确认失败**

运行：`node --import tsx tools/test-translation-api.ts`
预期：FAIL（返回 404，路由未添加）

- [ ] **Step 3: 修改 `games/dotabyss/src/service.ts`**

在 `games/dotabyss/src/service.ts` 中引入 `getStoryTranslations` 并添加路由判断：
```typescript
'use strict';
const path=require('node:path');
const {acquirePackLock}=require('../../../app/projects.ts'),lock=require('../../../app/download-lock.ts');
const {readJson,writeJson}=require('./catalog.ts');
const {getStoryTranslations}=require('./translation.ts');
function createCatalogService({root,origin,fetchResource,validId,readCatalog,collectionScope,collect,statusName}){
  const file=path.join(root,'state',statusName+'-status.json');
  const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
  return {async handle(request){
    const url=new URL(request.url);if(url.origin!==origin||!url.pathname.startsWith('/api/'))return null;
    if(url.pathname==='/api/translation'&&request.method==='GET'){
      const segmentsParam = url.searchParams.get('segments') || '';
      const segments = segmentsParam.split(',').map(s => s.trim()).filter(Boolean);
      const result = await getStoryTranslations({ root, segments, fetchResource });
      return json(result);
    }
    if(url.pathname==='/api/status'&&request.method==='GET'){
      const state=readJson(file,null);if(state?.state==='running'&&!lock.busy(path.join(root,'state/pack.lock')))state.state='interrupted';return json(state);
    }
    if(url.pathname==='/api/collect'&&request.method==='POST'){
      let payload;try{payload=await request.json();}catch{return json({error:'请求格式有误。'},400);}
      if(!validId(payload?.id))return json({error:'角色编号有误。'},400);
      let scope;try{scope=collectionScope(payload.scope);if(scope==='catalog')throw new Error('此接口只下载当前角色资源。');}catch(error){return json({error:error.message},400);}
      if(!readCatalog(root).characters.some(item=>item.id===payload.id))return json({error:'角色未被索引。'},404);
      let release;try{release=acquirePackLock(root);}catch{return json({error:'资源正在处理，请等当前任务完成。'},409);}
      const initial={state:'running',roles:[payload.id],scope,targets:0,checked:0,failed:0,pid:process.pid};
      try{writeJson(file,initial);}catch(error){release();throw error;}
      Promise.resolve().then(async()=>{try{await collect(root,{roles:[payload.id],scope,retryMissing:payload.retryMissing===true,fetchResource});}
        catch(error){writeJson(file,{state:'failed',roles:[payload.id],scope,error:error.message});}finally{release();}}).catch(error=>console.error(error.message));
      return json(initial,202);
    }
    return json({error:'接口不存在。'},404);
  }};
}
export { createCatalogService };
```

- [ ] **Step 4: 运行测试并确认通过**

运行：`node --import tsx tools/test-translation-api.ts`
预期：PASS（输出 `Task 2 service endpoint test passed!`）

- [ ] **Step 5: 提交代码**

```bash
git add games/dotabyss/src/service.ts tools/test-translation-api.ts
git commit -m "feat(dotabyss): add /api/translation service endpoint"
```

---

### Task 3: 底部控制栏扩展【翻译：开/关】按钮 (StoryControls Extension)

**Files:**
- Modify: `app/viewer/story-controls.ts:1-90`
- Modify: `app/viewer/viewer.css`

**Interfaces:**
- Produces: `translate` action support in `StoryControls`, button element exposed and order preserved.

- [ ] **Step 1: 修改 `app/viewer/story-controls.ts`**

增加 `translate` 动作支持，并在 DOM 排序中确保顺序为：
`previous` -> `next` -> `restart` -> `translate`：
```typescript
interface StoryControlActions {
  previous?: () => void;
  next?: () => void;
  restart?: () => void;
  translate?: () => void;
}

interface StoryControlOptions {
  className?: string;
  position?: HTMLElement;
  onError?: (error: Error) => void;
  translateLabel?: string;
}
```
在构造函数中：
若提供了 `actions.translate`，创建 `translateButton`，文本初始为 `options.translateLabel || '翻译：开'`，类名为 `'story-translate-button secondary-button'`。
挂载顺序保持：`previous`、`next`、`restart`、`translate`，然后是 `position`、`fullscreen`、`close`。

- [ ] **Step 2: 补充 `app/viewer/viewer.css` 样式**

为 `.story-translate-button` 增加清晰易读的样式支持（激活状态 `.is-active` 等），确保在暗色和游戏主题下均有良好对比度。

- [ ] **Step 3: 验证类型与打包构建**

运行：`npm run typecheck`
预期：PASS

- [ ] **Step 4: 提交代码**

```bash
git add app/viewer/story-controls.ts app/viewer/viewer.css
git commit -m "feat(viewer): add translate toggle button support in story-controls"
```

---

### Task 4: 播放器翻译状态管理、对白渲染与多段匹配 (Story Player Integration)

**Files:**
- Modify: `games/dotabyss/viewer/story-player.ts:14-167`
- Modify: `games/dotabyss/viewer/story-ui.ts:123-151`

**Interfaces:**
- Consumes: `/api/translation` endpoint
- Implements: `translated: boolean`, `namesMap`, `dialoguesMap`, `toggleTranslation()`
- Replaces: `<user>` / `<player>` -> `司令官` when translated

- [ ] **Step 1: 修改 `games/dotabyss/viewer/story-player.ts`**

1. 增加属性：
   - `translated: boolean`（从 `localStorage.getItem('dotabyss-story-translate') !== 'false'` 初始化，默认 `true`）
   - `namesMap: Record<string, string>`
   - `dialoguesMap: Record<string, string>`
   - `translateButton: HTMLButtonElement`
2. 在 `StoryControls` 选项中传入 `translate: () => this.toggleTranslation()`，初始标签为 `this.translated ? '翻译：开' : '翻译：关'`。
3. 在 `load(story)` 中：
   - 提取分段：`const segs = story.segments?.length ? story.segments.map(s => path.posix.basename(s, '.txt')) : [story.name];`
   - 发起请求：`fetch('/games/dotabyss/api/translation?segments=' + encodeURIComponent(segs.join(',')))`
   - 将返回的数据赋给 `this.namesMap` 与 `this.dialoguesMap`。
   - 若此时已渲染第一句，立即刷新。
4. 修改 `showText(speaker, text, instant)`：
   - 计算说话人：
     ```typescript
     let resolvedSpeaker = speaker;
     if (this.translated) {
       if (speaker === '<user>' || speaker === '<player>') {
         resolvedSpeaker = '司令官';
       } else if (this.namesMap?.[speaker]) {
         resolvedSpeaker = this.namesMap[speaker];
       }
     } else {
       if (speaker === '<user>' || speaker === '<player>') {
         resolvedSpeaker = 'プレイヤー';
       }
     }
     ```
   - 计算正文：
     ```typescript
     let resolvedText = text;
     if (this.translated && this.dialoguesMap) {
       if (this.dialoguesMap[text]) {
         resolvedText = this.dialoguesMap[text];
       } else {
         const norm = String(text).replace(/<br\s*\/?>/gi, '<br>').trim();
         for (const [k, v] of Object.entries(this.dialoguesMap)) {
           if (k.replace(/<br\s*\/?>/gi, '<br>').trim() === norm) {
             resolvedText = v;
             break;
           }
         }
       }
     }
     ```
5. 添加 `toggleTranslation()` 方法：
   - 切换 `this.translated = !this.translated`
   - 保存至 `localStorage.setItem('dotabyss-story-translate', String(this.translated))`
   - 更新工具栏按钮文字为 `this.translated ? '翻译：开' : '翻译：关'`
   - 获取当前 dialogue 命令并重新调用 `showText(action.speaker, action.text, true)` 立即刷新。

- [ ] **Step 2: 修改 `games/dotabyss/viewer/story-ui.ts` 的 `openLog()`**

在 `openLog()` 中生成气泡文本时：
- 对每个 `action`：
  - 调用相同的说话人与对白文本解析逻辑（若 `player.translated` 为真，显示对应的中文翻译与 `司令官`）。

- [ ] **Step 3: 运行打包构建与类型检查**

运行：
```bash
npm run typecheck
npm run build:viewer
```
预期：PASS（成功重新构建 `app/viewer/app.js` 与 `games/dotabyss/dist/module.js`）

- [ ] **Step 4: 提交代码**

```bash
git add games/dotabyss/viewer/story-player.ts games/dotabyss/viewer/story-ui.ts
git commit -m "feat(dotabyss): implement live translation switch in story viewer"
```

---

### Task 5: 最终端到端功能验证与回归测试 (End-to-End Verification)

**Files:**
- Test: `tools/verify-e2e-translation.ts`

- [ ] **Step 1: 编写自动化端到端测试脚本**

创建 `tools/verify-e2e-translation.ts`：
- 读取真实缓存剧本 `parsed-data/dotabyss/library/stories/dotabyss-hmr_11000100012.json`。
- 模拟后端 API 响应及前端翻译映射逻辑。
- 校验：
  1. `translated = true` 时，`<user>` 映射为 `司令官`，`ナイア` 映射为 `奈亚`，文本命中中文。
  2. `translated = false` 时，`<user>` 映射为 `プレイヤー`，保留日文原文。
  3. 未命中条目安全回退原文。

- [ ] **Step 2: 运行端到端测试脚本**

运行：`node --import tsx tools/verify-e2e-translation.ts`
预期：PASS（全断言通过）

- [ ] **Step 3: 运行完整构建与检查**

运行：
```bash
npm run typecheck
npm run build:viewer
```
预期：PASS，所有产物构建完毕。

- [ ] **Step 4: 清理临时测试脚本并提交**

```bash
git add tools/
git commit -m "test(dotabyss): add comprehensive translation integration tests"
```
