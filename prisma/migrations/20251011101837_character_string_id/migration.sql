-- ================================================
-- 1) 새 컬럼 추가 (문자열 기반 PK 및 속성)
-- ================================================
ALTER TABLE "Character"
  ADD COLUMN "id" VARCHAR(50),
  ADD COLUMN "theme" VARCHAR(50),
  ADD COLUMN "gender" VARCHAR(10);

ALTER TABLE "User" ADD COLUMN "current_character_id_new" VARCHAR(50);
ALTER TABLE "UserCharacter" ADD COLUMN "character_id_new" VARCHAR(50);

-- ================================================
-- 2) 기존 캐릭터 데이터에 문자열 ID/속성 매핑
--    👉 모든 기존 캐릭터에 대해 아래 UPDATE를 추가해줘
-- ================================================
-- 예) character_id = 1 → spring_f
UPDATE "Character"
SET "id"='spring_f', "theme"='season', "gender"='female'
WHERE "character_id"=1;

-- 예) character_id = 2 → ghost_m
UPDATE "Character"
SET "id"='ghost_m', "theme"='halloween', "gender"='male'
WHERE "character_id"=2;

-- (여기에 나머지 캐릭터 매핑 줄 추가)
-- UPDATE "Character" SET "id"='...', "theme"='...', "gender"='...' WHERE "character_id"=...;

-- ================================================
-- 2-1) FK 참조 값도 새 문자열로 백필
-- ================================================
UPDATE "User" u
SET "current_character_id_new" = c."id"
FROM "Character" c
WHERE u."current_character_id" = c."character_id";

UPDATE "UserCharacter" uc
SET "character_id_new" = c."id"
FROM "Character" c
WHERE uc."character_id" = c."character_id";

-- ================================================
-- 3) 기존 제약 해제 + PK/FK 전환
-- ================================================
-- FK/PK 드롭 (존재 시에만)
ALTER TABLE "User" DROP CONSTRAINT IF EXISTS "User_current_character_id_fkey";
ALTER TABLE "UserCharacter" DROP CONSTRAINT IF EXISTS "UserCharacter_character_id_fkey";
ALTER TABLE "UserCharacter" DROP CONSTRAINT IF EXISTS "UserCharacter_pkey";

-- Character PK 교체: Int PK → String PK
ALTER TABLE "Character" DROP CONSTRAINT "Character_pkey";
ALTER TABLE "Character" ALTER COLUMN "id" SET NOT NULL;
ALTER TABLE "Character" ADD CONSTRAINT "Character_pkey" PRIMARY KEY ("id");

-- User/UserCharacter의 임시 컬럼 교체
ALTER TABLE "User"          DROP COLUMN "current_character_id";
ALTER TABLE "User"          RENAME COLUMN "current_character_id_new" TO "current_character_id";

ALTER TABLE "UserCharacter" DROP COLUMN "character_id";
ALTER TABLE "UserCharacter" RENAME COLUMN "character_id_new" TO "character_id";

-- 새 FK/PK 재설정
ALTER TABLE "User"
  ADD CONSTRAINT "User_current_character_id_fkey"
  FOREIGN KEY ("current_character_id") REFERENCES "Character"("id") ON DELETE SET NULL;

ALTER TABLE "UserCharacter"
  ADD CONSTRAINT "UserCharacter_pkey" PRIMARY KEY ("user_id","character_id");

ALTER TABLE "UserCharacter"
  ADD CONSTRAINT "UserCharacter_character_id_fkey"
  FOREIGN KEY ("character_id") REFERENCES "Character"("id") ON DELETE CASCADE;

-- 보조 인덱스 복구(있으면 스킵)
CREATE INDEX IF NOT EXISTS "UserCharacter_user_id_idx" ON "UserCharacter"("user_id");
CREATE INDEX IF NOT EXISTS "UserCharacter_character_id_idx" ON "UserCharacter"("character_id");

-- ================================================
-- 4) 더 이상 필요 없는 열 제거
-- ================================================
ALTER TABLE "Character"
  DROP COLUMN "character_id",
  DROP COLUMN "character_name",
  DROP COLUMN "description",
  DROP COLUMN "image_url";
