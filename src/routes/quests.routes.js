import { Router } from 'express';
import { authRequired } from '../lib/authMiddleware.js';
import { listMine, complete } from '../controllers/quests.controller.js';

const r = Router();

/**
 * @swagger
 * /quests:
 *   get:
 *     tags: [Quests]
 *     summary: 내 퀘스트 목록
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: is_main_quest
 *         schema: { type: boolean }
 *       - in: query
 *         name: is_completed
 *         schema: { type: boolean }
 *     responses:
 *       200:
 *         description: OK
 *         content: { application/json: { schema: { type: array, items: { $ref: '#/components/schemas/Quest' } } } }
 */
r.get('/', authRequired, listMine);

/**
 * @swagger
 * /quests/{questId}/complete:
 *   patch:
 *     tags: [Quests]
 *     summary: 퀘스트 완료(경험치 지급/레벨업 반영)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: questId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: OK }
 *       401: { description: Unauthorized }
 *       404: { description: Not Found }
 */
r.patch('/:questId/complete', authRequired, complete);

export default r;
