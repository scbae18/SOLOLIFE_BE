// src/services/aiGeneration.service.js
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * 장소 목록을 기반으로 AI가 여정 제목과 요약을 생성합니다.
 * @param {Array<object>} locations - 장소 상세 정보가 담긴 배열
 * @returns {Promise<{title: string, summary: string}>} AI가 생성한 제목과 요약
 */
export async function generateJourneyTitleAndSummary(locations) {
  const context = locations.map(loc => 
    `- 장소: ${loc.location_name} (카테고리: ${loc.category}, 특징: ${loc.keywords?.join(', ') || '정보 없음'})`
  ).join('\n');

  const prompt = `
    아래 장소 목록은 사용자가 선택한 '혼자만의 여정' 코스입니다.
    이 코스의 전체적인 분위기와 특징을 파악해서, 아래 두 가지 항목을 생성해주세요.
    1. title: 15자 이내의 창의적이고 매력적인 여정 제목
    2. summary: 공백 포함 100자 이하의 간결하고 감성적인 코스 요약

    결과는 반드시 JSON 객체 형식({ "title": "...", "summary": "..." })으로 반환해주세요.

    [장소 목록]
    ${context}
  `;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4-turbo',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });

    const result = JSON.parse(response.choices[0].message.content);
    return result;
  } catch (error) {
    console.error("AI 여정 제목/요약 생성 실패:", error);
    return {
      title: "나만의 특별한 여정",
      summary: "내가 직접 만들어가는 즐거운 시간, 나만의 여정을 기록해보세요."
    };
  }
}