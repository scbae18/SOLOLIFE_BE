// src/app.js
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import routes from "./routes/index.js";
import { notFoundHandler, errorHandler } from "./middlewares/errorMiddleware.js";
import { setupSwagger } from "./config/swagger.js";

const app = express();

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(rateLimit({ windowMs: 60 * 1000, max: 100 }));

// 🔗 Swagger
setupSwagger(app);

// Health
app.get("/health", (_req, res) => res.json({ ok: true }));

// API
app.use("/api", routes);

// 404 & Error
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
