// src/routes/today.routes.js
import { Router } from 'express';
import { authRequired } from '../lib/authMiddleware.js';
import { getTodayRecommendation } from '../controllers/today.controller.js';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Today
 *   description: 오늘의 테마 추천 API
 */

/**
 * @swagger
 * /today:
 *   get:
 *     summary: 오늘의 추천 문구 및 장소
 *     description: 
 *       실시간 시간대, 요일, 날씨 정보를 기반으로 AI가 감성적인 한 문장과 함께 추천 장소를 제공합니다.
 *       <br>요청 시 로그인 토큰이 필요합니다.
 *     tags: [Today]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: 오늘의 추천 결과 반환
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 theme_phrase:
 *                   type: string
 *                   example: "햇살이 따뜻한 오후, ${장소명}에서 여유를 즐겨보는 건 어떠세요?"
 *                   description: AI가 생성한 감성적인 추천 문구
 *                 location:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     location_id:
 *                       type: integer
 *                       example: 12
 *                     location_name:
 *                       type: string
 *                       example: "카페 블루보틀"
 *                     address:
 *                       type: string
 *                       example: "경기도 수원시 팔달구 정조로 123"
 *                     category:
 *                       type: string
 *                       example: "카페"
 *                     keywords:
 *                       type: array
 *                       items:
 *                         type: string
 *                       example: ["조용한", "디저트맛집"]
 *                     thumbnail_url:
 *                       type: string
 *                       example: "https://example.com/cafe.jpg"
 *       401:
 *         description: 인증 필요 (토큰 누락 또는 만료)
 *       500:
 *         description: 서버 오류
 */

router.get('/', authRequired, getTodayRecommendation);

export default router;
