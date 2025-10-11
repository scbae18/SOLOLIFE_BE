// src/controllers/gacha.controller.js
import * as gachaService from '../services/gacha.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const rollCharacter = asyncHandler(async (req, res) => {
  const userId = req.user?.user_id;
  const result = await gachaService.rollCharacterGacha(userId);
  return res.json(result);
});

export const rollAsset = asyncHandler(async (req, res) => {
  const userId = req.user?.user_id;
  const result = await gachaService.rollAssetGacha(userId);
  return res.json(result);
});
