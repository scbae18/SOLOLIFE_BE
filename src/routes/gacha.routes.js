// src/routes/gacha.routes.js
import { Router } from 'express';
import { authRequired } from '../lib/authMiddleware.js';
import { roll } from '../controllers/gacha.controller.js';

const r = Router();

/**
 * @swagger
 * tags:
 *   name: Gacha
 *   description: 가챠(포인트 소비 → 보상)
 */

/**
 * @swagger
 * /gacha/roll:
 *   post:
 *     tags: [Gacha]
 *     summary: 가챠 1회 실행
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               cost:
 *                 type: integer
 *                 example: 50
 *                 description: 기본값 50 (정수/양수만 허용, 아니면 기본값 적용)
 *     responses:
 *       200:
 *         description: 결과
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               oneOf:
 *                 - properties:
 *                     ok: { type: boolean, example: true }
 *                     spent: { type: integer, example: 50 }
 *                     type: { type: string, enum: [character] }
 *                     character_id: { type: integer, example: 7 }
 *                     points: { type: integer, example: 120 }
 *                     title: { type: string, example: "탐험가" }
 *                 - properties:
 *                     ok: { type: boolean, example: true }
 *                     spent: { type: integer, example: 50 }
 *                     type: { type: string, enum: [asset] }
 *                     asset_id: { type: integer, example: 201 }
 *                     assets:
 *                       type: array
 *                       items: { type: integer }
 *                       example: [201, 101]
 *                     points: { type: integer, example: 120 }
 *                     title: { type: string, example: "탐험가" }
 *                 - properties:
 *                     ok: { type: boolean, example: true }
 *                     spent: { type: integer, example: 50 }
 *                     type: { type: string, enum: [bonus] }
 *                     bonus: { type: integer, example: 60 }
 *                     points: { type: integer, example: 180 }
 *                     title: { type: string, example: "모험가" }
 *       400: { description: Not enough points or bad request }
 *       401: { description: Unauthorized }
 *       404: { description: User not found }
 */
r.post('/gacha/roll', authRequired, roll);

export default r;
