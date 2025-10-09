// src/controllers/today.controller.js
import * as todayService from '../services/today.service.js';

export async function getTodayRecommendation(req, res, next) {
  try {
    // ⭐️ 요청의 쿼리 파라미터에서 lat, lng를 가져옵니다.
    const { lat, lng } = req.query;

    // ⭐️ 서비스 함수에 lat, lng를 인자로 전달합니다.
    const result = await todayService.getTodayRecommendation(lat, lng); 
    
    res.json(result);
  } catch (e) {
    next(e);
  }
}