import { prisma } from '../lib/prisma.js';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const createReviewsFromLogbook = async (logbook, places) => {
  try {
    const locationIds = places.map(p => p.locationId);
    const locations = await prisma.location.findMany({
      where: { location_id: { in: locationIds } },
      select: { location_id: true, location_name: true },
    });
    
    if (locations.length === 0) {
      // 일치하는 장소가 없으면 조용히 종료
      return;
    }

    const locationNameMap = new Map(locations.map(l => [l.location_id, l.location_name]));
    const placeNames = locations.map(l => l.location_name);
    const prompt = `당신은 여행 기록에서 각 장소(${placeNames.join(', ')})에 대한 리뷰를 추출하고 요약하는 전문가입니다. 아래 [여행 기록]을 읽고, 각 장소에 대한 긍정적인 리뷰를 핵심 어구 여러 개로 요약하여, 반드시 장소 이름을 key로 사용하는 JSON 객체 형식으로 반환해주세요. 각 장소의 리뷰는 반드시 문자열 배열(array of strings) 형식이어야 합니다.`;
    
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: `[여행 기록]\n${logbook.entry_content}` },
      ],
      response_format: { type: 'json_object' },
    });

    const extractedReviews = JSON.parse(response.choices[0].message.content);

    for (const place of places) {
      const locationName = locationNameMap.get(place.locationId);
      let reviewContent = extractedReviews[locationName];
      
      if (reviewContent) {
        if (typeof reviewContent === 'string') {
          reviewContent = [reviewContent];
        }

        if (Array.isArray(reviewContent) && reviewContent.length > 0) {
          await prisma.review.create({
            data: {
              user_id: logbook.user_id,
              logbook_id: logbook.logbook_id,
              location_id: place.locationId,
              rating: place.rating,
              content: reviewContent,
            },
          });
        }
      }
    }
    
    // 최종 성공 로그는 남겨두는 것이 좋습니다.
    console.log(`Review generation completed for logbook: ${logbook.logbook_id}`);
  } catch (error) {
    // 에러 로깅은 실제 운영을 위해 매우 중요하므로 남겨둡니다.
    console.error(`[Review Service] Failed to generate reviews for logbook ${logbook.logbook_id}:`, error);
  }
};