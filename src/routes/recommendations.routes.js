// src/routes/recommendations.routes.js
import express from 'express';
import * as recCtrl from '../controllers/recommendations.controller.js';

const router = express.Router();

/**
 * @swagger
 * /recommendations/locations:
 *   post:
 *     tags: [Recommendations]
 *     summary: category(+keywords/moods)로 장소 3개 후보 추천
 *     description: category는 필수. keywords만 있으면 keywords hasEvery, moods만 있으면 features_flat hasEvery. 후보가 없으면 카테고리 랜덤 3개로 대체.
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
 *     responses:
 *       200:
 *         description: 최대 3개의 추천 후보
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   maxItems: 3
 *                   items:
 *                     $ref: '#/components/schemas/Location'
 *                 strategy: { type: string }
 *                 message: { type: string }
 */
router.post('/locations', recCtrl.recommendOne);

/**
 * @swagger
 * /recommendations/routes/next:
 *   post:
 *     tags: [Recommendations]
 *     summary: moods 기반으로 2개 장소 추천 (2번째는 1번째와 다른 카테고리)
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
 *                 description: 1개 이상 무드
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
 *     responses:
 *       200:
 *         description: 최대 2개의 추천 결과(가능하면 2개)
 */
router.post('/routes/next', recCtrl.recommendRoutesNext);

/**
 * @swagger
 * /recommendations/locations/replace-one:
 *   post:
 *     tags: [Recommendations]
 *     summary: 카테고리만으로 교체 후보 1개 추천
 *     description: 입력 카테고리에서 교체 후보를 1개 추천. exclude로 이미 선택된 장소를 제외.
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
 *     responses:
 *       200:
 *         description: 교체 후보 1개
 */
router.post('/locations/replace-one', recCtrl.suggestReplacementByCategoryOne);

/**
 * @swagger
 * /recommendations/route/preview:
 *   post:
 *     tags: [Recommendations]
 *     summary: 루트 프리뷰 (순서/거리/ETA)
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
 *         description: 루트 미리보기
 */
router.post('/route/preview', recCtrl.previewRoute);

export default router;
