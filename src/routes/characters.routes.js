import { Router } from 'express';
import { authRequired } from '../lib/authMiddleware.js';
import { list, unlock, mine } from '../controllers/characters.controller.js';

const r = Router();

/**
 * @swagger
 * /characters:
 *   get:
 *     tags: [Characters]
 *     summary: 캐릭터 목록
 *     responses:
 *       200:
 *         description: OK
 *         content: { application/json: { schema: { type: array, items: { $ref: '#/components/schemas/Character' } } } }
 */
r.get('/', list);

/**
 * @swagger
 * /characters/me:
 *   get:
 *     tags: [Characters]
 *     summary: 내가 해금한 캐릭터 목록
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: OK
 */
r.get('/me', authRequired, mine);

/**
 * @swagger
 * /characters/{characterId}/unlock:
 *   post:
 *     tags: [Characters]
 *     summary: 캐릭터 해금
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: characterId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: OK }
 *       400: { description: Requires higher level or already unlocked }
 *       401: { description: Unauthorized }
 *       404: { description: Not Found }
 */
r.post('/:characterId/unlock', authRequired, unlock);

export default r;
