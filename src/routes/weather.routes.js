// src/routes/weather.routes.js
import { Router } from 'express';
import * as w from '../controllers/weather.controller.js';

const r = Router();

/**
 * @swagger
 * tags:
 *   name: Weather
 *   description: 위경도 기반 간단 날씨(4종) API
 */

/**
 * @swagger
 * /weather/brief:
 *   get:
 *     summary: 현재 날씨(4종) 조회
 *     description: 위도·경도를 기준으로 현재 날씨를 화창/구름 많음/비/눈 중 하나로 분류해 반환합니다.
 *     tags: [Weather]
 *     parameters:
 *       - in: query
 *         name: lat
 *         schema: { type: number, example: 37.5665 }
 *         required: true
 *       - in: query
 *         name: lng
 *         schema: { type: number, example: 126.9780 }
 *         required: true
 *     responses:
 *       200:
 *         description: 분류 성공
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 brief:
 *                   type: object
 *                   properties:
 *                     code: { type: string, enum: [SUNNY, CLOUDY, RAIN, SNOW] }
 *                     label: { type: string, enum: ["화창","구름 많음","비","눈"] }
 *                 current:
 *                   type: object
 *                   properties:
 *                     temperature_2m: { type: number, nullable: true }
 *                     weathercode:    { type: integer }
 *                     precipitation:  { type: number, nullable: true }
 *                     time:           { type: string, nullable: true }
 *                 hint:
 *                   type: object
 *                   properties:
 *                     cloudcover_now:     { type: number, nullable: true }
 *                     rain_now:           { type: number, nullable: true }
 *                     snowfall_now:       { type: number, nullable: true }
 *                     precipitation_now:  { type: number, nullable: true }
 *                 provider:
 *                   type: string
 */
r.get('/weather/brief', w.briefWeather);

/**
 * @swagger
 * /weather/brief:
 *   post:
 *     summary: 현재 날씨(4종) 조회 (POST)
 *     tags: [Weather]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [lat, lng]
 *             properties:
 *               lat: { type: number, example: 37.5665 }
 *               lng: { type: number, example: 126.9780 }
 *     responses:
 *       200:
 *         description: OK
 */
r.post('/weather/brief', w.briefWeather);

export default r;
