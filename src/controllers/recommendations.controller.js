import * as recService from '../services/recommendations.service.js';

/**
 * 조건 맞는 장소 1개 추천
 */
export async function recommendOne(req, res, next) {
  try {
    const {
      type: category,
      features = [],
      keywords = [],
      center,
      delta,
      price_level
    } = req.body;

    const priceLevels = Array.isArray(price_level) ? price_level : [];
    const result = await recService.recommendOne({
      category,
      features,
      keywords,
      center,
      delta,
      priceLevels
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * 현재 루트 뒤를 이을 장소 추천
 */
export async function recommendNext(req, res, next) {
  try {
    const {
      current_route = [],
      want_types = [],
      features = [],
      keywords = [],
      count = 2,
      center,
      delta
    } = req.body;

    const result = await recService.recommendNext({
      currentRoute: current_route,
      wantTypes: want_types,
      features,
      keywords,
      count,
      center,
      delta
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/**
 * 루트 프리뷰 (순서/거리 계산)
 */
export async function previewRoute(req, res, next) {
  try {
    const { selected = [], append = [], start_id, center } = req.body;
    const result = await recService.previewRoute({
      selected,
      append,
      startId: start_id,
      center
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}
