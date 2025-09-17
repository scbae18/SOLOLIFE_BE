import { ApiError } from '../lib/ApiError.js';
import * as service from '../services/locationLikes.service.js';

export async function like(req, res, next) {
  try {
    const userId = req.user.user_id;
    const locationId = Number(req.params.locationId);
    if (!Number.isFinite(locationId)) throw new ApiError(400, 'locationId required');

    const result = await service.likeLocationById({ userId, locationId });
    res.json(result);
  } catch (e) { next(e); }
}

export async function unlike(req, res, next) {
  try {
    const userId = req.user.user_id;
    const locationId = Number(req.params.locationId);
    if (!Number.isFinite(locationId)) throw new ApiError(400, 'locationId required');

    const result = await service.unlikeLocationById({ userId, locationId });
    res.json(result);
  } catch (e) { next(e); }
}

export async function toggle(req, res, next) {
  try {
    const userId = req.user.user_id;
    const locationId = Number(req.params.locationId);
    if (!Number.isFinite(locationId)) throw new ApiError(400, 'locationId required');

    const result = await service.toggleLikeLocation({ userId, locationId });
    res.json(result);
  } catch (e) { next(e); }
}

export async function myLikes(req, res, next) {
  try {
    const userId = req.user.user_id;
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 20);

    const result = await service.listMyLikedLocations({ userId, page, limit });
    res.json(result);
  } catch (e) { next(e); }
}
