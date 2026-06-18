import multer from 'multer';
import path from 'path';
import fs from 'fs';

// 어드민 도메인 라우터들이 공유하는 multer 업로드 설정.

// 배너 이미지 업로드 디렉토리 설정
const bannerUploadDir = path.join(process.cwd(), 'uploads', 'banners');
if (!fs.existsSync(bannerUploadDir)) {
  fs.mkdirSync(bannerUploadDir, { recursive: true });
}

// 스토어 상품 이미지 업로드 디렉토리 설정
const productUploadDir = path.join(process.cwd(), 'uploads', 'products');
if (!fs.existsSync(productUploadDir)) {
  fs.mkdirSync(productUploadDir, { recursive: true });
}

// Multer 설정 - 배너 이미지용
const bannerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, bannerUploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `banner-${uniqueSuffix}${ext}`);
  },
});

export const bannerUpload = multer({
  storage: bannerStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      cb(new Error('JPG, PNG, GIF, WebP 파일만 업로드 가능합니다.'));
      return;
    }
    cb(null, true);
  },
});

// Multer 설정 - 스토어 상품 이미지용
const productStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, productUploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `product-${uniqueSuffix}${ext}`);
  },
});

export const productUpload = multer({
  storage: productStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      cb(new Error('JPG, PNG, GIF, WebP 파일만 업로드 가능합니다.'));
      return;
    }
    cb(null, true);
  },
});

// Multer 설정 - 배너 미디어(이미지/영상)용
const bannerMediaStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, bannerUploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname).toLowerCase();
    const prefix = file.mimetype.startsWith('video/') ? 'banner-video' : 'banner';
    cb(null, `${prefix}-${uniqueSuffix}${ext}`);
  },
});

export const bannerMediaUpload = multer({
  storage: bannerMediaStorage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB (영상용)
  fileFilter: (req, file, cb) => {
    const allowedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const allowedVideoTypes = ['video/mp4', 'video/webm'];
    const allowedTypes = [...allowedImageTypes, ...allowedVideoTypes];
    if (!allowedTypes.includes(file.mimetype)) {
      cb(new Error('JPG, PNG, GIF, WebP, MP4, WebM 파일만 업로드 가능합니다.'));
      return;
    }
    cb(null, true);
  },
});

// Multer 설정 - 프랜차이즈 로고용 (메모리 저장)
export const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.mimetype)) {
      cb(new Error('JPG, PNG, GIF, WebP 파일만 업로드 가능합니다.'));
      return;
    }
    cb(null, true);
  },
});

// Multer 설정 - 기업광고 쿠폰 코드 파일(.txt/.csv)용
export const couponCodeUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.txt' && ext !== '.csv') {
      cb(new Error('.txt 또는 .csv 파일만 업로드 가능합니다.'));
      return;
    }
    cb(null, true);
  },
});
