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
 *     description: 신규 캐릭터를 등록합니다. (PK는 문자열 id)
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [id, theme, gender]
 *             properties:
 *               id:
 *                 type: string
 *                 example: "rookie_001"
 *               theme:
 *                 type: string
 *                 example: "forest"
 *               gender:
 *                 type: string
 *                 example: "male"
 *     responses:
 *       200:
 *         description: 생성된 캐릭터
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:     { type: string, example: "rookie_001" }
 *                 theme:  { type: string, example: "forest" }
 *                 gender: { type: string, example: "male" }
 *       400: { description: 잘못된 요청 본문 }
 *       401: { description: 인증 실패 }
 *       403: { description: 관리자 권한 없음 }
 */
r.post('/admin/characters', authRequired, adminOnly, async (req, res, next) => {
  try {
    const { id, theme, gender } = req.body ?? {};
    if (!id || typeof id !== 'string' || !id.trim()) {
      return res.status(400).json({ error: 'id (string) is required' });
    }
    if (!theme) return res.status(400).json({ error: 'theme required' });
    if (!gender) return res.status(400).json({ error: 'gender required' });

    const created = await prisma.character.create({
      data: { id, theme, gender },
    });
    res.json(created);
  } catch (e) {
    // 중복 키 등
    if (e.code === 'P2002') {
      return res.status(400).json({ error: 'Duplicate character id' });
    }
    next(e);
  }
});

export default r;
