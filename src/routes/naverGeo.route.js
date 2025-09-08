import { Router } from 'express';
import { naverGeocode, naverReverseGeocode } from '../services/naverGeo.service.js';

const r = Router();

/**
 * @swagger
 * tags:
 *   name: Geocode
 *   description: 네이버 지도 프록시 API
 */

/**
 * @swagger
 * /geo/geocode:
 *   get:
 *     summary: 주소/키워드로 좌표 검색
 *     tags: [Geocode]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: 검색어 (UTF-8 인코딩 필요)
 *     responses:
 *       200:
 *         description: 검색 결과 리스트
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   label:
 *                     type: string
 *                     example: 경기도 수원시 영통구 영통로 123
 *                   latitude:
 *                     type: number
 *                     example: 37.245678
 *                   longitude:
 *                     type: number
 *                     example: 127.123456
 *       400:
 *         description: 잘못된 요청 (q 누락 등)
 *       500:
 *         description: 서버 내부 오류
 */
r.get('/geocode', async (req, res) => {
  try {
    const q = (req.query.q ?? '').toString().trim();
    if (!q) return res.status(400).json({ message: 'q (검색어) required' });

    const data = await naverGeocode(q);
    const items = (data?.addresses ?? []).map((a) => {
      const label =
        a.roadAddress?.trim() ||
        a.jibunAddress?.trim() ||
        [a.sido, a.sigungu, a.roadname, a.address].filter(Boolean).join(' ').trim();

      return {
        label,
        latitude: a.y ? Number(a.y) : undefined,
        longitude: a.x ? Number(a.x) : undefined,
      };
    });

    return res.json(items);
  } catch (err) {
    const status = err.response?.status;
    const payload = err.response?.data;
    if (status)
      return res
        .status(status >= 400 && status < 600 ? status : 502)
        .json({ message: 'Naver API error', detail: payload });
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

/**
 * @swagger
 * /geo/reverse:
 *   get:
 *     summary: 좌표로 주소 검색
 *     tags: [Geocode]
 *     parameters:
 *       - in: query
 *         name: lat
 *         required: true
 *         schema:
 *           type: number
 *           example: 37.245678
 *       - in: query
 *         name: lng
 *         required: true
 *         schema:
 *           type: number
 *           example: 127.123456
 *     responses:
 *       200:
 *         description: 주소 변환 결과
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 label:
 *                   type: string
 *                   example: 경기도 수원시 영통구 영통로 123
 *                 latitude:
 *                   type: number
 *                   example: 37.245678
 *                 longitude:
 *                   type: number
 *                   example: 127.123456
 *       400:
 *         description: lat/lng 누락 또는 잘못된 값
 *       500:
 *         description: 서버 내부 오류
 */
r.get('/reverse', async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ message: 'lat, lng must be valid numbers' });
    }

    const data = await naverReverseGeocode(lat, lng);
    const first = (data?.results ?? [])[0];

    const road = (data?.results ?? []).find((r) => r.name === 'roadaddr');
    const addr = (data?.results ?? []).find((r) => r.name === 'addr');

    const buildLabelFromResult = (resObj) => {
      if (!resObj) return '';
      const { region, land } = resObj;
      const regionStr = [region?.area1?.name, region?.area2?.name, region?.area3?.name, region?.area4?.name]
        .filter(Boolean)
        .join(' ');
      const landName = [land?.name, land?.number1, land?.number2 ? `-${land?.number2}` : '']
        .filter(Boolean)
        .join('');
      const addition = land?.addition0?.value || land?.addition1?.value || '';
      return [regionStr, landName, addition].filter(Boolean).join(' ').trim();
    };

    const label = buildLabelFromResult(road) || buildLabelFromResult(addr) || buildLabelFromResult(first) || '';

    return res.json({
      label,
      latitude: lat,
      longitude: lng,
    });
  } catch (err) {
    const status = err.response?.status;
    const payload = err.response?.data;
    if (status)
      return res
        .status(status >= 400 && status < 600 ? status : 502)
        .json({ message: 'Naver API error', detail: payload });
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

export default r;
