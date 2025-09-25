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
    const assetId = Number(req.params.assetId);
    const result = await svc.unlockAsset(req.user.user_id, assetId);
    res.json(result);
  } catch (e) {
    next(e);
  }
};

// (선택)
// export const equip = async (req, res, next) => {
//   try {
//     const { assetIds } = req.body; // [1,2,3]
//     const result = await svc.equipAssets(req.user.user_id, assetIds || []);
//     res.json(result);
//   } catch (e) {
//     next(e);
//   }
// };
