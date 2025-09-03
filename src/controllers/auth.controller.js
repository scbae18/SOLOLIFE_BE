import * as svc from '../services/auth.service.js';

export const register = async (req, res) => {
  const user = await svc.register(req.body);
  res.status(201).json(user);
};
export const login = async (req, res) => {
  const data = await svc.login(req.body);
  res.json(data);
};
export const me = async (req, res) => {
  const user = await svc.me(req.user.user_id);
  res.json(user);
};
