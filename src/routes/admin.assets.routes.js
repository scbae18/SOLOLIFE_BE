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
 * components:
 *   schemas:
 *     AdminAssetCreate:
 *       type: object
 *       required: [name, type, image_url]
 *       properties:
 *         name:
 *           type: string
 *           example: "야전 텐트"
 *         type:
 *           type: string
 *           enum: [TYPE1, TYPE2, TYPE3]
 *           example: TYPE1
 *         image_url:
 *           type: string
 *           format: uri
 *           example: "https://cdn.example.com/tent.png"
 *     AdminAsset:
 *       type: object
 *       properties:
 *         asset_id:
 *           type: integer
 *           example: 201
 *         name:
 *           type: string
 *           example: "야전 텐트"
 *         type:
 *           type: string
 *           enum: [TYPE1, TYPE2, TYPE3]
 *           example: TYPE1
 *         image_url:
 *           type: string
 *           format: uri
 *           example: "https://cdn.example.com/tent.png"
 */

/**
 * @swagger
 * /admin/assets:
 *   post:
 *     tags: [Admin - Assets]
 *     summary: 에셋 생성(관리자)
 *     description: 메인 화면에서 사용할 에셋 메타(이름/타입/이미지URL) 등록.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             oneOf:
 *               - $ref: '#/components/schemas/AdminAssetCreate'
 *               - type: object               # 하위호환: url로 들어오는 경우
 *                 required: [name, type, url]
 *                 properties:
 *                   name: { type: string, example: "야전 텐트" }
 *                   type: { type: string, enum: [TYPE1, TYPE2, TYPE3], example: TYPE1 }
 *                   url:  { type: string, format: uri, example: "https://cdn.example.com/tent.png" }
 *     responses:
 *       201:
 *         description: 생성된 에셋
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AdminAsset'
 *       400: { description: 잘못된 요청 }
 *       401: { description: 인증 실패 }
 *       403: { description: 관리자 권한 없음 }
 */
r.post('/admin/assets', authRequired, adminOnly, async (req, res, next) => {
  try {
    const { name, image_url, type, url } = req.body ?? {};

    // 하위호환: url로 들어오면 image_url로 매핑
    const finalImageUrl = image_url ?? url;

    if (!name) return res.status(400).json({ error: 'name required' });
    if (!finalImageUrl) return res.status(400).json({ error: 'image_url required' });
    if (!type) return res.status(400).json({ error: 'type required (TYPE1|TYPE2|TYPE3)' });

    const allowed = new Set(['TYPE1', 'TYPE2', 'TYPE3']);
    if (!allowed.has(type)) {
      return res.status(400).json({ error: 'invalid type; allowed: TYPE1|TYPE2|TYPE3' });
    }

    const created = await prisma.asset.create({
      data: { name, image_url: finalImageUrl, type }, // ✅ 스키마 필드에 맞게 저장
      select: { asset_id: true, name: true, type: true, image_url: true },
    });

    res.status(201).json(created);
  } catch (e) {
    next(e);
  }
});

export default r;
