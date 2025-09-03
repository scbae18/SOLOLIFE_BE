import { Router } from 'express';
import { list, detail, create } from '../controllers/locations.controller.js';
import { authRequired } from '../lib/authMiddleware.js';

const r = Router();

/**
 * @swagger
 * /locations:
 *   get:
 *     tags: [Locations]
 *     summary: 장소 목록
 *     parameters:
 *       - in: query
 *         name: category
 *         schema: { type: string }
 *       - in: query
 *         name: price_level
 *         schema: { type: integer }
 *       - in: query
 *         name: keyword
 *         schema: { type: string }
 *       - in: query
 *         name: centerLat
 *         schema: { type: number }
 *       - in: query
 *         name: centerLng
 *         schema: { type: number }
 *       - in: query
 *         name: delta
 *         schema: { type: number, description: '위경도 ±delta 박스 검색' }
 *       - in: query
 *         name: page
 *         schema: { type: integer }
 *       - in: query
 *         name: limit
 *         schema: { type: integer }
 *       - in: query
 *         name: order
 *         schema: { type: string, example: 'rating_avg.desc' }
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 page: { type: integer }
 *                 limit: { type: integer }
 *                 total: { type: integer }
 *                 items:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Location' }
 */
r.get('/', list);

/**
 * @swagger
 * /locations/{locationId}:
 *   get:
 *     tags: [Locations]
 *     summary: 장소 상세
 *     parameters:
 *       - in: path
 *         name: locationId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: OK }
 *       404: { description: Not Found }
 */
r.get('/:locationId', detail);

/**
 * @swagger
 * /locations:
 *   post:
 *     tags: [Locations]
 *     summary: 장소 등록(운영/수집용)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/Location' }
 *     responses:
 *       201: { description: Created }
 *       401: { description: Unauthorized }
 */
r.post('/', authRequired, create);

export default r;
