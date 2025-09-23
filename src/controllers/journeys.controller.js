import * as svc from '../services/journeys.service.js';

export const listMine = async (req, res) => {
  const result = await svc.listMine(req.user.user_id, req.query);
  res.json(result);
};

export const create = async (req, res) => {
  const userId = req.user?.user_id ?? req.body.user_id; // 인증 미들웨어 없을 때 대비
  const { journey_title, locations, tags } = req.body ?? {};

  const created = await svc.createJourney({
    userId,
    journeyTitle: journey_title,
    locations,
    tags, // string[] or null
  });

  res.status(201).json(created);
};

export const detail = async (req, res) => {
  const j = await svc.getJourney(req.user.user_id, +req.params.journeyId);
  res.json(j);
};

export const update = async (req, res) => {
  const result = await svc.updateJourney(
    req.user.user_id,
    +req.params.journeyId,
    req.body
  );
  res.json(result);
};

export const remove = async (req, res) => {
  const result = await svc.removeJourney(req.user.user_id, +req.params.journeyId);
  res.json(result);
};
