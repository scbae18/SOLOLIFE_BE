// src/controllers/logbooks.controller.js
import * as svc from '../services/logbooks.service.js';

export const list = async (req, res) =>
  res.json(await svc.listPublic(req.query));

export const listMine = async (req, res) =>
  res.json(await svc.listMine(req.user.user_id, req.query));

export const create = async (req, res) =>
  res.status(201).json(await svc.createEntry(req.user.user_id, req.body));

export const detail = async (req, res) =>
  res.json(await svc.getEntry(+req.params.logbookId));

export const update = async (req, res) =>
  res.json(await svc.updateEntry(req.user.user_id, +req.params.logbookId, req.body));

export const remove = async (req, res) =>
  res.json(await svc.deleteEntry(req.user.user_id, +req.params.logbookId));

export const like = async (req, res) =>
  res.json(await svc.toggleLike(req.user.user_id, +req.params.logbookId));

export const scrap = async (req, res) =>
  res.json(await svc.toggleScrap(req.user.user_id, +req.params.logbookId));
