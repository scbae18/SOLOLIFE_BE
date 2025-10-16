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
 *     description: |
 *       닉네임(User.nickname), 캐릭터 종류(base_f/base_m), 관심 주제를 `User.onboarding_answers`에 저장합니다.
 *       - **username은 변경하지 않고, nickname만 업데이트**합니다.
 *       - 온보딩 완료 시 선택 캐릭터 보유를 보장하고, 기본 에셋(tent, tree)을 지급하며 장착값은 다음과 같이 설정합니다.
 *         - `current_assets`: `{ "bg1-only": "tent", "bg23": ["tree", "tree"] }`
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
 *                 enum: ["base_f", "base_m"]
 *                 example: "base_f"
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
 *                       nullable: true
 *                       example: "기존-유저네임-변경없음"
 *                     nickname:
 *                       type: string
 *                       nullable: true
 *                       example: "승챤"
 *                     onboarding_answers:
 *                       type: object
 *                       properties:
 *                         nickname:
 *                           type: string
 *                           example: "승챤"
 *                         characterType:
 *                           type: string
 *                           example: "base_f"
 *                         interests:
 *                           type: array
 *                           items:
 *                             type: string
 *                           example: ["카페", "산책/활동"]
 *                     current_character_id:
 *                       type: string
 *                       nullable: true
 *                       example: "base_f"
 *                     assets:
 *                       type: array
 *                       items:
 *                         type: integer
 *                       example: [1, 2]
 *                     current_assets:
 *                       type: object
 *                       example:
 *                         bg1-only: "tent"
 *                         bg23: ["tree", "tree"]
 *       400:
 *         description: 잘못된 입력
 *       401:
 *         description: 인증 실패
 */
router.post('/users/onboarding', requireAuth, postOnboarding);

export default router;
