import * as svc from '../services/users.service.js';

export const getPublic = async (req, res) => {
  const data = await svc.getPublicProfile(+req.params.userId);
  res.json(data);
};
export const updateMe = async (req, res) => {
  const data = await svc.updateMe(req.user.user_id, req.body);
  res.json(data);
};
export const switchCurrent = async (req, res) => {
  const { character_id } = req.body;
  const data = await svc.switchCurrentCharacter(req.user.user_id, character_id);
  res.json(data);
};
