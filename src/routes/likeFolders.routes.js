import { Router } from 'express';
import { authRequired } from '../lib/authMiddleware.js';
import * as c from '../controllers/likeFolders.controller.js';

const r = Router();

/**
 * @swagger
 * tags:
 *   name: LikeFolders
 *   description: 좋아요 폴더(리스트) 및 폴더-장소 관리
 */

/**
 * @swagger
 * /folders/me/like-folders:
 *   post:
 *     tags: [LikeFolders]
 *     summary: 좋아요 폴더 생성
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, example: "데이트 장소" }
 *     responses:
 *       200: { description: 폴더 생성 완료 }
 */
r.post('/me/like-folders', authRequired, c.createFolder);

/**
 * @swagger
 * /folders/me/like-folders:
 *   get:
 *     tags: [LikeFolders]
 *     summary: 내 좋아요 폴더 목록 조회
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: 성공 }
 */
r.get('/me/like-folders', authRequired, c.listFolders);

/**
 * @swagger
 * /folders/me/like-folders/{folderId}:
 *   patch:
 *     tags: [LikeFolders]
 *     summary: 폴더 이름 수정
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: folderId
 *         schema: { type: integer }
 *         required: true
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string, example: "새 폴더명" }
 *     responses:
 *       200: { description: 수정 완료 }
 *   delete:
 *     tags: [LikeFolders]
 *     summary: 폴더 삭제
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: folderId
 *         schema: { type: integer }
 *         required: true
 *     responses:
 *       200: { description: 삭제 완료 }
 */
r.patch('/me/like-folders/:folderId', authRequired, c.renameFolder);
r.delete('/me/like-folders/:folderId', authRequired, c.removeFolder);

/**
 * @swagger
 * /folders/me/like-folders/{folderId}/locations:
 *   get:
 *     tags: [LikeFolders]
 *     summary: 폴더 내 장소 목록 조회
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: folderId
 *         schema: { type: integer }
 *         required: true
 *       - in: query
 *         name: page
 *         schema: { type: integer, example: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, example: 20 }
 *     responses:
 *       200: { description: 성공 }
 */
r.get('/me/like-folders/:folderId/locations', authRequired, c.listFolderLocations);

/**
 * @swagger
 * /folders/like-folders/{folderId}/locations/{locationId}:
 *   post:
 *     tags: [LikeFolders]
 *     summary: 폴더에 장소 추가
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: folderId
 *         schema: { type: integer }
 *         required: true
 *       - in: path
 *         name: locationId
 *         schema: { type: integer }
 *         required: true
 *     responses:
 *       200: { description: 추가 완료 }
 *   delete:
 *     tags: [LikeFolders]
 *     summary: 폴더에서 장소 제거
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: folderId
 *         schema: { type: integer }
 *         required: true
 *       - in: path
 *         name: locationId
 *         schema: { type: integer }
 *         required: true
 *     responses:
 *       200: { description: 제거 완료 }
 */
r.post('/like-folders/:folderId/locations/:locationId', authRequired, c.addToFolder);
r.delete('/like-folders/:folderId/locations/:locationId', authRequired, c.removeFromFolder);

/**
 * @swagger
 * /folders/like-folders/{folderId}/locations/{locationId}/toggle:
 *   post:
 *     tags: [LikeFolders]
 *     summary: 폴더 내 장소 좋아요 토글
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: folderId
 *         schema: { type: integer }
 *         required: true
 *       - in: path
 *         name: locationId
 *         schema: { type: integer }
 *         required: true
 *     responses:
 *       200: { description: 토글 완료 }
 */
r.post('/like-folders/:folderId/locations/:locationId/toggle', authRequired, c.toggleInFolder);

export default r;
