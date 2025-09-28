// src/routes/journeys.routes.js
import { Router } from 'express';
import {
  listMine,
  create,
  detail,
  update,
  remove,
  generatePreview,
} from '../controllers/journeys.controller.js';
import { authRequired } from '../lib/authMiddleware.js';

const r = Router();

/**
 * @swagger
 * tags:
 *   name: Journeys
 *   description: 여정 관리 (CRUD + AI 프리뷰)
 */

/**
 * @swagger
 * /journeys:
 *   get:
 *     tags: [Journeys]
 *     summary: 내 여정 목록 조회
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, example: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, example: 10 }
 *     responses:
 *       200:
 *         description: OK
 */
r.get('/', authRequired, listMine);

/**
 * @swagger
 * /journeys/preview:
 *   post:
 *     tags: [Journeys]
 *     summary: (AI) 장소 기반 여정 제목/요약 프리뷰 생성
 *     description: DB 저장 없이 AI 결과만 반환합니다.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [locations]
 *             properties:
 *               locations:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [location_id]
 *                   properties:
 *                     location_id: { type: integer, example: 345 }
 *           example:
 *             locations:
 *               - { "location_id": 345 }
 *               - { "location_id": 512 }
 *     responses:
 *       200:
 *         description: AI 프리뷰 결과
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 journey_title: { type: string, example: "영통 조용-감성 루트" }
 *                 journey_summary: { type: string, example: "로스터리 카페와 공원 산책으로 구성된 힐링 코스" }
 *       400:
 *         description: Bad Request
 */
r.post('/preview', authRequired, generatePreview);

/**
 * @swagger
 * /journeys:
 *   post:
 *     tags: [Journeys]
 *     summary: 여정 생성
 *     description: sequence 미지정 시 순서대로 1..N 자동 지정
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
 *               journey_summary: { type: string, example: "조용한 카페 2곳과 근처 공원 산책으로 구성된 코스" }
 *               tags:
 *                 type: array
 *                 items: { type: string }
 *                 example: ["조용한", "감성", "카페"]
 *               locations:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [location_id]
 *                   properties:
 *                     location_id: { type: integer, example: 345 }
 *                     sequence_number: { type: integer, example: 1 }
 *           example:
 *             journey_title: "영통 조용-감성 루트"
 *             journey_summary: "카페와 공원으로 구성된 힐링 코스"
 *             tags: ["조용한", "감성", "카페"]
 *             locations:
 *               - { "location_id": 345, "sequence_number": 1 }
 *               - { "location_id": 512 }
 *     responses:
 *       201: { description: Created }
 *       400: { description: Bad Request }
 *       401: { description: Unauthorized }
 */
r.post('/', authRequired, create);

/**
 * @swagger
 * /journeys/{journeyId}:
 *   get:
 *     tags: [Journeys]
 *     summary: 여정 상세 조회
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: journeyId
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: OK }
 *       404: { description: Not Found }
 */
r.get('/:journeyId', authRequired, detail);

/**
 * @swagger
 * /journeys/{journeyId}:
 *   patch:
 *     tags: [Journeys]
 *     summary: 여정 수정
 *     description: 제목/태그/시퀀스 수정 (locations 전달 시 전체 교체)
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
 *               journey_title: { type: string, example: "업데이트된 루트" }
 *               tags:
 *                 type: array
 *                 items: { type: string }
 *                 example: ["데이트", "야외산책"]
 *               locations:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     location_id: { type: integer, example: 678 }
 *                     sequence_number: { type: integer, example: 2 }
 *     responses:
 *       200: { description: OK }
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
 *       404: { description: Not Found }
 */
r.delete('/:journeyId', authRequired, remove);

export default r;
