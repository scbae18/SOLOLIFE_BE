// src/controllers/appearance.controller.js
import * as svc from '../services/appearance.service.js';

export async function getMine(req, res, next) {
  try {
    const data = await svc.getMyAppearance(req.user.user_id);
    res.json(data);
  } catch (e) { next(e); }
}

export async function updateMine(req, res, next) {
  try {
    const { character_id, assets } = req.body || {};
    const result = await svc.updateMyAppearance(req.user.user_id, { character_id, assets });
    res.json(result);
  } catch (e) { next(e); }
}
