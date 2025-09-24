// src/routes/admin.assets.routes.js
import { Router } from 'express';
import { authRequired, adminOnly } from '../lib/authMiddleware.js';
import { prisma } from '../lib/prisma.js'; // 컨트롤러/서비스 안 쓰고 바로 생성

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
 *     description: 메인 화면 소품/배경 등 에셋 메타를 등록합니다.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [asset_id, name, type]
 *             properties:
 *               asset_id:        { type: integer, example: 201 }
 *               name:            { type: string,  example: "야전 텐트" }
 *               type:            { type: string,  example: "prop" }
 *               image_url:       { type: string,  format: uri, example: "https://cdn.example.com/tent.png" }
 *               rarity:          { type: string,  example: "R" }
 *               price_points:    { type: integer, example: 120, nullable: true }
 *               is_gacha_only:   { type: boolean, example: false }
 *               anchor:          { type: string,  example: "center-bottom" }
 *               z_index:         { type: integer, example: 10 }
 *               scale:           { type: number,  example: 1.0 }
 *               meta:            { type: object }
 *     responses:
 *       200:
 *         description: 생성된 에셋
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 asset_id:      { type: integer, example: 201 }
 *                 name:          { type: string,  example: "야전 텐트" }
 *                 type:          { type: string,  example: "prop" }
 *                 image_url:     { type: string,  format: uri, example: "https://cdn.example.com/tent.png" }
 *                 rarity:        { type: string,  example: "R" }
 *                 price_points:  { type: integer, example: 120, nullable: true }
 *                 is_gacha_only: { type: boolean, example: false }
 *                 anchor:        { type: string,  example: "center-bottom" }
 *                 z_index:       { type: integer, example: 10 }
 *                 scale:         { type: number,  example: 1.0 }
 *                 meta:          { type: object }
 *       400: { description: 잘못된 요청 }
 *       401: { description: 인증 실패 }
 *       403: { description: 관리자 권한 없음 }
 */
r.post('/admin/assets', authRequired, adminOnly, async (req, res, next) => {
  try {
    const { asset_id, name, type } = req.body ?? {};
    if (!Number.isInteger(asset_id)) return res.status(400).json({ error: 'asset_id(int) required' });
    if (!name) return res.status(400).json({ error: 'name required' });
    if (!type) return res.status(400).json({ error: 'type required' });

    const created = await prisma.asset.create({ data: req.body });
    res.json(created);
  } catch (e) { next(e); }
});

export default r;
