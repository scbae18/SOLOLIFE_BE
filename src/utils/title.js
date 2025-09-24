// src/utils/title.js
export function titleByPoints(points = 0) {
  if (points >= 7501) return '🏆 전설의 탐험가 (Lv.MAX)';
  if (points >= 5001) return '🗿 탐험가 마스터 (Lv.8)';
  if (points >= 3501) return '🌌 고독한 여행자 (Lv.7)';
  if (points >= 2001) return '🏞️ 여정 기록자 (Lv.6)';
  if (points >= 1001) return '🗺️ 도시 유랑자 (Lv.5)';
  if (points >= 501)  return '🌳 숙련된 탐험가 (Lv.4)';
  if (points >= 201)  return '🌿 길잡이 탐험가 (Lv.3)';
  if (points >= 51)   return '🍃 새싹 탐험가 (Lv.2)';
  return '🌱 초보 탐험가 (Lv.1)';
}
