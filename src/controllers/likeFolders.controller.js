import * as svc from '../services/likeFolders.service.js';
import { ApiError } from '../lib/ApiError.js';

export const createFolder = async (req, res, next) => {
  try {
    const userId = req.user.user_id;
    const name = (req.body?.name || '').trim();
    if (!name) throw new ApiError(400, 'name required');
    res.json(await svc.createFolder({ userId, name }));
  } catch (e) { next(e); }
};

export const listFolders = async (req, res, next) => {
  try {
    const userId = req.user.user_id;
    res.json(await svc.listFolders({ userId }));
  } catch (e) { next(e); }
};

export const renameFolder = async (req, res, next) => {
  try {
    const userId = req.user.user_id;
    const folderId = Number(req.params.folderId);
    const name = (req.body?.name || '').trim();
    if (!Number.isInteger(folderId)) throw new ApiError(400, 'folderId required');
    if (!name) throw new ApiError(400, 'name required');
    res.json(await svc.renameFolder({ userId, folderId, name }));
  } catch (e) { next(e); }
};

export const removeFolder = async (req, res, next) => {
  try {
    const userId = req.user.user_id;
    const folderId = Number(req.params.folderId);
    if (!Number.isInteger(folderId)) throw new ApiError(400, 'folderId required');
    res.json(await svc.removeFolder({ userId, folderId }));
  } catch (e) { next(e); }
};

export const listFolderLocations = async (req, res, next) => {
  try {
    const userId = req.user.user_id;
    const folderId = Number(req.params.folderId);
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 20);
    if (!Number.isInteger(folderId)) throw new ApiError(400, 'folderId required');
    res.json(await svc.listFolderLocations({ userId, folderId, page, limit }));
  } catch (e) { next(e); }
};

export const addToFolder = async (req, res, next) => {
  try {
    const userId = req.user.user_id;
    const folderId = Number(req.params.folderId);
    const locationId = Number(req.params.locationId);
    if (!Number.isInteger(folderId) || !Number.isInteger(locationId)) throw new ApiError(400, 'ids required');
    res.json(await svc.addToFolder({ userId, folderId, locationId }));
  } catch (e) { next(e); }
};

export const removeFromFolder = async (req, res, next) => {
  try {
    const userId = req.user.user_id;
    const folderId = Number(req.params.folderId);
    const locationId = Number(req.params.locationId);
    if (!Number.isInteger(folderId) || !Number.isInteger(locationId)) throw new ApiError(400, 'ids required');
    res.json(await svc.removeFromFolder({ userId, folderId, locationId }));
  } catch (e) { next(e); }
};

export const toggleInFolder = async (req, res, next) => {
  try {
    const userId = req.user.user_id;
    const folderId = Number(req.params.folderId);
    const locationId = Number(req.params.locationId);
    if (!Number.isInteger(folderId) || !Number.isInteger(locationId)) throw new ApiError(400, 'ids required');
    res.json(await svc.toggleInFolder({ userId, folderId, locationId }));
  } catch (e) { next(e); }
};
