// src/config/swagger.js
import swaggerJSDoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

const isProd = process.env.NODE_ENV === "production";

const swaggerDefinition = {
  openapi: "3.0.3",
  info: {
    title: process.env.API_TITLE || "Your App API",
    version: process.env.API_VERSION || "0.1.0",
    description: "REST API documentation",
  },
  servers: [
    { url: process.env.API_BASE_URL || "http://localhost:4000", description: "Local" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
      },
    },
    schemas: {
      // 공통 스키마 예시
      User: {
        type: "object",
        properties: {
          id: { type: "string" },
          email: { type: "string", format: "email" }
        },
      },
      AuthRegisterInput: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email", example: "user@example.com" },
          password: { type: "string", example: "1234" }
        }
      },
      AuthLoginInput: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email", example: "user@example.com" },
          password: { type: "string", example: "1234" }
        }
      },
      AuthResponse: {
        type: "object",
        properties: {
          user: { $ref: "#/components/schemas/User" },
          token: { type: "string" }
        }
      }
    }
  },
  security: [], // 기본은 공개, 보호가 필요한 엔드포인트에서만 security 설정
};

const options = {
  definition: swaggerDefinition,
  // JSDoc 주석을 수집할 파일들(glob). 필요 시 경로 추가 가능
  apis: ["./src/routes/*.js", "./src/controllers/*.js"],
};

export const swaggerSpec = swaggerJSDoc(options);

// 앱에 연결하는 헬퍼
export const setupSwagger = (app) => {
  // 프로덕션에서도 열고 싶지 않으면 isProd로 제어
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec, { explorer: true }));
  // JSON 스펙도 공개 (CI/검증용)
  app.get("/docs.json", (_req, res) => res.json(swaggerSpec));
  console.log(`[swagger] Docs on /docs  (json: /docs.json)`);
};
