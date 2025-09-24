// src/controllers/quests.controller.js
import * as svc from '../services/quests.service.js';

export const listMine = async (req, res, next) => {
  try {
    const qMain = req.query.is_main_quest?.toLowerCase();
    const qDone = req.query.is_completed?.toLowerCase();
    const f = {
      is_main_quest:
        qMain === 'true' ? true :
        qMain === 'false' ? false : undefined,
      is_completed:
        qDone === 'true' ? true :
        qDone === 'false' ? false : undefined,
    };
    const data = await svc.listMyQuests(req.user.user_id, f);
    res.json(data);
  } catch (err) {
    next(err);
  }
};

export const complete = async (req, res, next) => {
  try {
    const userId = req.user.user_id;
    const questId = Number(req.params.questId);
    if (!Number.isInteger(questId) || questId <= 0) {
      return res.status(400).json({ error: 'Invalid questId' });
    }
    const result = await svc.completeQuest(userId, questId);
    res.json(result);
  } catch (err) {
    next(err);
  }
};
