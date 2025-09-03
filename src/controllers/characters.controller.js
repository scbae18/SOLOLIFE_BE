import * as svc from '../services/characters.service.js';

export const list = async (_req, res) => res.json(await svc.listCharacters());
export const unlock = async (req, res) => {
  res.json(await svc.unlockCharacter(req.user.user_id, +req.params.characterId));
};
export const mine = async (req, res) => res.json(await svc.listMyCharacters(req.user.user_id));
