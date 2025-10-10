// src/services/weather.service.js
import axios from 'axios';
import { ApiError } from '../lib/ApiError.js';

/** WMO weathercode → 4종 분류 매핑 (동일) */
function mapWeatherCodeToBrief(wmo) {
  const SUNNY = { code: 'SUNNY', label: '화창' };
  const CLOUDY = { code: 'CLOUDY', label: '구름 많음' };
  const RAIN = { code: 'RAIN', label: '비' };
  const SNOW = { code: 'SNOW', label: '눈' };
  if (wmo === 0) return SUNNY;
  if ([1, 2, 3].includes(wmo)) return CLOUDY;
  if ([45, 48].includes(wmo)) return CLOUDY;
  if ([51, 53, 55, 56, 57].includes(wmo)) return RAIN;
  if ([61, 63, 65, 66, 67].includes(wmo)) return RAIN;
  if ([71, 73, 75, 77].includes(wmo)) return SNOW;
  if ([80, 81, 82].includes(wmo)) return RAIN;
  if ([85, 86].includes(wmo)) return SNOW;
  if ([95, 96, 97, 98, 99].includes(wmo)) return RAIN;
  return CLOUDY;
}

export async function getBriefWeatherByLatLng(lat, lng) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new ApiError(400, 'lat/lng가 유효한 숫자가 아닙니다.');
  }

  const url = 'https://api.open-meteo.com/v1/forecast';
  const params = {
    latitude,
    longitude,
    // ✅ 최신 스펙 변수명 (언더스코어)
    current: ['temperature_2m', 'weather_code', 'precipitation'].join(','),
    hourly: ['cloud_cover', 'precipitation', 'rain', 'snowfall'].join(','),
    timezone: 'auto'
  };

  let data;
  try {
    const res = await axios.get(url, { params, timeout: 12000 });
    data = res.data;
  } catch (e) {
    // 4xx면 그대로 내려주기(요청 파라미터 문제 디버깅에 유리)
    const status = e.response?.status ?? 502;
    const msg = e.response?.data?.reason || e.response?.data?.error || e.message;
    console.error('[Open-Meteo] request failed', { status, msg, data: e.response?.data });
    if (status >= 400 && status < 500) {
      throw new ApiError(status, `날씨 제공자 요청이 거절되었습니다: ${msg || '잘못된 파라미터'}`);
    }
    throw new ApiError(502, '날씨 제공자 호출 실패(Open-Meteo). 잠시 후 다시 시도해주세요.');
  }

  // ✅ 응답 키도 언더스코어
  const wmo = data?.current?.weather_code;
  if (wmo == null) {
    console.error('[Open-Meteo] missing weather_code in response', data?.current);
    throw new ApiError(502, '날씨 정보를 해석할 수 없습니다.');
  }

  const brief = mapWeatherCodeToBrief(Number(wmo));

  return {
    brief,
    current: {
      temperature_2m: data?.current?.temperature_2m ?? null,
      weather_code: wmo,
      precipitation: data?.current?.precipitation ?? null,
      time: data?.current?.time ?? null
    },
    hint: {
      // ✅ hourly 키도 언더스코어 사용
      cloud_cover_now: pickHourlyNow(data?.hourly, 'cloud_cover', data?.current?.time),
      rain_now: pickHourlyNow(data?.hourly, 'rain', data?.current?.time),
      snowfall_now: pickHourlyNow(data?.hourly, 'snowfall', data?.current?.time),
      precipitation_now: pickHourlyNow(data?.hourly, 'precipitation', data?.current?.time)
    },
    provider: 'open-meteo'
  };
}

/** 현재 시각 인덱스의 시간대별 값을 뽑는 헬퍼 (없으면 null) */
function pickHourlyNow(hourly, key, curTime) {
  try {
    if (!hourly?.time?.length || !hourly[key]?.length) return null;
    const idx = hourly.time.indexOf(curTime);
    if (idx < 0) return null;
    return hourly[key][idx] ?? null;
  } catch {
    return null;
  }
}
