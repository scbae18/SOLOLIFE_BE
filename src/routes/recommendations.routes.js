// src/routes/recommendations.routes.js
import express from 'express';
import * as recCtrl from '../controllers/recommendations.controller.js';

const router = express.Router();

/**
 * @swagger
 * /recommendations/locations:
 *   post:
 *     tags: [Recommendations]
 *     summary: "category(+keywords/moods)로 장소 3개 후보 추천 (옵션: 반경 필터)"
 *     description: "category는 필수. keywords만 있으면 keywords hasEvery, moods만 있으면 features_flat hasEvery. center가 있으면 반경 radius_km(기본 3km) 내 결과만 반환. 후보가 없으면 동일 반경 내에서 카테고리 랜덤 3개로 대체 시도."
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [category]
 *             properties:
 *               category: { type: string, example: "카페" }
 *               keywords:
 *                 type: array
 *                 items: { type: string }
 *                 example: ["콘센트 많은","사진찍기 좋은"]
 *               moods:
 *                 type: array
 *                 items: { type: string }
 *                 example: ["조용한","아늑한"]
 *               center:
 *                 type: object
 *                 properties:
 *                   lat: { type: number, example: 37.2421 }
 *                   lng: { type: number, example: 127.0719 }
 *               radius_km:
 *                 type: number
 *                 description: "반경 (km). 기본 3"
 *                 example: 3
 *     responses:
 *       200:
 *         description: "최대 3개의 추천 후보"
 */
router.post('/locations', recCtrl.recommendOne);

/**
 * @swagger
 * /recommendations/routes/next:
 *   post:
 *     tags: [Recommendations]
 *     summary: "moods 기반으로 2개 장소 추천 (2번째는 1번째와 다른 카테고리, 옵션: 반경 필터)"
 *     description: "center가 있으면 반경 radius_km(기본 3km) 내에서만 추천합니다."
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [moods]
 *             properties:
 *               moods:
 *                 type: array
 *                 description: "1개 이상 무드"
 *                 items: { type: string }
 *                 example: ["조용한","아늑한"]
 *               exclude_location_ids:
 *                 type: array
 *                 items: { type: integer }
 *                 example: [101, 102]
 *               exclude_categories:
 *                 type: array
 *                 items: { type: string }
 *                 example: ["카페"]
 *               region:
 *                 type: string
 *                 example: "경기도 수원시 영통구"
 *               center:
 *                 type: object
 *                 description: "추천 시작 기준 위치 (예: 첫 추천 장소 좌표)"
 *                 properties:
 *                   lat: { type: number, example: 37.2421 }
 *                   lng: { type: number, example: 127.0719 }
 *               radius_km:
 *                 type: number
 *                 description: "반경 (km). 기본 3"
 *                 example: 3
 *     responses:
 *       200:
 *         description: "최대 2개의 추천 결과(가능하면 2개)"
 */
router.post('/routes/next', recCtrl.recommendRoutesNext);

/**
 * @swagger
 * /recommendations/locations/replace-one:
 *   post:
 *     tags: [Recommendations]
 *     summary: "카테고리만으로 교체 후보 1개 추천 (옵션: 반경 필터)"
 *     description: "입력 카테고리에서 교체 후보를 1개 추천. exclude로 이미 선택된 장소를 제외. center가 있으면 반경 radius_km(기본 3km) 내에서만 추천."
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [category]
 *             properties:
 *               category: { type: string, example: "카페" }
 *               exclude_location_ids:
 *                 type: array
 *                 items: { type: integer }
 *                 example: [123, 456]
 *               region:
 *                 type: string
 *                 example: "경기도 수원시 영통구"
 *               center:
 *                 type: object
 *                 properties:
 *                   lat: { type: number, example: 37.2421 }
 *                   lng: { type: number, example: 127.0719 }
 *               radius_km:
 *                 type: number
 *                 example: 3
 *     responses:
 *       200:
 *         description: "교체 후보 1개"
 */
router.post('/locations/replace-one', recCtrl.suggestReplacementByCategoryOne);

/**
 * @swagger
 * /recommendations/route/preview:
 *   post:
 *     tags: [Recommendations]
 *     summary: "루트 프리뷰 (순서/거리/ETA)"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               selected:
 *                 type: array
 *                 items: { type: integer }
 *               append:
 *                 type: array
 *                 items: { type: integer }
 *               start_id:
 *                 type: integer
 *     responses:
 *       200:
 *         description: "루트 미리보기"
 */
router.post('/route/preview', recCtrl.previewRoute);

export default router;
