// src/services/searchLite.service.js
import { prisma } from '../lib/prisma.js';

/** 숫자 파싱 유틸 */
const toInt = (v, def) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : def;
};

/**
 * 라이트 검색: ID/이름/주소만 반환
 * Query:
 *  - q: 텍스트 (공백으로 다단어 가능)
 *  - page: 기본 1
 *  - limit: 기본 20 (최대 100)
 */
export async function searchLocationsLite(q = {}) {
  const page = toInt(q.page, 1);
  const limit = Math.min(toInt(q.limit, 20), 100);
  const skip = (page - 1) * limit;

  const text = (q.q ?? '').trim();
  const where = {};

  if (text) {
    const terms = text.split(/\s+/).filter(Boolean);
    // 각 단어가 이름/주소/키워드/특징 중 하나에 매칭되도록 AND 결합
    where.AND = terms.map((t) => ({
      OR: [
        { location_name: { contains: t, mode: 'insensitive' } },
        { address:       { contains: t, mode: 'insensitive' } },
        { keywords:      { has: t } },
        { features_flat: { has: t } },
      ],
    }));
  }

  const [items, total] = await Promise.all([
    prisma.location.findMany({
      where,
      skip,
      take: limit,
      select: {
        location_id: true,
        location_name: true,
        address: true,
      },
      orderBy: [{ updated_at: 'desc' }, { created_at: 'desc' }],
    }),
    prisma.location.count({ where }),
  ]);

  // 프론트 요구 스키마로 필드명 매핑(title)
  const mapped = items.map((it) => ({
    location_id: it.location_id,
    title: it.location_name,
    address: it.address,
  }));

  return { page, limit, total, items: mapped };
}
