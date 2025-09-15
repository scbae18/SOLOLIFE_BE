// src/routes/logbooks.routes.js
import { Router } from 'express';
import { authRequired, authOptional } from '../lib/authMiddleware.js';
import { list, create, detail, update, remove, like, scrap } from '../controllers/logbooks.controller.js';

const r = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     PlaceForReview:
 *       type: object
 *       required: [locationId, rating]
 *       properties:
 *         locationId:
 *           type: integer
 *           description: 리뷰를 생성할 장소의 location_id
 *         rating:
 *           type: integer
 *           minimum: 1
 *           maximum: 5
 *           description: 사용자가 준 별점(1~5)
 *
 *     LogbookCreateRequest:
 *       type: object
 *       required: [entry_title]
 *       properties:
 *         journey_id:
 *           type: integer
 *           nullable: true
 *         location_id:
 *           type: integer
 *           nullable: true
 *         entry_title:
 *           type: string
 *         entry_content:
 *           type: string
 *           description: 본문(있어야 자동 리뷰 생성이 동작)
 *         is_public:
 *           type: boolean
 *           default: true
 *         image_urls:
 *           type: array
 *           items:
 *             type: string
 *             format: uri
 *         places:
 *           type: array
 *           description: 자동 리뷰 생성을 위한 장소/평점 목록(옵션)
 *           items:
 *             $ref: '#/components/schemas/PlaceForReview'
 *
 *     LogbookItem:
 *       type: object
 *       properties:
 *         logbook_id: { type: integer }
 *         user_id: { type: integer }
 *         journey_id: { type: integer, nullable: true }
 *         location_id: { type: integer, nullable: true }
 *         entry_title: { type: string }
 *         entry_content: { type: string, nullable: true }
 *         is_public: { type: boolean }
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *         image_urls:
 *           type: array
 *           items: { type: string, format: uri }
 *         likes:
 *           type: array
 *           items: { type: object }
 *         scraps:
 *           type: array
 *           items: { type: object }
 *
 *     LogbookFeedResponse:
 *       type: object
 *       properties:
 *         page: { type: integer }
 *         limit: { type: integer }
 *         total: { type: integer }
 *         items:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/LogbookItem'
 *
 *     OkResponse:
 *       type: object
 *       properties:
 *         ok:
 *           type: boolean
 *           example: true
 */

/**
 * @swagger
 * tags:
 *   name: Logbooks
 *   description: 여행/일기 로그북 API
 */

/**
 * @swagger
 * /logbooks:
 *   get:
 *     tags: [Logbooks]
 *     summary: 공개 로그북 피드 조회
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
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 100, default: 20 }
 *       - in: query
 *         name: order
 *         description: created_at.asc | created_at.desc (updated_at.*도 지원 시)
 *         schema:
 *           type: string
 *           pattern: '^(created_at|updated_at)\\.(asc|desc)$'
 *           example: created_at.desc
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LogbookFeedResponse'
 */
r.get('/', authOptional, list);

/**
 * @swagger
 * /logbooks:
 *   post:
 *     tags: [Logbooks]
 *     summary: 로그북 작성
 *     description: places가 포함되고 entry_content가 있으면 백그라운드에서 리뷰가 자동 생성됩니다.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/LogbookCreateRequest'
 *           example:
 *             entry_title: "영통 카페 투어"
 *             entry_content: "낮에는 한적했고 커피가 진짜 맛있었음..."
 *             is_public: true
 *             image_urls: ["https://cdn.example.com/1.jpg"]
 *             places:
 *               - { locationId: 101, rating: 5 }
 *               - { locationId: 205, rating: 4 }
 *     responses:
 *       201:
 *         description: Created
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LogbookItem'
 *       401:
 *         description: Unauthorized
 */
r.post('/', authRequired, create);

/**
 * @swagger
 * /logbooks/{logbookId}:
 *   get:
 *     tags: [Logbooks]
 *     summary: 로그북 상세 조회
 *     parameters:
 *       - in: path
 *         name: logbookId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LogbookItem'
 *       404:
 *         description: Not Found
 */
r.get('/:logbookId', authOptional, detail);

/**
 * @swagger
 * /logbooks/{logbookId}:
 *   patch:
 *     tags: [Logbooks]
 *     summary: 로그북 수정 (작성자만 가능)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: logbookId
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               entry_title:
 *                 type: string
 *               entry_content:
 *                 type: string
 *               is_public:
 *                 type: boolean
 *               image_urls:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/LogbookItem'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not Found
 */
r.patch('/:logbookId', authRequired, update);

/**
 * @swagger
 * /logbooks/{logbookId}:
 *   delete:
 *     tags: [Logbooks]
 *     summary: 로그북 삭제 (작성자만 가능)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: logbookId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/OkResponse'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not Found
 */
r.delete('/:logbookId', authRequired, remove);

/**
 * @swagger
 * /logbooks/{logbookId}/like:
 *   post:
 *     tags: [Logbooks]
 *     summary: 로그북 좋아요 토글
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: logbookId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 liked:
 *                   type: boolean
 *       401:
 *         description: Unauthorized
 */
r.post('/:logbookId/like', authRequired, like);

/**
 * @swagger
 * /logbooks/{logbookId}/scrap:
 *   post:
 *     tags: [Logbooks]
 *     summary: 로그북 스크랩 토글
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: logbookId
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: OK
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 scrapped:
 *                   type: boolean
 *       401:
 *         description: Unauthorized
 */
r.post('/:logbookId/scrap', authRequired, scrap);

export default r;
