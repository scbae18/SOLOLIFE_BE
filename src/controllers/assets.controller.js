// src/controllers/admin.assets.controller.js (옵션)
import { createAsset } from '../services/assets.service.js';

export async function adminCreateAsset(req, res, next) {
  try {
    const created = await createAsset(req.body);
    res.json(created);
  } catch (e) { next(e); }
}
