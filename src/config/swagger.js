// src/config/swagger.js
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';

export function initSwagger(app) {
  const options = {
    definition: {
      openapi: '3.0.3',
      info: {
        title: 'SOLOLIFE API',
        version: '1.0.0',
        description: 'SOLOLIFE REST API (Express + Prisma)',
      },
      servers: [
        { url: process.env.API_BASE_URL || 'http://localhost:4000', description: 'Local' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
        schemas: {
          // ===== Common Schemas =====
          PaginationMeta: {
            type: 'object',
            properties: {
              page: { type: 'integer' },
              limit: { type: 'integer' },
              total: { type: 'integer' },
            },
          },
          ApiError: {
            type: 'object',
            properties: {
              error: { type: 'string' },
              meta: { type: 'object', nullable: true },
            },
          },

          // ===== Domain Schemas (요약 버전) =====
          User: {
            type: 'object',
            properties: {
              user_id: { type: 'integer' },
              username: { type: 'string' },
              email: { type: 'string', format: 'email' },
              // 아래 두 필드는 현재 Prisma 모델엔 없으면 제거해도 됨
              explorer_level: { type: 'integer', nullable: true },
              experience_points: { type: 'integer', nullable: true },
              is_public_profile: { type: 'boolean' },
              current_character_id: { type: 'integer', nullable: true },
              created_at: { type: 'string', format: 'date-time' },
            },
          },

          AuthRegisterBody: {
            type: 'object',
            required: ['username', 'email', 'password'],
            properties: {
              username: { type: 'string' },
              email: { type: 'string', format: 'email' },
              password: { type: 'string', format: 'password' },
            },
          },
          AuthLoginBody: {
            type: 'object',
            required: ['emailOrUsername', 'password'],
            properties: {
              emailOrUsername: { type: 'string' },
              password: { type: 'string', format: 'password' },
            },
          },
          AuthLoginResponse: {
            type: 'object',
            properties: {
              token: { type: 'string' },
              user: { $ref: '#/components/schemas/User' },
            },
          },

          Character: {
            type: 'object',
            properties: {
              character_id: { type: 'integer' },
              character_name: { type: 'string' },
              description: { type: 'string', nullable: true },
              image_url: { type: 'string', nullable: true },
              unlock_level: { type: 'integer', nullable: true }, // Prisma에 없으면 nullable
              is_premium: { type: 'boolean', nullable: true },   // Prisma에 없으면 nullable
            },
          },

          // ✅ 추가: Asset 스키마
          Asset: {
            type: 'object',
            properties: {
              asset_id: { type: 'integer', example: 201 },
              name: { type: 'string', example: '야전 텐트' },
              image_url: { type: 'string', nullable: true, example: 'https://cdn.example.com/assets/tent.png' },
            },
          },

          Quest: {
            type: 'object',
            properties: {
              quest_id: { type: 'integer' },
              user_id: { type: 'integer' },
              quest_title: { type: 'string' },
              quest_description: { type: 'string', nullable: true },
              required_level: { type: 'integer', nullable: true },
              reward_exp: { type: 'integer', nullable: true },
              is_main_quest: { type: 'boolean' },
              is_completed: { type: 'boolean' },
            },
          },

          Location: {
            type: 'object',
            properties: {
              location_id: { type: 'integer' },
              location_name: { type: 'string' },
              address: { type: 'string', nullable: true },
              latitude: { type: 'number', nullable: true },
              longitude: { type: 'number', nullable: true },
              category: { type: 'string', nullable: true },
              is_solo_friendly: { type: 'boolean' },
              description: { type: 'string', nullable: true },
              rating_avg: { type: 'number', nullable: true },
              rating_count: { type: 'integer', nullable: true },
              price_level: { type: 'integer', nullable: true },
              keywords: { type: 'array', items: { type: 'string' } },
              features: { type: 'object', nullable: true },
              opening_hours: { type: 'object', nullable: true },
              updated_at: { type: 'string', format: 'date-time', nullable: true },
            },
          },

          Journey: {
            type: 'object',
            properties: {
              journey_id: { type: 'integer' },
              user_id: { type: 'integer' },
              journey_title: { type: 'string' },
              created_at: { type: 'string', format: 'date-time' },
            },
          },

          JourneyLocation: {
            type: 'object',
            properties: {
              journey_location_id: { type: 'integer' },
              journey_id: { type: 'integer' },
              location_id: { type: 'integer' },
              sequence_number: { type: 'integer' },
            },
          },

          LogbookEntry: {
            type: 'object',
            properties: {
              logbook_id: { type: 'integer' },
              user_id: { type: 'integer' },
              journey_id: { type: 'integer', nullable: true },
              location_id: { type: 'integer', nullable: true },
              entry_title: { type: 'string' },
              entry_content: { type: 'string', nullable: true },
              is_public: { type: 'boolean' },
              created_at: { type: 'string', format: 'date-time' },
              image_urls: { type: 'array', items: { type: 'string' }, nullable: true },
            },
          },
        },
      },

      tags: [
        { name: 'Auth' },
        { name: 'Users' },
        { name: 'Characters' },
        { name: 'Quests' },
        { name: 'Locations' },
        { name: 'Journeys' },
        { name: 'Logbooks' },
        { name: 'Recommendations' },
        { name: 'Assets' }, // ✅ 추가
      ],

      security: [], // 개별 엔드포인트에서 security 지정
    },

    apis: [
      './src/routes/**/*.js', // 라우터 파일의 JSDoc 읽음
      // 필요시 컴포넌트 전용 주석 파일도 추가 가능:
      // './src/docs/swagger.components.js',
    ],
  };

  const swaggerSpec = swaggerJsdoc(options);
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { explorer: true }));

  // 스펙 JSON 노출
  app.get('/docs.json', (_req, res) => res.json(swaggerSpec));
}
