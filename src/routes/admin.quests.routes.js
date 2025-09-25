// src/routes/admin.quests.routes.js
import { Router } from 'express';
import { authRequired, adminOnly } from '../lib/authMiddleware.js';
import * as quests from '../services/quests.service.js';

const r = Router();

/**
 * @swagger
 * tags:
 *   name: Admin - Quests
 *   description: 관리자 전용 퀘스트 관리 API
 */

/**
 * @swagger
 * /admin/quests:
 *   post:
 *     tags: [Admin - Quests]
 *     summary: 퀘스트 생성(관리자)
 *     description: 특정 유저에게 퀘스트를 생성합니다. 보상 포인트를 설정할 수 있습니다.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [user_id, title]
 *             properties:
 *               user_id:       { type: integer, example: 1 }
 *               title:         { type: string,  example: "튜토리얼 완료" }
 *               is_main_quest: { type: boolean, example: true }
 *               reward_points: { type: integer, example: 100, description: "퀘스트 완료 시 지급 포인트" }
 *     responses:
 *       200:
 *         description: 생성된 퀘스트
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 quest_id:      { type: integer, example: 17 }
 *                 user_id:       { type: integer, example: 1 }
 *                 title:         { type: string,  example: "튜토리얼 완료" }
 *                 is_main_quest: { type: boolean, example: true }
 *                 is_completed:  { type: boolean, example: false }
 *                 reward_points: { type: integer, example: 100 }
 *       400: { description: 잘못된 요청 본문 }
 *       401: { description: 인증 실패 }
 *       403: { description: 관리자 권한 없음 }
 */
r.post('/admin/quests', authRequired, adminOnly, async (req, res, next) => {
  try {
    const created = await quests.createQuest(req.body);
    res.json(created);
  } catch (e) {
    next(e);
  }
});

export default r;
