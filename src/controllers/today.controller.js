import * as todayService from '../services/today.service.js';

export async function getTodayRecommendation(req, res, next) {
  try {
    const result = await todayService.getTodayRecommendation(); 
    res.json(result);
  } catch (e) {
    next(e);
  }
}