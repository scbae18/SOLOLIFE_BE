// src/routes/users.routes.js
import { Router } from 'express';
import { authRequired } from '../lib/authMiddleware.js';
import { getPublic, updateMe, switchCurrent } from '../controllers/users.controller.js';

const r = Router();

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: 유저 프로필/설정
 */

/**
 * @swagger
 * /users/{userId}:
 *   get:
 *     tags: [Users]
 *     summary: 공개 프로필 조회
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       403:
 *         description: Private profile
 *       404:
 *         description: Not Found
 */
r.get('/:userId', getPublic);

/**
 * @swagger
 * /users/me:
 *   patch:
 *     tags: [Users]
 *     summary: 내 프로필/설정 업데이트
 *     description: 공개여부, 현재 캐릭터, 보유 에셋 교체 가능. (칭호/포인트는 자동 관리)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               is_public_profile: { type: boolean }
 *               current_character_id: { type: integer }
 *               assets:
 *                 type: array
 *                 items: { type: integer }
 *                 description: 최대 3개
 *     responses:
 *       200: { description: OK }
 *       401: { description: Unauthorized }
 */
r.patch('/me', authRequired, updateMe);

/**
 * @swagger
 * /users/me/current-character:
 *   patch:
 *     tags: [Users]
 *     summary: 현재 캐릭터 교체
 *     description: 보유한 캐릭터 중 하나를 현재 캐릭터로 변경.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [character_id]
 *             properties:
 *               character_id: { type: integer }
 *     responses:
 *       200: { description: OK }
 *       400: { description: Not unlocked }
 *       401: { description: Unauthorized }
 */
r.patch('/me/current-character', authRequired, switchCurrent);

export default r;
