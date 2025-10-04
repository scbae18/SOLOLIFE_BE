// src/controllers/weather.controller.js
import { getBriefWeatherByLatLng } from '../services/weather.service.js';

export async function briefWeather(req, res, next) {
  try {
    const { lat, lng } = req.method === 'GET' ? req.query : req.body;
    const result = await getBriefWeatherByLatLng(lat, lng);
    res.json({
      brief: result.brief, // { code, label }
      current: result.current,
      hint: result.hint,
      provider: result.provider
    });
  } catch (e) {
    next(e);
  }
}
