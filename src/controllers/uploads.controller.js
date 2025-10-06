// src/controllers/uploads.controller.js
import { getPresignedPuts, putFilesViaServer } from '../services/uploads.service.js';

export async function presignUpload(req, res, next) {
  try {
    const userId = req.user.user_id;
    const { filename, contentType, bytes, count = 1 } = req.query;

    const n = Math.max(1, Math.min(Number(count) || 1, 10));
    const results = await getPresignedPuts({
      userId,
      filename: String(filename),
      contentType: String(contentType),
      bytes: Number(bytes),
      count: n
    });

    res.json({ items: results });
  } catch (e) { next(e); }
}

export async function uploadViaServer(req, res, next) {
  try {
    const userId = req.user.user_id;
    const results = await putFilesViaServer(req, { userId });
    res.json({ items: results });
  } catch (e) { next(e); }
}
