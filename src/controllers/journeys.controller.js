import * as svc from '../services/journeys.service.js';

export const listMine = async (req, res)=> res.json(await svc.listMine(req.user.user_id, req.query));
export const create = async (req, res)=> res.status(201).json(await svc.createJourney(req.user.user_id, req.body));
export const detail = async (req, res)=> res.json(await svc.getJourney(req.user.user_id, +req.params.journeyId));
export const update = async (req, res)=> res.json(await svc.updateJourney(req.user.user_id, +req.params.journeyId, req.body));
export const remove = async (req, res)=> res.json(await svc.removeJourney(req.user.user_id, +req.params.journeyId));
