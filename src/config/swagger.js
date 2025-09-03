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
              explorer_level: { type: 'integer' },
              experience_points: { type: 'integer' },
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
              unlock_level: { type: 'integer' },
              is_premium: { type: 'boolean' },
            },
          },
          Quest: {
            type: 'object',
            properties: {
              quest_id: { type: 'integer' },
              user_id: { type: 'integer' },
              quest_title: { type: 'string' },
              quest_description: { type: 'string', nullable: true },
              required_level: { type: 'integer' },
              reward_exp: { type: 'integer' },
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
              latitude: { type: 'number' },
              longitude: { type: 'number' },
              category: { type: 'string', nullable: true },
              is_solo_friendly: { type: 'boolean' },
              description: { type: 'string', nullable: true },
              rating_avg: { type: 'number', nullable: true },
              rating_count: { type: 'integer', nullable: true },
              price_level: { type: 'integer', nullable: true },
              keywords: { type: 'array', items: { type: 'string' } },
              features: { type: 'object', nullable: true },
              opening_hours: { type: 'object', nullable: true },
              updated_at: { type: 'string', format: 'date-time' },
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
      ],
      security: [], // 개별 엔드포인트에서 security 지정
    },
    apis: [
      './src/routes/**/*.js', // 라우터 파일의 JSDoc 읽음
    ],
  };

  const swaggerSpec = swaggerJsdoc(options);
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, { explorer: true }));

  // 원하면 JSON 스펙도 노출
  app.get('/docs.json', (_req, res) => res.json(swaggerSpec));
}
