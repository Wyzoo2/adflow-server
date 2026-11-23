// 项目业务。

import { projectRepo } from '../repositories/project.repo.js';
import { auditRepo } from '../repositories/audit.repo.js';
import { errors } from '../utils/errors.js';

export const projectService = {
  list: () => projectRepo.list(),

  async detail(id) {
    const project = await projectRepo.findById(id);
    if (!project) throw errors.notFound('项目不存在');
    return project;
  },

  async create(payload, operator, ip) {
    if (!payload.name) throw errors.badRequest('项目名称不能为空');
    const id = await projectRepo.create(payload);
    await auditRepo.insert({
      objectType: 'project',
      objectId: id,
      action: 'create',
      after: payload,
      operatorId: operator.id,
      ip,
    });
    return projectRepo.findById(id);
  },

  async update(id, payload, operator, ip) {
    const before = await projectRepo.findById(id);
    if (!before) throw errors.notFound('项目不存在');
    await projectRepo.update(id, payload);
    await auditRepo.insert({
      objectType: 'project',
      objectId: id,
      action: 'update',
      before,
      after: payload,
      operatorId: operator.id,
      ip,
    });
    return projectRepo.findById(id);
  },
};
