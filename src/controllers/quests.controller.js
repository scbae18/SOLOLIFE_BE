import * as svc from '../services/quests.service.js';

export const listMine = async (req, res) => {
  const f = {
    is_main_quest: req.query.is_main_quest?.toLowerCase() === 'true' ? true :
                   req.query.is_main_quest?.toLowerCase() === 'false' ? false : undefined,
    is_completed: req.query.is_completed?.toLowerCase() === 'true' ? true :
                  req.query.is_completed?.toLowerCase() === 'false' ? false : undefined,
  };
  res.json(await svc.listMyQuests(req.user.user_id, f));
};

export const complete = async (req, res) => {
  res.json(await svc.completeQuest(req.user.user_id, +req.params.questId));
};
