import { Router } from 'express';
import { authRequired, authOptional } from '../lib/authMiddleware.js';
import { list, create, detail, update, remove, like, scrap } from '../controllers/logbooks.controller.js';

const r = Router();

/**
 * @swagger
 * /logbooks:
 *   get:
 *     tags: [Logbooks]
 *     summary: 공개 로그북 피드
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema: { type: integer }
 *       - in: query
 *         name: locationId
 *         schema: { type: integer }
 *       - in: query
 *         name: journeyId
 *         schema: { type: integer }
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *       - in: query
 *         name: order
 *         schema: { type: string, example: 'created_at.desc' }
 *     responses:
 *       200: { description: OK }
 */
r.get('/', authOptional, list);

/**
 * @swagger
 * /logbooks:
 *   post:
 *     tags: [Logbooks]
 *     summary: 로그북 작성
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [entry_title]
 *             properties:
 *               journey_id: { type: integer, nullable: true }
 *               location_id: { type: integer, nullable: true }
 *               entry_title: { type: string }
 *               entry_content: { type: string }
 *               is_public: { type: boolean }
 *               image_urls:
 *                 type: array
 *                 items: { type: string }
 *     responses:
 *       201: { description: Created }
 *       401: { description: Unauthorized }
 */
r.post('/', authRequired, create);

/**
 * @swagger
 * /logbooks/{logbookId}:
 *   get:
 *     tags: [Logbooks]
 *     summary: 로그북 상세
 *     parameters:
 *       - in: path
 *         name: logbookId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: OK }
 *       404: { description: Not Found }
 */
r.get('/:logbookId', authOptional, detail);

/**
 * @swagger
 * /logbooks/{logbookId}:
 *   patch:
 *     tags: [Logbooks]
 *     summary: 로그북 수정(작성자만)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: logbookId
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               entry_title: { type: string }
 *               entry_content: { type: string }
 *               is_public: { type: boolean }
 *               image_urls:
 *                 type: array
 *                 items: { type: string }
 *     responses:
 *       200: { description: OK }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       404: { description: Not Found }
 */
r.patch('/:logbookId', authRequired, update);

/**
 * @swagger
 * /logbooks/{logbookId}:
 *   delete:
 *     tags: [Logbooks]
 *     summary: 로그북 삭제(작성자만)
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: logbookId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: OK }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 *       404: { description: Not Found }
 */
r.delete('/:logbookId', authRequired, remove);

/**
 * @swagger
 * /logbooks/{logbookId}/like:
 *   post:
 *     tags: [Logbooks]
 *     summary: 좋아요 토글
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: logbookId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: OK }
 *       401: { description: Unauthorized }
 */
r.post('/:logbookId/like', authRequired, like);

/**
 * @swagger
 * /logbooks/{logbookId}/scrap:
 *   post:
 *     tags: [Logbooks]
 *     summary: 스크랩 토글
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: logbookId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: OK }
 *       401: { description: Unauthorized }
 */
r.post('/:logbookId/scrap', authRequired, scrap);

export default r;
