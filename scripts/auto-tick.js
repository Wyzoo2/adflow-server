// 手动执行一次投放数据自动更新，便于联调或验证。
import { autoDataService } from '../src/services/auto-data.service.js';
import { closePool } from '../src/db/pool.js';

const result = await autoDataService.tick();
console.log(JSON.stringify(result));
await closePool();
