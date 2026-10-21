import { Router } from 'express';
import { parse } from '../errors.js';
import { requireSession } from '../middleware/session.js';
import * as svc from '../services/activities.js';

export function activityRoutes({ config, pool }) {
  const router = Router();
  router.use(requireSession(config, pool));

  router.get('/', async (req, res) => {
    const { status } = parse(svc.listQuerySchema, req.query);
    res.json({ activities: await svc.listActivities(pool, config, { status }) });
  });

  router.post('/', async (req, res) => {
    const input = parse(svc.createSchema, req.body ?? {});
    res.status(201).json({ activity: await svc.createActivity(pool, config, req.user.id, input) });
  });

  router.get('/:id', async (req, res) => res.json({ activity: await svc.getActivity(pool, config, req.params.id) }));

  router.patch('/:id', async (req, res) => {
    const patch = parse(svc.updateSchema, req.body ?? {});
    res.json({ activity: await svc.updateActivity(pool, config, req.params.id, patch) });
  });

  router.post('/:id/open', async (req, res) => res.json({ activity: await svc.openActivity(pool, config, req.params.id) }));
  router.post('/:id/close', async (req, res) => res.json({ activity: await svc.closeActivity(pool, config, req.params.id) }));

  router.delete('/:id', async (req, res) => {
    await svc.deleteActivity(pool, req.params.id);
    res.status(204).end();
  });

  router.get('/:id/registrations', async (req, res) => res.json(await svc.listRegistrations(pool, config, req.params.id)));

  return router;
}
