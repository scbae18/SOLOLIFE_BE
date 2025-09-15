// src/routes/reviews.routes.js
import { Router } from 'express';
import { authRequired, authOptional } from '../lib/authMiddleware.js';
import { list, detail, create, update, remove } from '../controllers/reviews.controller.js';

const r = Router();

/**
 * @swagger
 * tags:
 *   name: Reviews
 *   description: 장소/로그북 기반 요약 리뷰 API
 */

/**
 * @swagger
 * /reviews:
 *   get:
 *     tags: [Reviews]
 *     summary: 리뷰 목록 조회
 *     description: locationId, logbookId, userId로 필터 가능. 페이지네이션 및 정렬 지원.
 *     parameters:
 *       - in: query
 *         name: locationId
 *         schema:
 *           type: integer
 *       - in: query
 *         name: logbookId
 *         schema:
 *           type: integer
 *       - in: query
 *         name: userId
 *         schema:
 *           type: integer
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: order
 *         schema:
 *           type: string
 *           example: created_at.desc
 *     responses:
 *       200:
 *         description: OK
 */
r.get('/', authOptional, list);

/**
 * @swagger
 * /reviews:
 *   post:
 *     tags: [Reviews]
 *     summary: 리뷰 수동 작성 (옵션)
 *     description: 자동 생성은 logbooks 작성 시 백그라운드로 처리됩니다. 필요 시 수동 생성용으로 사용하세요.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [location_id, logbook_id, rating]
 *             properties:
 *               location_id:
 *                 type: integer
 *               logbook_id:
 *                 type: integer
 *               rating:
 *                 type: integer
 *                 description: 1~5 정수(권장). 서버단에서 정수 여부만 검증.
 *               content:
 *                 oneOf:
 *                   - type: string
 *                   - type: array
 *                     items:
 *                       type: string
 *     responses:
 *       201:
 *         description: Created
 *       400:
 *         description: Bad Request
 *       401:
 *         description: Unauthorized
 *       409:
 *         description: Conflict (same logbook & location already exists)
 */
r.post('/', authRequired, create);

/**
 * @swagger
 * /reviews/{reviewId}:
 *   get:
 *     tags: [Reviews]
 *     summary: 리뷰 상세 조회
 *     parameters:
 *       - in: path
 *         name: reviewId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: OK
 *       404:
 *         description: Not Found
 */
r.get('/:reviewId', authOptional, detail);

/**
 * @swagger
 * /reviews/{reviewId}:
 *   patch:
 *     tags: [Reviews]
 *     summary: 리뷰 수정 (작성자만)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reviewId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               rating:
 *                 type: integer
 *               content:
 *                 oneOf:
 *                   - type: string
 *                   - type: array
 *                     items:
 *                       type: string
 *     responses:
 *       200:
 *         description: OK
 *       400:
 *         description: Bad Request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not Found
 */
r.patch('/:reviewId', authRequired, update);

/**
 * @swagger
 * /reviews/{reviewId}:
 *   delete:
 *     tags: [Reviews]
 *     summary: 리뷰 삭제 (작성자만)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reviewId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: OK
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not Found
 */
r.delete('/:reviewId', authRequired, remove);

export default r;
