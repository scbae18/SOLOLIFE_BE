import { prisma } from '../lib/prisma.js';
import { ApiError } from '../lib/ApiError.js';

/**
 * 프론트에서 온 값 그대로 저장만 합니다.
 * body 예시:
 * {
 *   "nickname": "승챤",
 *   "characterType": "A",         // "A" | "B"
 *   "interests": ["카페","산책/활동"] // 1개 이상
 * }
 *
 * - nickname이 있으면 username도 함께 업데이트(원치 않으면 이 줄 삭제)
 * - 검증 최소화(프론트에서 이미 보장한다고 했으므로)
 */
export async function saveOnboardingAnswers(user_id, payload) {
  if (!user_id) throw new ApiError(401, 'Unauthorized');

  const { nickname, characterType, interests } = payload ?? {};

  // 저장용 JSON 그대로 구성
  const answers = {
    nickname: nickname ?? null,
    characterType: characterType ?? null,
    interests: Array.isArray(interests) ? interests : [],
  };

  // 업데이트 데이터 구성 (username 동시 변경 원치 않으면 username 라인 제거)
  const data = {
    onboarding_answers: answers,
    ...(nickname && nickname.trim() ? { username: nickname.trim() } : {})
  };

  const user = await prisma.user.update({
    where: { user_id },
    data,
    select: {
      user_id: true,
      username: true,
      onboarding_answers: true,
      current_character_id: true
    }
  });

  return { ok: true, user };
}
