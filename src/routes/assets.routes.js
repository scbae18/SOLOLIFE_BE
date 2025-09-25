// src/routes/assets.routes.js
import { Router } from 'express';
import { authRequired } from '../lib/authMiddleware.js';
import { list, mine, unlock } from '../controllers/assets.controller.js';

const r = Router();

/**
 * @swagger
 * tags:
 *   name: Assets
 *   description: 에셋(배경/소품) API
 */

/**
 * @swagger
 * /assets:
 *   get:
 *     tags: [Assets]
 *     summary: 에셋 전체 목록
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Asset'
 */
r.get('/', list);

/**
 * @swagger
 * /assets/me:
 *   get:
 *     tags: [Assets]
 *     summary: 내가 보유한 에셋 목록
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: OK }
 */
r.get('/me', authRequired, mine);

/**
 * @swagger
 * /assets/{assetId}/unlock:
 *   post:
 *     tags: [Assets]
 *     summary: 에셋 해금(내 자산에 추가)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: assetId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: OK }
 *       400: { description: Invalid asset_id }
 *       401: { description: Unauthorized }
 *       404: { description: Not Found }
 */
r.post('/:assetId/unlock', authRequired, unlock);

// (선택) 장착 API를 별도로 쓴다면:
// r.post('/equip', authRequired, equip);

export default r;
