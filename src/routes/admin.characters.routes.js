// src/routes/admin.characters.routes.js
import { Router } from 'express';
import { authRequired, adminOnly } from '../lib/authMiddleware.js';
import { prisma } from '../lib/prisma.js';

const r = Router();

/**
 * @swagger
 * tags:
 *   name: Admin - Characters
 *   description: 관리자 전용 캐릭터 관리 API
 */

/**
 * @swagger
 * /admin/characters:
 *   post:
 *     tags: [Admin - Characters]
 *     summary: 캐릭터 생성(관리자)
 *     description: 신규 캐릭터 메타데이터를 등록합니다.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [character_name]
 *             properties:
 *               character_name:
 *                 type: string
 *                 example: "루키 탐험가"
 *               image_url:
 *                 type: string
 *                 format: uri
 *                 example: "https://cdn.example.com/characters/rookie.png"
 *               description:
 *                 type: string
 *                 example: "탐험을 막 시작한 초보 캐릭터"
 *     responses:
 *       200:
 *         description: 생성된 캐릭터
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 character_id:   { type: integer, example: 7 }
 *                 character_name: { type: string,  example: "루키 탐험가" }
 *                 image_url:      { type: string,  format: uri, example: "https://cdn.example.com/characters/rookie.png" }
 *                 description:    { type: string,  example: "탐험을 막 시작한 초보 캐릭터" }
 *       400: { description: 잘못된 요청 본문 }
 *       401: { description: 인증 실패 }
 *       403: { description: 관리자 권한 없음 }
 */
r.post('/admin/characters', authRequired, adminOnly, async (req, res, next) => {
  try {
    const { character_name, image_url, description } = req.body ?? {};
    if (!character_name) return res.status(400).json({ error: 'character_name required' });

    const created = await prisma.character.create({
      data: { character_name, image_url, description },
    });
    res.json(created);
  } catch (e) {
    next(e);
  }
});

export default r;
