// src/services/uploads.service.js
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import multer from 'multer';
import { extname } from 'node:path';
import { lookup as mimeLookup } from 'mime-types';
import { v4 as uuidv4 } from 'uuid';

const s3 = new S3Client({ region: process.env.AWS_REGION });
const BUCKET = process.env.AWS_S3_BUCKET;
const CDN_BASE = process.env.CDN_BASE || null;
const MAX_MB = Number(process.env.UPLOAD_MAX_MB || 10);
const MAX_BYTES = MAX_MB * 1024 * 1024;

// 키 규칙: uploads/{yyyy}/{mm}/{userId}/{uuid}.{ext}
function buildObjectKey({ userId, filename, i = 0 }) {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const ext = (extname(filename) || '').toLowerCase().replace('.', '');
  const id = uuidv4();
  const safeExt = ext || 'jpg';
  return `uploads/${yyyy}/${mm}/${userId}/${id}${i ? `-${i}` : ''}.${safeExt}`;
}

function toPublicUrl(key) {
  if (CDN_BASE) return `${CDN_BASE}/${key}`;
  // S3 퍼블릭 버킷 or OAI 정책에 따라 접근 가능해야 함
  return `https://${BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
}

/** ========== (A) Presigned PUT 발급 ========== */
export async function getPresignedPuts({ userId, filename, contentType, bytes, count }) {
  if (!filename || !contentType || !Number.isFinite(bytes)) {
    const e = new Error('filename/contentType/bytes required'); e.status = 400; throw e;
  }
  if (bytes > MAX_BYTES) {
    const e = new Error(`File too large. Max ${MAX_MB}MB`); e.status = 400; throw e;
  }
  // MIME 검증(이미지 계열만 허용 예시)
  if (!/^image\//.test(contentType)) {
    const e = new Error('Only image/* allowed'); e.status = 400; throw e;
  }

  const items = [];
  for (let i = 0; i < count; i++) {
    const key = buildObjectKey({ userId, filename, i });
    const cmd = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: contentType,
    });
    const uploadUrl = await getSignedUrl(s3, cmd, { expiresIn: 60 * 5 }); // 5분
    items.push({
      key,
      uploadUrl,
      publicUrl: toPublicUrl(key),
      headers: { 'Content-Type': contentType } // 클라이언트 PUT 시 반드시 세팅
    });
  }
  return items;
}

/** ========== (B) 서버 프록시 업로드 ========== */
// 메모리 저장(멀터). 대용량이면 디스크/스트림 처리로 교체 가능
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 10 }
});
export const multerUploads = upload.array('files', 10);

export async function putFilesViaServer(req, { userId }) {
  // 멀터 실행(프라미스화)
  const files = await new Promise((resolve, reject) => {
    multerUploads(req, null, (err) => err ? reject(err) : resolve(req.files || []));
  });

  if (!files.length) {
    const e = new Error('No files'); e.status = 400; throw e;
  }

  const results = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const ct = f.mimetype || mimeLookup(f.originalname) || 'application/octet-stream';
    if (!/^image\//.test(ct)) {
      const e = new Error('Only image/* allowed'); e.status = 400; throw e;
    }

    const key = buildObjectKey({ userId, filename: f.originalname, i });
    const cmd = new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: f.buffer,
      ContentType: ct,
    });
    await s3.send(cmd);
    results.push({ key, publicUrl: toPublicUrl(key) });
  }
  return results;
}
