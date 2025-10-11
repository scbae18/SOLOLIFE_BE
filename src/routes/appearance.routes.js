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
 *       description: 에셋 그룹별 현재 장착 상태
 *       properties:
 *         bg1-only:
 *           type: string
 *           nullable: true
 *           example: "tent"
 *           description: "단일 장착 가능한 에셋 (예: 텐트)"
 *         bg23:
 *           type: array
 *           nullable: true
 *           items:
 *             type: string
 *           example: ["tree", "tulip"]
 *           description: 최대 2개까지 장착 가능한 에셋 그룹
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
 *                 user_id:
 *                   type: integer
 *                 current_character_id:
 *                   type: string
 *                   nullable: true
 *                   description: 현재 선택된 캐릭터 ID
 *                 current_assets:
 *                   $ref: '#/components/schemas/CurrentAssets'
 *   put:
 *     summary: 캐릭터 및 에셋 장착 변경
 *     description: character_id 또는 current_assets 일부/전체를 전달. null은 기본값 복원.
 *     tags: [Appearance]
 *     security: [ { bearerAuth: [] } ]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               character_id:
 *                 type: string
 *                 nullable: true
 *                 example: "base_f"
 *               current_assets:
 *                 $ref: '#/components/schemas/CurrentAssets'
 *                 example:
 *                   bg1-only: "bee"
 *                   bg23: ["tree", "tulip"]
 *     responses:
 *       200:
 *         description: 변경된 장착 상태
 */

r.get('/users/me/appearance', authRequired, c.getMine);
r.put('/users/me/appearance', authRequired, c.updateMine);

export default r;
