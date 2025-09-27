import * as svc from '../services/journeys.service.js';
import { generateJourneyTitleAndSummary } from '../services/aiGeneration.service.js'; 
import { prisma } from '../lib/prisma.js';


export const listMine = async (req, res) => {
  const result = await svc.listMine(req.user.user_id, req.query);
  res.json(result);
};

export const create = async (req, res) => {
  const userId = req.user?.user_id ?? req.body.user_id; // 인증 미들웨어 없을 때 대비
  const { journey_title, journey_summary,locations, tags } = req.body ?? {};

  const created = await svc.createJourney({
    userId,
    journeyTitle: journey_title,
    journeySummary: journey_summary,
    locations,
    tags, // string[] or null
  });

  res.status(201).json(created);
};

export const detail = async (req, res) => {
  const j = await svc.getJourney(req.user.user_id, +req.params.journeyId);
  res.json(j);
};

export const update = async (req, res) => {
  const result = await svc.updateJourney(
    req.user.user_id,
    +req.params.journeyId,
    req.body
  );
  res.json(result);
};

export const remove = async (req, res) => {
  const result = await svc.removeJourney(req.user.user_id, +req.params.journeyId);
  res.json(result);
};

export const generatePreview = async (req, res) => {
  const { locations } = req.body; // [{ location_id: 1 }, ...]
  if (!locations || !Array.isArray(locations) || locations.length === 0) {
    return res.status(400).json({ error: 'locations are required' });
  }
  const locationIds = locations.map(l => l.location_id);

  const fullLocations = await prisma.location.findMany({
    where: { location_id: { in: locationIds } },
    select: { location_name: true, category: true, keywords: true },
  });

  const aiResult = await generateJourneyTitleAndSummary(fullLocations);
  res.json(aiResult); // AI 결과만 응답 (DB 저장 X)
};