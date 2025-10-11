// src/controllers/characters.controller.js
import * as svc from '../services/characters.service.js';

export const list = async (_req, res) => {
  res.json(await svc.listCharacters());
};

export const unlock = async (req, res) => {
  // characterId는 이제 문자열 → 숫자로 캐스팅 금지
  const characterId = req.params.characterId;
  res.json(await svc.unlockCharacter(req.user.user_id, characterId));
};

export const mine = async (req, res) => {
  res.json(await svc.listMyCharacters(req.user.user_id));
};
