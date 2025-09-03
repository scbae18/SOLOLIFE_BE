import { Router } from 'express';
import { authRequired } from '../lib/authMiddleware.js';
import { listMine, create, detail, update, remove } from '../controllers/journeys.controller.js';

const r = Router();

/**
 * @swagger
 * /journeys:
 *   get:
 *     tags: [Journeys]
 *     summary: 내 여정 목록
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: OK
 */
r.get('/', authRequired, listMine);

/**
 * @swagger
 * /journeys:
 *   post:
 *     tags: [Journeys]
 *     summary: 여정 생성 (locations 시퀀스 포함 가능)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [journey_title]
 *             properties:
 *               journey_title: { type: string }
 *               locations:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [location_id, sequence_number]
 *                   properties:
 *                     location_id: { type: integer }
 *                     sequence_number: { type: integer }
 *     responses:
 *       201: { description: Created }
 *       401: { description: Unauthorized }
 */
r.post('/', authRequired, create);

/**
 * @swagger
 * /journeys/{journeyId}:
 *   get:
 *     tags: [Journeys]
 *     summary: 여정 상세(시퀀스 포함)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: journeyId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: OK }
 *       401: { description: Unauthorized }
 *       404: { description: Not Found }
 */
r.get('/:journeyId', authRequired, detail);

/**
 * @swagger
 * /journeys/{journeyId}:
 *   patch:
 *     tags: [Journeys]
 *     summary: 여정 제목/시퀀스 수정
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: journeyId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               journey_title: { type: string }
 *               locations:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     location_id: { type: integer }
 *                     sequence_number: { type: integer }
 *     responses:
 *       200: { description: OK }
 *       401: { description: Unauthorized }
 *       404: { description: Not Found }
 */
r.patch('/:journeyId', authRequired, update);

/**
 * @swagger
 * /journeys/{journeyId}:
 *   delete:
 *     tags: [Journeys]
 *     summary: 여정 삭제
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: journeyId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: OK }
 *       401: { description: Unauthorized }
 *       404: { description: Not Found }
 */
r.delete('/:journeyId', authRequired, remove);

export default r;
