// src/routes/uploads.routes.js
import { Router } from 'express';
import { authRequired } from '../lib/authMiddleware.js';
import { presignUpload, uploadViaServer } from '../controllers/uploads.controller.js';

const r = Router();

/**
 * @swagger
 * tags:
 *   name: Uploads
 *   description: 이미지 업로드 API
 */

/**
 * @swagger
 * /uploads/presign:
 *   get:
 *     summary: (A) 프리사인 업로드 URL 발급
 *     description: 클라이언트가 S3에 직접 PUT 업로드할 수 있는 일회성 URL을 발급합니다.
 *     tags: [Uploads]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: filename
 *         schema: { type: string }
 *         required: true
 *       - in: query
 *         name: contentType
 *         schema: { type: string }
 *         required: true
 *       - in: query
 *         name: bytes
 *         schema: { type: integer }
 *         required: true
 *       - in: query
 *         name: count
 *         schema: { type: integer, default: 1 }
 *         required: false
 *     responses:
 *       200:
 *         description: 발급 성공
 *
 * /uploads:
 *   post:
 *     summary: (B) 서버 프록시 업로드(multipart/form-data)
 *     description: 클라이언트가 서버로 파일을 업로드하면 서버가 S3로 전송하고 공개 URL을 반환합니다.
 *     tags: [Uploads]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *     responses:
 *       200:
 *         description: 업로드 성공
 */
r.get('/uploads/presign', authRequired, presignUpload);
r.post('/uploads', authRequired, uploadViaServer);

export default r;
