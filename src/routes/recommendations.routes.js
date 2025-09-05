// routes/recommendations.routes.js
import express from 'express';
import * as recCtrl from '../controllers/recommendations.controller.js';

const router = express.Router();

/**
 * @swagger
 * /recommendations/locations:
 *   post:
 *     tags: [Recommendations]
 *     summary: category(+keywords/moods 옵션)으로 장소 1개 추천
 *     description: category는 필수이며, keywords만 있을 경우 keywords 모두 포함, moods만 있을 경우 moods(features_flat) 모두 포함, 둘 다 없으면 전역 랜덤으로 추천합니다. 조건 매칭 결과가 0개면 랜덤으로 대체합니다.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [category]
 *             properties:
 *               category:
 *                 type: string
 *                 example: "카페"
 *               keywords:
 *                 type: array
 *                 items: { type: string }
 *                 example: ["콘센트 많은", "사진찍기 좋은"]
 *               moods:
 *                 type: array
 *                 items: { type: string }
 *                 example: ["조용한", "아늑한"]
 *     responses:
 *       200:
 *         description: 추천된 장소 또는 랜덤 대체
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Location'
 *                 strategy:
 *                   type: string
 *                 message:
 *                   type: string
 */
router.post('/locations', recCtrl.recommendOne);

/**
 * @swagger
 * /recommendations/route/next:
 *   post:
 *     tags: [Recommendations]
 *     summary: 현재 루트 뒤를 이을 장소 추천 (N개)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               current_route:
 *                 type: array
 *                 items: { type: integer }
 *               want_types:
 *                 type: array
 *                 items: { type: string }
 *               count:
 *                 type: integer
 *                 default: 2
 *               center:
 *                 type: object
 *                 properties:
 *                   lat: { type: number }
 *                   lng: { type: number }
 *               delta:
 *                 type: number
 *                 example: 0.02
 *     responses:
 *       200:
 *         description: 다중 추천 결과
 */
router.post('/route/next', recCtrl.recommendNext);

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
