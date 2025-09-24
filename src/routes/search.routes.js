// src/routes/searchLite.routes.js
import { Router } from 'express';
import { searchLite } from '../controllers/search.controller.js';

const r = Router();

/**
 * @swagger
 * tags:
 *   name: Search
 *   description: 장소 라이트 검색(ID/이름/주소만)
 */

/**
 * @swagger
 * /search/locations:
 *   get:
 *     tags: [Search]
 *     summary: 장소 라이트 검색(이름/주소/키워드 매칭)
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *         description: "검색어(공백으로 여러 단어 가능). 이름/주소/키워드/특징에 부분매칭"
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1, minimum: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, minimum: 1, maximum: 100 }
 *     responses:
 *       200:
 *         description: 검색 결과(라이트)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 page:   { type: integer }
 *                 limit:  { type: integer }
 *                 total:  { type: integer }
 *                 items:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       location_id: { type: integer }
 *                       title:       { type: string }
 *                       address:     { type: string }
 */
r.get('/search/locations', searchLite);

export default r;
