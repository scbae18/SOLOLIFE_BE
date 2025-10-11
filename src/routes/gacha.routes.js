// src/routes/gacha.routes.js
import { Router } from 'express';
import { authRequired } from '../lib/authMiddleware.js';
import { rollCharacter, rollAsset } from '../controllers/gacha.controller.js';

const r = Router();

/**
 * @swagger
 * tags:
 *   name: Gacha
 *   description: 가챠 (포인트 차감 → 보상)
 */

/**
 * @swagger
 * /gacha/roll/character:
 *   post:
 *     tags: [Gacha]
 *     summary: 캐릭터 가챠 (100포인트 차감)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 결과
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: object
 *                   properties:
 *                     ok: { type: boolean, example: true }
 *                     type: { type: string, enum: [character] }
 *                     spent: { type: integer, example: 100 }
 *                     character_id: { type: string, example: "spring_f" }
 *                     points: { type: integer, example: 900 }
 *                     title: { type: string, example: "🌱 초보 탐험가 (Lv.1)" }
 *                 - type: object
 *                   properties:
 *                     ok: { type: boolean, example: true }
 *                     type: { type: string, enum: [bonus] }
 *                     spent: { type: integer, example: 100 }
 *                     bonus: { type: integer, example: 80 }
 *                     points: { type: integer, example: 980 }
 *                     title: { type: string, example: "🌱 초보 탐험가 (Lv.1)" }
 *                     message: { type: string }
 *       400: { description: Not enough points or bad request }
 *       401: { description: Unauthorized }
 *       404: { description: User not found }
 */
r.post('/gacha/roll/character', authRequired, rollCharacter);

/**
 * @swagger
 * /gacha/roll/asset:
 *   post:
 *     tags: [Gacha]
 *     summary: 에셋 가챠 (50포인트 차감)
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 결과
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: object
 *                   properties:
 *                     ok: { type: boolean, example: true }
 *                     type: { type: string, enum: [asset] }
 *                     spent: { type: integer, example: 50 }
 *                     asset:
 *                       type: object
 *                       properties:
 *                         asset_id: { type: integer, example: 7 }
 *                         id:       { type: string,  example: "tent" }
 *                         label:    { type: string,  example: "텐트" }
 *                         group:    { type: string,  enum: ["bg1-only","bg23"] }
 *                     assets:
 *                       type: array
 *                       items: { type: integer }
 *                     points: { type: integer, example: 950 }
 *                     title:  { type: string,  example: "🌱 초보 탐험가 (Lv.1)" }
 *                 - type: object
 *                   properties:
 *                     ok: { type: boolean, example: true }
 *                     type: { type: string, enum: [bonus] }
 *                     spent: { type: integer, example: 50 }
 *                     bonus: { type: integer, example: 60 }
 *                     points: { type: integer, example: 1010 }
 *                     title: { type: string, example: "🌱 초보 탐험가 (Lv.1)" }
 *                     message: { type: string }
 *       400: { description: Not enough points or bad request }
 *       401: { description: Unauthorized }
 *       404: { description: User not found }
 */
r.post('/gacha/roll/asset', authRequired, rollAsset);

export default r;
