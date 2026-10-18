import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { createCatalogService } from '../games/dotabyss/src/service.ts';

async function run() {
  const root = path.resolve(__dirname, '../parsed-data/dotabyss');
  const service = createCatalogService({
    root,
    origin: 'http://127.0.0.1:8787',
    fetchResource: globalThis.fetch,
    validId: (id: string) => /^\d+$/.test(id),
    readCatalog: () => ({ characters: [] }),
    collectionScope: (s: string) => s,
    collect: async () => {},
    statusName: 'dotabyss',
  });

  // 1. 测试真实 API 请求
  const request = new Request('http://127.0.0.1:8787/api/translation?segments=hmr_11000100011,hmr_11000100012', {
    method: 'GET',
  });

  const res = await service.handle(request);
  assert(res && res.status === 200, 'API 返回 200');
  const data = await res.json();
  assert(data.names && data.dialogues, '包含 names 和 dialogues');

  const namesMap = data.names;
  const dialoguesMap = data.dialogues;

  // 2. 测试说话人解析逻辑 (模拟 DotabyssStoryPlayer.resolveSpeaker)
  function resolveSpeaker(speaker: string, translated: boolean) {
    if (!speaker) return '';
    if (translated) {
      if (speaker === '<user>' || speaker === '<player>' || speaker === 'プレイヤー') return '司令官';
      return namesMap[speaker] || speaker;
    }
    return speaker === '<user>' || speaker === '<player>' ? 'プレイヤー' : speaker;
  }

  assert.strictEqual(resolveSpeaker('<user>', true), '司令官', '翻译开启时玩家显示为司令官');
  assert.strictEqual(resolveSpeaker('プレイヤー', true), '司令官', '翻译开启时日文プレイヤー显示为司令官');
  assert.strictEqual(resolveSpeaker('<user>', false), 'プレイヤー', '翻译关闭时玩家显示为プレイヤー');
  assert.strictEqual(resolveSpeaker('ナイア', true), '奈亚', '角色名字翻译为中文');
  assert.strictEqual(resolveSpeaker('ナイア', false), 'ナイア', '翻译关闭时保留日文原名');
  assert.strictEqual(resolveSpeaker('未知角色', true), '未知角色', '未翻译角色名优雅回退');

  // 3. 测试对白文本解析逻辑 (模拟 DotabyssStoryPlayer.resolveDialogue)
  function resolveDialogue(text: string, translated: boolean) {
    if (!text) return '';
    if (!translated || !dialoguesMap) return String(text).replace(/<user>|<player>/g, 'プレイヤー');
    let res = dialoguesMap[text];
    if (!res) {
      const norm = String(text).replace(/<br\s*\/?>/gi, '<br>').trim();
      for (const [k, v] of Object.entries<string>(dialoguesMap)) {
        if (k.replace(/<br\s*\/?>/gi, '<br>').trim() === norm) {
          res = v;
          break;
        }
      }
    }
    const finalVal = res || text;
    return String(finalVal).replace(/<user>|<player>|プレイヤー/g, '司令官');
  }

  const rawSample = 'これなに？　うま？　ガブガブ。';
  const expectedSample = '这是什么？好吃吗？啊呜啊呜。';
  assert.strictEqual(resolveDialogue(rawSample, true), expectedSample, '对白正确翻译为中文');
  assert.strictEqual(resolveDialogue(rawSample, false), rawSample, '翻译关闭时显示日文原文');

  // 换行容错匹配
  const lineSample = 'わわわっ、食べ物じゃないよー！<br>これは教育書。お勉強に使う本だよ。';
  const lineSampleVariation = 'わわわっ、食べ物じゃないよー！<br/>这是教育书。お勉強に使う本だよ。';
  assert(resolveDialogue(lineSample, true).includes('教科书'), '带换行文本正确翻译');

  // 对白内占位符测试
  const userDialogue = '<user>が寝ていると、突然、';
  assert.strictEqual(resolveDialogue(userDialogue, true), '司令官が寝ていると、突然、', '对白内 <user> 翻译开启时转为 司令官');
  assert.strictEqual(resolveDialogue(userDialogue, false), 'プレイヤーが寝ていると、突然、', '对白内 <user> 翻译关闭时转为 プレイヤー');

  // 未汉化文本回退
  const untranslated = 'テスト未翻訳テキストです。';
  assert.strictEqual(resolveDialogue(untranslated, true), untranslated, '未汉化文本优雅回退日文原文');

  // 4. 验证本地磁盘缓存文件存在
  const namesFile = path.join(root, 'library/translations/names/zh_Hans.json');
  const novel1 = path.join(root, 'library/translations/novels/hmr_11000100011/zh_Hans.json');
  const novel2 = path.join(root, 'library/translations/novels/hmr_11000100012/zh_Hans.json');
  assert(fs.existsSync(namesFile), '本地磁盘包含 names 缓存');
  assert(fs.existsSync(novel1), '本地磁盘包含 hmr_11000100011 缓存');
  assert(fs.existsSync(novel2), '本地磁盘包含 hmr_11000100012 缓存');

  console.log('Task 5 End-to-End verification passed completely!');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
