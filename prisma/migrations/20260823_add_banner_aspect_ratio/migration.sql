-- 주문완료 배너에 비율 필드 추가 (기본 2/1, 315x420 배너는 3/4)
ALTER TABLE "order_complete_banners" ADD COLUMN "aspectRatio" TEXT NOT NULL DEFAULT '2/1';
