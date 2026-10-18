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
