// src/controllers/recommendations.controller.js
import * as recService from '../services/recommendations.service.js';

const toArray = (v) => {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map(String).map(s => s.trim()).filter(Boolean);
  return String(v).split(',').map(s => s.trim()).filter(Boolean);
};
const safeCenter = (c) => {
  const lat = Number(c?.lat), lng = Number(c?.lng);
  return (Number.isFinite(lat) && Number.isFinite(lng)) ? { lat, lng } : undefined;
};
const rad = (v, def=3) => Number.isFinite(Number(v)) ? Number(v) : def;

function mapPrismaError(err, res) {
  if (err?.name === 'PrismaClientValidationError') {
    return res.status(400).json({ error: 'Invalid query/body: check types of category/keywords/moods/center' });
  }
  if (err?.code === 'P2010') {
    return res.status(500).json({ error: 'DB raw query failed (columns/tables mismatch)' });
  }
  return null;
}

/** category + (optional) keywords/moods + (optional) center/radius_km → 장소 3개 추천 */
export async function recommendOne(req, res, next) {
  try {
    const { category } = req.body ?? {};
    if (!category) return res.status(400).json({ error: 'category는 필수입니다.' });

    const result = await recService.recommendOne({
      category: String(category),
      keywords: toArray(req.body?.keywords),
      moods: toArray(req.body?.moods),
      center: safeCenter(req.body?.center),
      radius_km: rad(req.body?.radius_km, 3)
    });
    res.json(result);
  } catch (err) {
    if (!mapPrismaError(err, res)) next(err);
  }
}

/** 무드 기반 2개(2번째는 다른 카테고리) + (optional) center/radius_km (반경 필터) */
export async function recommendRoutesNext(req, res, next) {
  try {
    const result = await recService.recommendTwoByMoodsDistinctCategory({
      moods: toArray(req.body?.moods),
      excludeLocationIds: (req.body?.exclude_location_ids ?? []).map(Number).filter(Number.isFinite),
      excludeCategories: toArray(req.body?.exclude_categories),
      region: req.body?.region ? String(req.body.region) : undefined,
      center: safeCenter(req.body?.center),
      radius_km: rad(req.body?.radius_km, 3)
    });
    return res.status(200).json(result);
  } catch (err) {
    if (!mapPrismaError(err, res)) next(err);
  }
}

/** 카테고리만으로 교체 후보 1개 + (optional) center/radius_km (반경 필터) */
export async function suggestReplacementByCategoryOne(req, res, next) {
  try {
    const result = await recService.suggestReplacementByCategoryOne({
      category: req.body?.category ? String(req.body.category) : undefined,
      excludeLocationIds: (req.body?.exclude_location_ids ?? []).map(Number).filter(Number.isFinite),
      region: req.body?.region ? String(req.body.region) : undefined,
      center: safeCenter(req.body?.center),
      radius_km: rad(req.body?.radius_km, 3)
    });
    res.status(200).json(result);
  } catch (err) {
    if (!mapPrismaError(err, res)) next(err);
  }
}

/** (기존) 현재 루트 뒤를 이을 N개 추천 — 입력 정규화만 추가 */
export async function recommendNext(req, res, next) {
  try {
    const result = await recService.recommendNext({
      currentRoute: (req.body?.current_route ?? []).map(Number).filter(Number.isFinite),
      wantTypes: toArray(req.body?.want_types),
      count: Number(req.body?.count) || 2,
      center: safeCenter(req.body?.center),
      delta: Number.isFinite(Number(req.body?.delta)) ? Number(req.body?.delta) : undefined
    });
    res.json(result);
  } catch (err) {
    if (!mapPrismaError(err, res)) next(err);
  }
}

/** (기존) 루트 프리뷰 — 변경 없음 */
export async function previewRoute(req, res, next) {
  try {
    const result = await recService.previewRoute({
      selected: (req.body?.selected ?? []).map(Number).filter(Number.isFinite),
      append: (req.body?.append ?? []).map(Number).filter(Number.isFinite),
      startId: Number(req.body?.start_id)
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}
