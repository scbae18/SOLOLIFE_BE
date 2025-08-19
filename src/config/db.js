// src/config/db.js
import { Sequelize } from "sequelize";

export const sequelize = new Sequelize(
  process.env.DB_NAME || "sololife",
  process.env.DB_USER || "root",
  process.env.DB_PASS || "password",
  {
    host: process.env.DB_HOST || "localhost",
    port: process.env.DB_PORT || 3306,
    dialect: "mysql",
    logging: false,
  }
);

export const connectDB = async () => {
  try {
    await sequelize.authenticate();
    console.log("[db] MySQL connected with Sequelize");
    await sequelize.sync(); // 모델 자동 생성 (초기 개발용)
  } catch (err) {
    console.error("[db] connection error:", err);
    process.exit(1);
  }
};
