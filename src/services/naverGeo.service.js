import axios from 'axios';

const NAVER_KEY_ID = process.env.NCP_MAPS_ACCESS_KEY_ID;
const NAVER_KEY = process.env.NCP_MAPS_SECRET_KEY;

const naver = axios.create({
  timeout: 7000,
  headers: {
    'X-NCP-APIGW-API-KEY-ID': NAVER_KEY_ID,
    'X-NCP-APIGW-API-KEY': NAVER_KEY,
  },
});

const BASE = process.env.NAVER_MAPS_BASE || 'https://naveropenapi.apigw.ntruss.com';

export async function naverGeocode(query) {
  const url = `${BASE}/map-geocode/v2/geocode`;
  const { data } = await naver.get(url, { params: { query } });
  return data;
}

export async function naverReverseGeocode(lat, lng) {
  const url = `${BASE}/map-reversegeocode/v2/gc`;
  const params = {
    coords: `${lng},${lat}`,          // 경도,위도 순서(문서 표기 X=lng, Y=lat)
    sourcecrs: 'epsg:4326',
    orders: 'roadaddr,addr',
    output: 'json',
  };
  const { data } = await naver.get(url, { params });
  return data;
}

