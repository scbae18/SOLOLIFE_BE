// src/routes/today.routes.js
import { Router } from 'express';
import { authRequired } from '../lib/authMiddleware.js';
import { getTodayRecommendation } from '../controllers/today.controller.js';

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Today
 *   description: "실시간 요일/시간대/날씨를 반영한 오늘의 테마 추천"
 */

/**
 * @swagger
 * /today:
 *   get:
 *     summary: "오늘의 추천 문구 및 장소"
 *     description: |
 *       실시간 **요일/시간대/날씨**(요청 좌표 기준)를 반영해 AI가 감성 한 문장(`theme_phrase`)과
 *       추천 장소 1개(`location`)를 반환합니다.
 *       - 날씨는 `lat`, `lng`를 기준으로 조회됩니다.
 *       - 장소는 DB에서 무작위로 1곳을 선택합니다.
 *     tags: [Today]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: lat
 *         required: true
 *         schema:
 *           type: number
 *           format: double
 *         description: "위도 (예: 37.2636)"
 *         example: 37.2636
 *       - in: query
 *         name: lng
 *         required: true
 *         schema:
 *           type: number
 *           format: double
 *         description: "경도 (예: 127.0286)"
 *         example: 127.0286
 *     responses:
 *       200:
 *         description: "성공적으로 오늘의 추천을 반환합니다."
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 theme_phrase:
 *                   type: string
 *                   description: "AI가 생성한 감성 카피 한 문장"
 *                   example: "구름 낀 저녁, 가까운 카페에서 따뜻한 한 잔 어떠세요?"
 *                 location:
 *                   type: object
 *                   nullable: true
 *                   description: "추천된 장소(무작위 1곳). 내부 에러 시 null."
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
 *                       nullable: true
 *                       example: "https://example.com/cafe.jpg"
 *       400:
 *         description: "잘못된 요청 (lat/lng 누락 또는 형식 오류)"
 *       401:
 *         description: "인증 필요 (토큰 누락/만료)"
 *       500:
 *         description: "서버 내부 오류"
 */

router.get('/', authRequired, getTodayRecommendation);

export default router;
