// src/controllers/gacha.controller.js
import * as gachaService from '../services/gacha.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const roll = asyncHandler(async (req, res) => {
  const userId = req.user?.user_id;

  // cost 검증 (정수/양수 아님 → 서비스에서 기본값 사용)
  const rawCost = req.body?.cost;
  const result = await gachaService.rollGacha(userId, { cost: rawCost });

  // 200 OK
  return res.json(result);
});
