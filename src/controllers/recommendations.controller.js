import * as recService from '../services/recommendations.service.js';

/** category + (optional) keywords/moods → 조건 매칭, 없으면 전역 랜덤 */
export async function recommendOne(req, res, next) {
  try {
    const { category, keywords = [], moods = [] } = req.body;

    // category는 있다고 가정. (없으면 방어)
    if (!category) {
      return res.status(400).json({ error: 'category는 필수입니다.' });
    }

    const result = await recService.recommendOne({ category, keywords, moods });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

/** 현재 루트 뒤를 이을 N개 추천 (기존 유지) */
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

/** 루트 프리뷰 (기존 유지) */
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
