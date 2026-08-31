# 백필 매핑 스냅샷 (2026-08-27)

`scripts/backfill-store-link-ids.ts` 입력으로 사용한 slug→주문서비스 매장 ID 매핑.
prod 반영 완료분(1차 979 + 2차 15 = 994건)의 원본이며, 사고 시 재백필용.
재추출 방법: V2 `internal.store_settings.crm_store_slug`/`crm_redirect_url` 역파싱 + V1 `tag_here.crm.redirect_url` 역파싱.

⚠️ 이 브랜치(feat/store-link-ids)가 main 에 머지되기 전에 다른 변경이 배포되면
schema.prisma 에 v1StoreId/v2StoreId/isHitejinro 가 없어 `prisma db push` 가
드리프트를 드롭하려다 빌드가 실패한다(또는 --accept-data-loss 단계에서 컬럼 드롭).
→ 이 브랜치를 최우선으로 머지할 것.
