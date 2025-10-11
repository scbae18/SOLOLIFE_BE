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
 *       required: [id, group, label]
 *       properties:
 *         id:
 *           type: string
 *           example: "tent"
 *           description: 에셋의 고유 문자열 ID
 *         group:
 *           type: string
 *           enum: [bg1-only, bg23]
 *           example: "bg23"
 *           description: "에셋 그룹 (bg1-only: 단일, bg23: 최대 2개)"
 *         label:
 *           type: string
 *           example: "텐트"
 *           description: 에셋 이름
 *
 *     AdminAsset:
 *       type: object
 *       properties:
 *         asset_id: { type: integer, example: 1 }
 *         id: { type: string, example: "tent" }
 *         label: { type: string, example: "텐트" }
 *         group: { type: string, enum: [bg1-only, bg23], example: "bg1-only" }
 */

/**
 * @swagger
 * /admin/assets:
 *   post:
 *     tags: [Admin - Assets]
 *     summary: 에셋 생성 (관리자)
 *     description: 에셋의 ID, 그룹, 이름을 등록합니다.
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AdminAssetCreate'
 *     responses:
 *       201:
 *         description: 생성된 에셋 정보
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AdminAsset'
 *       400: { description: Invalid request body }
 *       401: { description: Unauthorized }
 *       403: { description: Forbidden }
 */
r.post('/admin/assets', authRequired, adminOnly, async (req, res, next) => {
  try {
    const { id, group, label } = req.body ?? {};

    if (!id) return res.status(400).json({ error: 'id required' });
    if (!group) return res.status(400).json({ error: 'group required (bg1-only|bg23)' });
    if (!label) return res.status(400).json({ error: 'label required' });

    const allowed = new Set(['bg1-only', 'bg23']);
    if (!allowed.has(group)) {
      return res.status(400).json({ error: 'invalid group; allowed: bg1-only|bg23' });
    }

    const created = await prisma.asset.create({
      data: { id, group, label },
      select: { asset_id: true, id: true, group: true, label: true },
    });

    res.status(201).json(created);
  } catch (e) {
    next(e);
  }
});

export default r;
