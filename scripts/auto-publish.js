// 手动执行一次排期自动发布，便于联调或验证。
import { autoPublishService } from '../src/services/auto-publish.service.js';
import { closePool } from '../src/db/pool.js';

const result = await autoPublishService.tick();
console.log(JSON.stringify(result));
await closePool();
