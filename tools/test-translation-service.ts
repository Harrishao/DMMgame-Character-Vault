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
