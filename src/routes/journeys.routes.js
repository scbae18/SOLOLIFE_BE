import { Router } from 'express';
import { authRequired } from '../lib/authMiddleware.js';
import { listMine, create, detail, update, remove } from '../controllers/journeys.controller.js';

const router = Router();

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
router.get('/', authRequired, listMine);

/**
 * @swagger
 * /journeys:
 *   post:
 *     tags: [Journeys]
 *     summary: 여정 생성 (sequence 미지정 시 전달 순서대로 1..N)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [journey_title, locations]
 *             properties:
 *               journey_title: { type: string, example: "영통 조용-감성 루트" }
 *               tags:
 *                 type: array
 *                 description: "여정 자체의 태그 목록"
 *                 items: { type: string }
 *                 example: ["조용한", "감성", "카페"]
 *               locations:
 *                 type: array
 *                 minItems: 1
 *                 example:
 *                   - { "location_id": 345, "sequence_number": 1 }
 *                   - { "location_id": 512 }  # 미지정 시 자동 2
 *                   - { "location_id": 678 }  # 미지정 시 자동 3
 *                 items:
 *                   type: object
 *                   required: [location_id]
 *                   properties:
 *                     location_id: { type: integer }
 *                     sequence_number: { type: integer, description: "미지정시 전달 순서대로 1..N" }
 *     responses:
 *       201: { description: Created }
 *       401: { description: Unauthorized }
 */
router.post('/', authRequired, create);

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
 *       200:
 *         description: OK
 *       401: { description: Unauthorized }
 *       404: { description: Not Found }
 */
router.get('/:journeyId', authRequired, detail);

/**
 * @swagger
 * /journeys/{journeyId}:
 *   patch:
 *     tags: [Journeys]
 *     summary: 여정 제목/태그/시퀀스 수정
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
 *               tags:
 *                 type: array
 *                 items: { type: string }
 *                 description: "전체 교체. [] 전달 시 모든 태그 제거, 미전달 시 태그 유지"
 *                 example: ["데이트", "야외산책"]
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
router.patch('/:journeyId', authRequired, update);

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
router.delete('/:journeyId', authRequired, remove);

export default router;
