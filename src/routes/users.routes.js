import { Router } from 'express';
import { authRequired } from '../lib/authMiddleware.js';
import { getPublic, updateMe, switchCurrent } from '../controllers/users.controller.js';

const r = Router();

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
 *         content: { application/json: { schema: { $ref: '#/components/schemas/User' } } }
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
 *     summary: 내 프로필 수정
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               is_public_profile: { type: boolean }
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
