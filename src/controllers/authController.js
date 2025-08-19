import * as AuthService from "../services/authService.js";

export const register = async (req, res, next) => {
  try {
    const result = await AuthService.register(req.body);
    res.status(201).json(result);
  } catch (e) {
    next(e);
  }
};

export const login = async (req, res, next) => {
  try {
    const result = await AuthService.login(req.body);
    res.json(result);
  } catch (e) {
    next(e);
  }
};

export const me = (req, res) => {
  res.json({ user: req.user });
};
