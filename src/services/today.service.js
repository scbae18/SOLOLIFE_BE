// src/services/today.service.js
import { prisma } from '../lib/prisma.js';
import { getBriefWeatherByLatLng } from './weather.service.js';
import OpenAI from 'openai';

export async function getTodayRecommendation() {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  try {
    // --- 1. 실시간 컨텍스트 파악 ---
    const suwonCityHallLat = 37.2636;
    const suwonCityHallLng = 127.0286;
    const weather = await getBriefWeatherByLatLng(suwonCityHallLat, suwonCityHallLng);
    const weatherLabel = weather.brief.label;
    
    const now = new Date();
    const dayOfWeek = ['일', '월', '화', '수', '목', '금', '토'][now.getDay()];
    const hours = now.getHours();
    let timeOfDay;
    if (hours >= 5 && hours < 12) timeOfDay = '아침';
    else if (hours >= 12 && hours < 17) timeOfDay = '오후';
    else if (hours >= 17 && hours < 21) timeOfDay = '저녁';
    else timeOfDay = '밤';
    const realTimeContext = `${dayOfWeek}요일 ${timeOfDay}, 날씨: ${weatherLabel}`;

    // --- 2. 장소 1곳 랜덤 추출 ---
    const locationCount = await prisma.location.count();
    if (locationCount === 0) throw new Error('추천할 장소가 데이터베이스에 없습니다.');
    
    const skip = Math.floor(Math.random() * locationCount);
    const randomLocation = await prisma.location.findFirst({
      skip: skip,
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
      },
    });

    if (!randomLocation) {
      throw new Error('추천할 장소를 찾지 못했습니다.');
    }

    // --- 3. AI 프롬프트 구성 및 호출 ---
    let reviewSummary = '아직 리뷰가 없습니다.';
    if (randomLocation.reviews && randomLocation.reviews.length > 0) {
      reviewSummary = randomLocation.reviews.map(review => review.content.join(', ')).join('; ');
    }

    const prompt = `
    너는 사용자의 현재 상황에 꼭 맞는 문구를 제안하는, 친구처럼 다정하게 말을 건네는 감성적인 카피라이터야.
    아래 [상황]과 [장소 정보]를 조합해서, 사용자가 솔깃할 만한 추천 문구를 '청유형'으로 공백 포함 50자 내외의 딱 한 문장만 만들어줘.

    가장 중요한 것은, 상황과 장소의 특징 사이의 **감성적인 연결고리**를 찾아서 문장에 자연스럽게 녹여내는 것이야.

    [좋은 예시]
    - 상황: 비 오는 날 저녁
    - 장소: 족발집
    - 결과: "창밖에 비 내리는 소리를 들으며, 쫀득한 족발로 고소한 위로를 받아보는 건 어떠세요?" 
      (단순히 '비'와 '족발'을 합친 게 아니라, '비'가 주는 감성적인 분위기와 '족발'이 주는 '위로'라는 감정을 연결함)

    ---
    이제 아래 정보로 만들어줘.

    [상황]
    - 시점: ${realTimeContext}

    [장소 정보]
    - 장소명: ${randomLocation.location_name}
    - 카테고리: ${randomLocation.category}
    - 사용자 리뷰 요약: ${reviewSummary}
  `;

    let themePhrase = `오늘은 ${randomLocation.location_name}에 방문해보는 건 어떠세요?`;
    
    const response = await openai.chat.completions.create({
        model: 'gpt-4-turbo',
        messages: [{ role: 'user', content: prompt }],
    });
    if (response.choices[0].message.content) {
      const rawPhrase = response.choices[0].message.content;
      themePhrase = rawPhrase.replace(/\\"/g, '"').replace(/^"|"$/g, '');
    }

    
    const { reviews, ...locationData } = randomLocation;

    return {
      theme_phrase: themePhrase,
      location: locationData,
    };

  } catch (error) {
    console.error("[Today Service] Error in getTodayRecommendation:", error);
    return {
      theme_phrase: "오늘은 나를 위한 특별한 시간을 가져보는 건 어떠세요?",
      location: null,
    };
  }
}