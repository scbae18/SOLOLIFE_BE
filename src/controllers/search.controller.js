// src/controllers/searchLite.controller.js
import { searchLocationsLite } from '../services/search.service.js';

export async function searchLite(req, res, next) {
  try {
    const data = await searchLocationsLite(req.query);
    res.json(data);
  } catch (err) {
    next(err);
  }
}
