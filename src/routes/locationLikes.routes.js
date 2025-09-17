import { Router } from 'express';
import { authRequired } from '../lib/authMiddleware.js';
import { like, unlike, toggle, myLikes } from '../controllers/locationLikes.controller.js';

const r = Router();

/**
 * @swagger
 * tags:
 *   name: LocationLikes
 *   description: 장소 좋아요 API
 */

/**
 * @swagger
 * /locations/{locationId}/like:
 *   post:
 *     tags: [LocationLikes]
 *     summary: 장소 좋아요 추가
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: locationId
 *         schema: { type: integer }
 *         required: true
 *     responses:
 *       200: { description: 좋아요 성공 }
 */
r.post('/locations/:locationId/like', authRequired, like);

/**
 * @swagger
 * /locations/{locationId}/like:
 *   delete:
 *     tags: [LocationLikes]
 *     summary: 장소 좋아요 취소
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: locationId
 *         schema: { type: integer }
 *         required: true
 *     responses:
 *       200: { description: 좋아요 취소 성공 }
 */
r.delete('/locations/:locationId/like', authRequired, unlike);

/**
 * @swagger
 * /locations/{locationId}/like/toggle:
 *   post:
 *     tags: [LocationLikes]
 *     summary: 좋아요 토글
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: locationId
 *         schema: { type: integer }
 *         required: true
 */
r.post('/locations/:locationId/like/toggle', authRequired, toggle);

/**
 * @swagger
 * /me/locations/likes:
 *   get:
 *     tags: [LocationLikes]
 *     summary: 내가 좋아요 누른 장소 목록 조회
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 성공
 */
r.get('/me/locations/likes', authRequired, myLikes);

export default r;
