// src/services/weather.service.js
import axios from 'axios';
import { ApiError } from '../lib/ApiError.js';

/** WMO weathercode → 4종 분류 매핑 */
function mapWeatherCodeToBrief(wmo) {
  const SUNNY = { code: 'SUNNY', label: '화창' };
  const CLOUDY = { code: 'CLOUDY', label: '구름 많음' };
  const RAIN = { code: 'RAIN', label: '비' };
  const SNOW = { code: 'SNOW', label: '눈' };

  // https://open-meteo.com/en/docs : WMO Weather interpretation codes
  if (wmo === 0) return SUNNY;                     // Clear sky
  if ([1, 2, 3].includes(wmo)) return CLOUDY;      // Mainly clear/partly cloudy/overcast
  if ([45, 48].includes(wmo)) return CLOUDY;       // Fog/Depositing rime fog

  if ([51, 53, 55, 56, 57].includes(wmo)) return RAIN; // Drizzle / Freezing drizzle
  if ([61, 63, 65, 66, 67].includes(wmo)) return RAIN; // Rain / Freezing rain
  if ([71, 73, 75, 77].includes(wmo)) return SNOW;     // Snow fall & grains

  if ([80, 81, 82].includes(wmo)) return RAIN;     // Rain showers
  if ([85, 86].includes(wmo)) return SNOW;         // Snow showers

  if ([95, 96, 97, 98, 99].includes(wmo)) return RAIN; // Thunderstorm → 비로 처리

  // 알 수 없는 값은 구름으로 안전 처리
  return CLOUDY;
}

export async function getBriefWeatherByLatLng(lat, lng) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new ApiError(400, 'lat/lng가 유효한 숫자가 아닙니다.');
  }

  // Open-Meteo 현재 날씨 호출 (키 불필요)
  const url = 'https://api.open-meteo.com/v1/forecast';
  const params = {
    latitude,
    longitude,
    current: ['temperature_2m', 'weathercode', 'precipitation'].join(','),
    hourly: ['cloudcover', 'precipitation', 'rain', 'snowfall'].join(','),
    timezone: 'auto'
  };

  let data;
  try {
    const res = await axios.get(url, { params, timeout: 7000 });
    data = res.data;
  } catch (e) {
    throw new ApiError(502, '날씨 제공자 호출 실패(Open-Meteo). 잠시 후 다시 시도해주세요.');
  }

  const wmo = data?.current?.weathercode;
  if (wmo == null) throw new ApiError(502, '날씨 정보를 해석할 수 없습니다.');

  const brief = mapWeatherCodeToBrief(Number(wmo));

  // 디버깅/확장용 메타 포함(프론트에서 필요 없으면 숨겨도 됨)
  return {
    brief, // { code: 'SUNNY'|'CLOUDY'|'RAIN'|'SNOW', label: '화창'|'구름 많음'|'비'|'눈' }
    current: {
      temperature_2m: data?.current?.temperature_2m ?? null,
      weathercode: wmo,
      precipitation: data?.current?.precipitation ?? null,
      time: data?.current?.time ?? null
    },
    // 선택: 현재 시각의 시간대별 보조 지표
    hint: {
      cloudcover_now: pickHourlyNow(data?.hourly, 'cloudcover', data?.current?.time),
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
