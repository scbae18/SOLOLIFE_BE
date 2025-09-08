// src/controllers/recommendations.controller.js
import * as recService from '../services/recommendations.service.js';

/** category + (optional) keywords/moods + (optional) center/radius_km → 장소 3개 추천 */
export async function recommendOne(req, res, next) {
  try {
    const { category, keywords = [], moods = [], center, radius_km } = req.body;
    if (!category) return res.status(400).json({ error: 'category는 필수입니다.' });

    const result = await recService.recommendOne({
      category,
      keywords,
      moods,
      center: (center && typeof center.lat === 'number' && typeof center.lng === 'number') ? center : undefined,
      radius_km: typeof radius_km === 'number' ? radius_km : 3
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/** 무드 기반 2개(2번째는 다른 카테고리) + (optional) center/radius_km (반경 필터) */
export async function recommendRoutesNext(req, res, next) {
  try {
    const { moods, exclude_location_ids = [], exclude_categories = [], region, center, radius_km } = req.body ?? {};
    const result = await recService.recommendTwoByMoodsDistinctCategory({
      moods,
      excludeLocationIds: exclude_location_ids,
      excludeCategories: exclude_categories,
      region,
      center: (center && typeof center.lat === 'number' && typeof center.lng === 'number') ? center : undefined,
      radius_km: typeof radius_km === 'number' ? radius_km : 3
    });
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

/** 카테고리만으로 교체 후보 1개 + (optional) center/radius_km (반경 필터) */
export async function suggestReplacementByCategoryOne(req, res, next) {
  try {
    const { category, exclude_location_ids = [], region, center, radius_km } = req.body ?? {};
    const result = await recService.suggestReplacementByCategoryOne({
      category,
      excludeLocationIds: exclude_location_ids,
      region,
      center: (center && typeof center.lat === 'number' && typeof center.lng === 'number') ? center : undefined,
      radius_km: typeof radius_km === 'number' ? radius_km : 3
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

/** (기존) 현재 루트 뒤를 이을 N개 추천 — 변경 없음 */
export async function recommendNext(req, res, next) {
  try {
    const { current_route = [], want_types = [], count = 2, center, delta } = req.body;
    const result = await recService.recommendNext({
      currentRoute: current_route,
      wantTypes: want_types,
      count,
      center,
      delta
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/** (기존) 루트 프리뷰 — 변경 없음 */
export async function previewRoute(req, res, next) {
  try {
    const { selected = [], append = [], start_id } = req.body;
    const result = await recService.previewRoute({ selected, append, startId: start_id });
    res.json(result);
  } catch (err) {
    next(err);
  }
}
