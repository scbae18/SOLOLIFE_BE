// src/routes/onboarding.routes.js
import { Router } from 'express';
import { requireAuth } from '../lib/requireAuth.js'; 
import { postOnboarding } from '../controllers/onboarding.controller.js';

const router = Router();

/**
 * @swagger
 * tags:
 *   - name: Onboarding
 *     description: 사용자 온보딩 관련 API
 */

/**
 * @swagger
 * /users/onboarding:
 *   post:
 *     summary: 온보딩 답변 저장
 *     description: 닉네임, 캐릭터 종류(A/B), 관심 주제를 User.onboarding_answers에 그대로 저장합니다. 닉네임이 있으면 username도 함께 업데이트됩니다.
 *     tags: [Onboarding]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - characterType
 *               - interests
 *             properties:
 *               nickname:
 *                 type: string
 *                 example: "승챤"
 *               characterType:
 *                 type: string
 *                 enum: [A, B]
 *                 example: "A"
 *               interests:
 *                 type: array
 *                 minItems: 1
 *                 items:
 *                   type: string
 *                   enum: ["카페", "영화", "책/자기개발", "사진", "맛집 탐방", "산책/활동"]
 *                 example: ["카페", "산책/활동"]
 *     responses:
 *       200:
 *         description: 저장 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *                 user:
 *                   type: object
 *                   properties:
 *                     user_id:
 *                       type: integer
 *                       example: 3
 *                     username:
 *                       type: string
 *                       example: "승챤"
 *                     onboarding_answers:
 *                       type: object
 *                       properties:
 *                         nickname:
 *                           type: string
 *                           example: "승챤"
 *                         characterType:
 *                           type: string
 *                           example: "A"
 *                         interests:
 *                           type: array
 *                           items:
 *                             type: string
 *                           example: ["카페", "산책/활동"]
 *                     current_character_id:
 *                       type: integer
 *                       nullable: true
 *                       example: null
 *       400:
 *         description: 잘못된 입력
 *       401:
 *         description: 인증 실패
 */
router.post('/users/onboarding', requireAuth, postOnboarding);

export default router;
