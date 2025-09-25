// src/routes/admin.assets.routes.js
import { Router } from 'express';
import { authRequired, adminOnly } from '../lib/authMiddleware.js';
import { prisma } from '../lib/prisma.js';

const r = Router();

/**
 * @swagger
 * tags:
 *   name: Admin - Assets
 *   description: 관리자 전용 에셋 관리
 */

/**
 * @swagger
 * /admin/assets:
 *   post:
 *     tags: [Admin - Assets]
 *     summary: 에셋 생성(관리자)
 *     description: 메인 화면에서 사용할 에셋 메타(이름/URL) 등록.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, url]
 *             properties:
 *               name: { type: string, example: "야전 텐트" }
 *               url:  { type: string, format: uri, example: "https://cdn.example.com/tent.png" }
 *     responses:
 *       200:
 *         description: 생성된 에셋
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:   { type: integer, example: 201 }
 *                 name: { type: string,  example: "야전 텐트" }
 *                 url:  { type: string,  format: uri, example: "https://cdn.example.com/tent.png" }
 *       400: { description: 잘못된 요청 }
 *       401: { description: 인증 실패 }
 *       403: { description: 관리자 권한 없음 }
 */
r.post('/admin/assets', authRequired, adminOnly, async (req, res, next) => {
  try {
    const { name, url } = req.body ?? {};
    if (!name) return res.status(400).json({ error: 'name required' });
    if (!url)  return res.status(400).json({ error: 'url required' });

    const created = await prisma.asset.create({ data: { name, url } });
    res.json(created);
  } catch (e) { next(e); }
});

export default r;
