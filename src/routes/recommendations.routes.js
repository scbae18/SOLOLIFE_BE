import express from 'express';
import * as recCtrl from '../controllers/recommendations.controller.js';

const router = express.Router();

/**
 * @swagger
 * /recommendations/locations:
 *   post:
 *     tags: [Recommendations]
 *     summary: category + keywords 로 장소 1개 추천
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [category, keywords]
 *             properties:
 *               category:
 *                 type: string
 *                 example: "cafe"
 *               keywords:
 *                 type: array
 *                 items: { type: string }
 *                 example: ["카공", "브런치"]
 *     responses:
 *       200:
 *         description: 추천된 장소
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
 *                   example: "simple_category_keywords_v1"
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       location_id: { type: integer }
 *                       type: { type: string }
 *                       score: { type: number }
 *                 ordering_hint:
 *                   type: array
 *                   items: { type: string }
 *                 strategy:
 *                   type: string
 *                   example: "route_next_v1"
 */
router.post('/route/next', recCtrl.recommendNext);

/**
 * @swagger
 * /recommendations/route/preview:
 *   post:
 *     tags: [Recommendations]
 *     summary: 루트 프리뷰 (순서/거리/ETA 계산)
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
 *                 description: "출발 위치 ID"
 *     responses:
 *       200:
 *         description: 루트 미리보기
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 route:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       location_id: { type: integer }
 *                       sequence_number: { type: integer }
 *                 metrics:
 *                   type: object
 *                   properties:
 *                     total_distance_km: { type: number }
 *                     eta_min: { type: integer }
 */
router.post('/route/preview', recCtrl.previewRoute);

export default router;
