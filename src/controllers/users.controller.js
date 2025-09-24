import * as svc from '../services/users.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const getPublic = async (req, res) => {
  const data = await svc.getPublicProfile(+req.params.userId);
  res.json(data);
};
export const updateMe = asyncHandler(async (req, res) => {
  const userId = req.user?.user_id;
  const result = await svc.updateMe(userId, req.body);
  return res.json(result);
});
export const switchCurrent = async (req, res) => {
  const { character_id } = req.body;
  const data = await svc.switchCurrentCharacter(req.user.user_id, character_id);
  res.json(data);
};
