import multer from 'multer';
import path from 'path';
import fs from 'fs';

// 메시지 도메인 라우터들(sms / franchise-sms / brand-message)이 공유하는 multer 업로드 설정.
// (admin-uploads.ts 와 동일한 구조 — 설정만 모으고 핸들러는 각 라우트에 남긴다)

// MMS 이미지 제약 조건 (sms / franchise-sms 공용)
export const MMS_IMAGE_MAX_SIZE = 200 * 1024; // 200KB
export const MMS_IMAGE_MAX_WIDTH = 1500;      // 1500px
export const MMS_IMAGE_MAX_HEIGHT = 1440;     // 1440px

// 브랜드 메시지 이미지 제약 조건 (카카오 권장)
export const BRAND_MESSAGE_IMAGE_MAX_SIZE = 5 * 1024 * 1024; // 5MB

// 매장 MMS 업로드 디렉토리 설정
export const mmsUploadDir = path.join(process.cwd(), 'uploads', 'mms');
if (!fs.existsSync(mmsUploadDir)) {
  fs.mkdirSync(mmsUploadDir, { recursive: true });
}

// 프랜차이즈 MMS 업로드 디렉토리 설정
export const franchiseMmsUploadDir = path.join(process.cwd(), 'uploads', 'franchise-mms');
if (!fs.existsSync(franchiseMmsUploadDir)) {
  fs.mkdirSync(franchiseMmsUploadDir, { recursive: true });
}

// 브랜드 메시지 업로드 디렉토리 설정
export const brandMessageUploadDir = path.join(process.cwd(), 'uploads', 'brand-message');
if (!fs.existsSync(brandMessageUploadDir)) {
  fs.mkdirSync(brandMessageUploadDir, { recursive: true });
}

// Multer 설정 - MMS 이미지용 (메모리 스토리지 사용, 검증 후 저장; sms / franchise-sms 공용)
export const mmsImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MMS_IMAGE_MAX_SIZE },
  fileFilter: (req, file, cb) => {
    // JPG 확장자만 허용
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.jpg' && ext !== '.jpeg') {
      cb(new Error('JPG 파일만 업로드 가능합니다.'));
      return;
    }
    if (!file.mimetype.startsWith('image/jpeg')) {
      cb(new Error('JPG 이미지 파일만 업로드 가능합니다.'));
      return;
    }
    cb(null, true);
  },
});

// Multer 설정 - 브랜드 메시지 이미지용 (JPG/PNG, 5MB)
export const brandMessageImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: BRAND_MESSAGE_IMAGE_MAX_SIZE },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!['.jpg', '.jpeg', '.png'].includes(ext)) {
      cb(new Error('JPG 또는 PNG 파일만 업로드 가능합니다.'));
      return;
    }
    if (!file.mimetype.startsWith('image/')) {
      cb(new Error('이미지 파일만 업로드 가능합니다.'));
      return;
    }
    cb(null, true);
  },
});
