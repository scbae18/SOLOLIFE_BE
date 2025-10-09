// src/services/today.service.js
import { prisma } from '../lib/prisma.js';
import { getBriefWeatherByLatLng } from './weather.service.js';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 5분 캐시 (좌표는 소수점 2자리로 라운드해서 캐시 키로 사용)
const weatherCache = new Map();
const WEATHER_TTL_MS = 5 * 60 * 1000;

function getWeatherCacheKey(lat, lng) {
  const keyLat = Math.round(Number(lat) * 100) / 100;
  const keyLng = Math.round(Number(lng) * 100) / 100;
  const bucket = Math.floor(Date.now() / WEATHER_TTL_MS); // 5분 버킷
  return `${keyLat},${keyLng},${bucket}`;
}

async function getWeatherWithCache(lat, lng) {
  const key = getWeatherCacheKey(lat, lng);
  if (weatherCache.has(key)) return weatherCache.get(key);
  const w = await getBriefWeatherByLatLng(lat, lng);
  weatherCache.set(key, w);
  return w;
}

// OFFSET 대신 ID 범위 샘플링 (대용량에서 빠름)
async function getRandomLocationFast() {
  const range = await prisma.location.aggregate({
    _min: { location_id: true },
    _max: { location_id: true },
  });
  const minId = range._min.location_id;
  const maxId = range._max.location_id;
  if (minId == null || maxId == null) return null;

  // 최대 10회 시도 (ID 갭을 피하기 위해)
  for (let i = 0; i < 10; i++) {
    const randId = Math.floor(Math.random() * (maxId - minId + 1)) + minId;
    const loc = await prisma.location.findFirst({
      where: { location_id: { gte: randId } },
      select: {
        location_id: true,
        location_name: true,
        address: true,
        category: true,
        keywords: true,
        thumbnail_url: true,
        reviews: {
          orderBy: { created_at: 'desc' },
          take: 5,
          select: { content: true }
        }
      }
    });
    if (loc) return loc;
  }
  return null;
}

export async function getTodayRecommendation(lat, lng) {
  try {
    // 1) 입력 검증 (NaN / 범위)
    const latNum = Number(lat);
    const lngNum = Number(lng);
    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum) || latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) {
      throw new Error('Invalid coordinates');
    }

    // 2) 날씨 + 랜덤 장소를 병렬 수행
    const [weather, randomLocation] = await Promise.all([
      getWeatherWithCache(latNum, lngNum),
      getRandomLocationFast(),
    ]);

    if (!randomLocation) {
      throw new Error('추천할 장소를 찾지 못했습니다.');
    }

    // 3) 실시간 컨텍스트
    const weatherLabel = weather?.brief?.label ?? '알 수 없음';
    const now = new Date();
    const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][now.getDay()];
    const hours = now.getHours();
    const timeOfDay =
      hours >= 5 && hours < 12 ? '아침' :
      hours >= 12 && hours < 17 ? '오후' :
      hours >= 17 && hours < 21 ? '저녁' : '밤';
    const realTimeContext = `${dayOfWeek}요일 ${timeOfDay}, 날씨: ${weatherLabel}`;

    // 4) 리뷰 요약 (문자열 안전 처리)
    let reviewSummary = '아직 리뷰가 없습니다.';
    if (randomLocation.reviews?.length > 0) {
      const texts = randomLocation.reviews
        .map(r => (typeof r.content === 'string' ? r.content : String(r.content)))
        .filter(Boolean);
      if (texts.length > 0) reviewSummary = texts.join(' | ');
    }

    // 5) 프롬프트 간소화 + OpenAI 타임아웃/토큰 제한
    const prompt = `
너는 감성 카피라이터야. 아래 [상황]과 [장소]를 보고, 공백 포함 50자 내외의 "청유형" 한 문장만 만들어줘.
[상황] ${realTimeContext}
[장소] 이름: ${randomLocation.location_name}, 카테고리: ${randomLocation.category}
[리뷰요약] ${reviewSummary}
출력: 따옴표 없이 한 문장만.
    `.trim();

    let themePhrase = `오늘은 ${randomLocation.location_name}에 방문해보는 건 어떠세요?`;

    // AbortController로 4초 타임아웃
    const ac = new AbortController();
    const to = setTimeout(() => ac.abort(), 4000);

    try {
      const resp = await openai.chat.completions.create({
        model: 'gpt-4-turbo',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 60,
        temperature: 0.9,
      }, { signal: ac.signal });

      clearTimeout(to);
      const content = resp?.choices?.[0]?.message?.content?.trim();
      if (content) themePhrase = content.replace(/^"|"$/g, '');
    } catch (e) {
      clearTimeout(to);
      // OpenAI 타임아웃/에러 시 조용히 폴백
    }

    const { reviews, ...locationData } = randomLocation;
    return { theme_phrase: themePhrase, location: locationData };

  } catch (error) {
    console.error('[Today Service] Error in getTodayRecommendation:', error?.message || error);
    return {
      theme_phrase: '오늘은 나를 위한 특별한 시간을 가져보는 건 어떠세요?',
      location: null,
    };
  }
}
