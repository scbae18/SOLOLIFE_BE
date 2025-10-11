// src/routes/assets.routes.js
import { Router } from 'express';
import { authRequired } from '../lib/authMiddleware.js';
import { list, mine, unlock } from '../controllers/assets.controller.js';

const r = Router();

/**
 * @swagger
 * tags:
 *   name: Assets
 *   description: 에셋(배경/소품) 관련 API
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     Asset:
 *       type: object
 *       properties:
 *         id: { type: string, example: "tent" }
 *         label: { type: string, example: "텐트" }
 *         group: { type: string, enum: [bg1-only, bg23], example: "bg23" }
 *
 *     CurrentAssets:
 *       type: object
 *       properties:
 *         bg1-only:
 *           type: string
 *           nullable: true
 *           example: "tent"
 *         bg23:
 *           type: array
 *           items: { type: string, example: "bee" }
 *           maxItems: 2
 *           description: 2개까지 장착 가능한 bg23 아이템 배열
 */

/**
 * @swagger
 * /assets:
 *   get:
 *     tags: [Assets]
 *     summary: 전체 에셋 목록 조회
 *     responses:
 *       200:
 *         description: 에셋 리스트 반환
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
 *     summary: 내가 보유한 에셋 목록 조회
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Asset'
 *       401: { description: Unauthorized }
 */
r.get('/me', authRequired, mine);

/**
 * @swagger
 * /assets/{assetId}/unlock:
 *   post:
 *     tags: [Assets]
 *     summary: 에셋 해금 (보유 목록에 추가)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: assetId
 *         required: true
 *         schema: { type: string }
 *         example: "tent"
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               example: { ok: true }
 *       404: { description: Asset not found }
 */
r.post('/:assetId/unlock', authRequired, unlock);

export default r;
