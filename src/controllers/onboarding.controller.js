import { saveOnboardingAnswers } from '../services/onboarding.service.js';

export async function postOnboarding(req, res, next) {
  try {
    const user_id = req.user?.user_id; // 인증 미들웨어에서 셋업된다고 가정
    const result = await saveOnboardingAnswers(user_id, req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
}
