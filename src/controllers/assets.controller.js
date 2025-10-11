// src/controllers/assets.controller.js
import * as svc from '../services/assets.service.js';

export const list = async (_req, res) => {
  const items = await svc.listAssets();
  res.json(items);
};

export const mine = async (req, res) => {
  const items = await svc.listMyAssets(req.user.user_id);
  res.json(items);
};

export const unlock = async (req, res, next) => {
  try {
    const assetId = req.params.assetId;
    const result = await svc.unlockAsset(req.user.user_id, assetId);
    res.json(result);
  } catch (e) {
    next(e);
  }
};
