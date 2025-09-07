// scripts/ops/backfill_location_photos.js
import 'dotenv/config';
import axios from 'axios';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const GOOGLE_PLACES_TEXT    = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
const GOOGLE_PLACES_DETAILS = 'https://maps.googleapis.com/maps/api/place/details/json';
const GOOGLE_PLACES_PHOTO   = 'https://maps.googleapis.com/maps/api/place/photo';

const {
  GOOGLE_MAPS_API_KEY
} = process.env;

if (!GOOGLE_MAPS_API_KEY) {
  console.error('[env] GOOGLE_MAPS_API_KEY 누락');
  process.exit(1);
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function withRetry(fn, tries = 3, delay = 350) {
  let last;
  for (let i=0;i<tries;i++){
    try { return await fn(); }
    catch (e) { last = e; await sleep(delay * (i+1)); }
  }
  throw last;
}

function buildPhotoUrl(photoRef, { maxwidth = 1600 } = {}) {
  // Google의 /photo 엔드포인트는 302로 실제 CDN URL을 리다이렉트함.
  // 우리는 "요청 URL" 자체를 저장해도 재사용 가능(권장: UI에서 이 URL로 <img> 로드)
  const u = new URL(GOOGLE_PLACES_PHOTO);
  u.searchParams.set('maxwidth', String(maxwidth));
  u.searchParams.set('photo_reference', photoRef);
  u.searchParams.set('key', GOOGLE_MAPS_API_KEY);
  return u.toString();
}

async function findPlaceId({ name, address }) {
  // 우선 DB에 이미 있으면 사용
  const query = address ? `${name} ${address}` : name;
  const { data } = await withRetry(() =>
    axios.get(GOOGLE_PLACES_TEXT, {
      params: { query, key: GOOGLE_MAPS_API_KEY, language: 'ko', region: 'kr' },
      timeout: 8000
    })
  );
  const res = data?.results?.[0];
  return res?.place_id || null;
}

async function fetchPhotos(place_id) {
  const { data } = await withRetry(() =>
    axios.get(GOOGLE_PLACES_DETAILS, {
      params: {
        place_id,
        key: GOOGLE_MAPS_API_KEY,
        language: 'ko',
        fields: 'photos' // photos.width,height,photo_reference,html_attributions
      },
      timeout: 8000
    })
  );
  const photos = Array.isArray(data?.result?.photos) ? data.result.photos : [];
  return photos.slice(0, 3).map(p => ({
    width: p.width ?? null,
    height: p.height ?? null,
    photo_reference: p.photo_reference,
    attributions: Array.isArray(p.html_attributions) ? p.html_attributions : [],
    remote_url: buildPhotoUrl(p.photo_reference, { maxwidth: 1600 })
  }));
}

async function upsertTop3PhotosForLocation(loc) {
  let placeId = loc.google_place_id ?? null;

  if (!placeId) {
    placeId = await findPlaceId({ name: loc.location_name, address: loc.address ?? '' });
    if (!placeId) {
      console.log(`[skip:no-placeid] ${loc.location_id} ${loc.location_name}`);
      return;
    }
    await prisma.location.update({
      where: { location_id: loc.location_id },
      data: { google_place_id: placeId }
    });
  }

  const photos = await fetchPhotos(placeId);
  if (!photos.length) {
    console.log(`[no-photos] ${loc.location_id} ${loc.location_name}`);
    return;
  }

  // 기존 사진 전부 교체(정확한 3장 유지 위해 deleteMany 후 createMany가 가장 단순/안전)
  await prisma.$transaction(async (tx) => {
    await tx.locationPhoto.deleteMany({ where: { location_id: loc.location_id } });

    await tx.locationPhoto.createMany({
      data: photos.map((p, i) => ({
        location_id: loc.location_id,
        position: i + 1,
        width: p.width,
        height: p.height,
        photo_reference: p.photo_reference,
        attributions: p.attributions,
        remote_url: p.remote_url
      }))
    });

    // 1번 사진은 Location의 레거시 필드에도 반영(호환성)
    const p1 = photos[0];
    await tx.location.update({
      where: { location_id: loc.location_id },
      data: {
        photo_reference: p1.photo_reference,
        photo_attribution: p1.attributions,     // JSON에 문자열 배열 그대로 저장
        fallback_photo_url: p1.remote_url       // 필요시 썸네일 URL은 별도 파이프라인에서 생성
      }
    });
  });

  console.log(`[ok] ${loc.location_id} ${loc.location_name} → ${photos.length} photos`);
}

async function main() {
  // 옵션: 일부만 테스트하고 싶으면 LIMIT, OFFSET 환경변수 사용 가능
  const LIMIT  = Number(process.env.LIMIT ?? 5000);
  const OFFSET = Number(process.env.OFFSET ?? 0);

  // 이미 사진이 있는 애는 건너뛰고 싶으면 아래 where 조건을 바꿔주세요.
  const locations = await prisma.location.findMany({
    skip: OFFSET,
    take: LIMIT,
    orderBy: { location_id: 'asc' },
    select: {
      location_id: true,
      location_name: true,
      address: true,
      google_place_id: true
    }
  });

  console.log(`[start] candidates=${locations.length}, LIMIT=${LIMIT}, OFFSET=${OFFSET}`);

  for (const loc of locations) {
    try {
      await upsertTop3PhotosForLocation(loc);
      // Google QPS 부담을 줄이기 위한 살짝의 호흡
      await sleep(120);
    } catch (e) {
      console.warn(`[error] ${loc.location_id} ${loc.location_name}:`, e?.response?.data || e?.message || e);
      // 에러가 나도 다음으로
      await sleep(250);
    }
  }

  console.log('[done]');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
