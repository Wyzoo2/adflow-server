// 路由汇总：按业务前缀挂载各模块。

import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import vendorRoutes from './vendor.routes.js';
import channelRoutes from './channel.routes.js';
import projectRoutes from './project.routes.js';
import campaignRoutes from './campaign.routes.js';
import statsRoutes from './stats.routes.js';
import importRoutes from './import.routes.js';
import mockRoutes from './mock.routes.js';
import dashboardRoutes from './dashboard.routes.js';
import reportRoutes from './report.routes.js';
import systemRoutes from './system.routes.js';
import dictRoutes from './dict.routes.js';

export default async function routes(app) {
  await app.register(authRoutes, { prefix: '/auth', prefixTrailingSlash: 'no-slash' });
  await app.register(userRoutes, { prefix: '/users', prefixTrailingSlash: 'no-slash' });
  await app.register(vendorRoutes, { prefix: '/vendors', prefixTrailingSlash: 'no-slash' });
  await app.register(channelRoutes, { prefix: '/channels', prefixTrailingSlash: 'no-slash' });
  await app.register(projectRoutes, { prefix: '/projects', prefixTrailingSlash: 'no-slash' });
  await app.register(campaignRoutes, { prefix: '/campaigns', prefixTrailingSlash: 'no-slash' });
  await app.register(statsRoutes, { prefix: '/campaigns', prefixTrailingSlash: 'no-slash' });
  await app.register(mockRoutes, { prefix: '/campaigns', prefixTrailingSlash: 'no-slash' });
  await app.register(importRoutes, { prefix: '/stats', prefixTrailingSlash: 'no-slash' });
  await app.register(dashboardRoutes, { prefix: '/dashboard', prefixTrailingSlash: 'no-slash' });
  await app.register(reportRoutes, { prefix: '/reports', prefixTrailingSlash: 'no-slash' });
  await app.register(dictRoutes, { prefix: '/dicts', prefixTrailingSlash: 'no-slash' });
  await app.register(systemRoutes);
}
