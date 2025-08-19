import dotenv from "dotenv";
dotenv.config();

["JWT_SECRET"].forEach((k) => {
  if (!process.env[k]) console.warn(`[env] Missing ${k}`);
});
