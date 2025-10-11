// src/routes/appearance.routes.js
import { Router } from 'express';
import { authRequired } from '../lib/authMiddleware.js';
import * as c from '../controllers/appearance.controller.js';

const r = Router();

/**
 * @swagger
 * tags:
 *   name: Appearance
 *   description: 내 프로필 외형(캐릭터/에셋) 설정 API
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     CurrentAssets:
 *       type: object
 *       properties:
 *         TYPE1: { type: integer, nullable: true }
 *         TYPE2: { type: integer, nullable: true }
 *         TYPE3: { type: integer, nullable: true }
 */

/**
 * @swagger
 * /users/me/appearance:
 *   get:
 *     summary: 내 현재 장착 상태 조회
 *     tags: [Appearance]
 *     security: [ { bearerAuth: [] } ]
 *     responses:
 *       200:
 *         description: 현재 장착 상태
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user_id: { type: integer }
 *                 current_character_id: { type: string, nullable: true }   # <- string으로 변경
 *                 current_assets:
 *                   $ref: '#/components/schemas/CurrentAssets'
 *   put:
 *     summary: 캐릭터 및 에셋 타입별 장착 변경
 *     description: character_id 또는 assets 일부/전체를 전달. null은 기본값(1,2,3) 복원.
 *     tags: [Appearance]
 *     security: [ { bearerAuth: [] } ]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               character_id: { type: string, nullable: true, example: "rookie_001" }  # <- string
 *               assets:
 *                 $ref: '#/components/schemas/CurrentAssets'
 *                 example:
 *                   TYPE1: 10
 *                   TYPE2: null
 *                   TYPE3: 15
 *     responses:
 *       200:
 *         description: 변경된 장착 상태
 */

r.get('/users/me/appearance', authRequired, c.getMine);
r.put('/users/me/appearance', authRequired, c.updateMine);

export default r;
