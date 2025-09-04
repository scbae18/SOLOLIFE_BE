import * as recService from '../services/recommendations.service.js';

/** category + keyword 로 1개 추천 */
export async function recommendOne(req, res, next) {
  try {
    const { category, keyword } = req.body; // 입력은 이 두 개만
    const result = await recService.recommendOne({ category, keyword });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/** 현재 루트 뒤를 이을 N개 추천 */
export async function recommendNext(req, res, next) {
  try {
    const {
      current_route = [],
      want_types = [],
      count = 2,
      center,
      delta
    } = req.body;

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

/** 루트 프리뷰(순서/거리/ETA) */
export async function previewRoute(req, res, next) {
  try {
    const { selected = [], append = [], start_id } = req.body;
    const result = await recService.previewRoute({
      selected,
      append,
      startId: start_id
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}
