// 특성화(Characterization) 테스트 — sms / franchise-sms / brand-message 이미지 업로드 경계
//
// 목적: 세 라우트 파일이 각각 정의하는 multer(메모리 스토리지) + sharp 검증 + 로컬 저장
// 파이프라인을 공용 모듈로 중복 제거하기 전에, 현재 동작(응답 바디 + 저장 경로 + 삭제/권한)을
// 있는 그대로 고정한다. 버그로 보이는 동작도 현재 동작 그대로 단언한다.
//
// 외부 경계: SOLAPI 업로드만 mock 한다.
// - sms / franchise-sms: `new SolapiMessageService(...).uploadFile(filepath, 'MMS')` → 'solapi' 패키지 mock
// - brand-message: `getSolapiService().uploadImage(filepath)` → services/solapi-instance.js mock
// multer / sharp / fs 파이프라인은 실제 구현을 사용한다.
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';

const solapiMock = vi.hoisted(() => ({
  uploadFileCalls: [] as Array<{ filepath: string; type: string }>,
  uploadImageCalls: [] as string[],
}));

// sms / franchise-sms 가 사용하는 SolapiMessageService.uploadFile mock
vi.mock('solapi', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  class MockSolapiMessageService {
    constructor(_apiKey: string, _apiSecret: string) {}
    async uploadFile(filepath: string, type: string) {
      solapiMock.uploadFileCalls.push({ filepath, type });
      return { fileId: 'FILE-MMS-1' };
    }
  }
  return { ...original, SolapiMessageService: MockSolapiMessageService };
});

// brand-message 가 사용하는 getSolapiService().uploadImage mock
vi.mock('../../services/solapi-instance.js', async (importOriginal) => {
  const original = await importOriginal<Record<string, unknown>>();
  return {
    ...original,
    getSolapiService: () => ({
      uploadImage: async (filepath: string) => {
        solapiMock.uploadImageCalls.push(filepath);
        return { success: true, fileId: 'FILE-BM-1' };
      },
    }),
  };
});

import { app } from '../../app.js';

const STORE_ID = 'msgup-store-1';
const FRANCHISE_ID = 'msgup-fr-1';

let storeToken: string;
let franchiseToken: string;

function storeAuth() {
  return { Authorization: `Bearer ${storeToken}` };
}
function frAuth() {
  return { Authorization: `Bearer ${franchiseToken}` };
}

// 업로드 디렉토리 (라우트 구현과 동일한 규칙)
const mmsDir = path.join(process.cwd(), 'uploads', 'mms');
const franchiseMmsDir = path.join(process.cwd(), 'uploads', 'franchise-mms');
const brandMessageDir = path.join(process.cwd(), 'uploads', 'brand-message');

// 테스트 중 생성된 파일 추적 → afterEach 정리
const createdFiles: string[] = [];

function trackUploaded(dir: string, filename: string): string {
  const filepath = path.join(dir, filename);
  createdFiles.push(filepath);
  return filepath;
}

async function makeJpeg(width = 10, height = 10): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 100, b: 50 } },
  })
    .jpeg()
    .toBuffer();
}

async function makePng(width = 10, height = 10): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 50, g: 100, b: 200 } },
  })
    .png()
    .toBuffer();
}

beforeAll(async () => {
  process.env.SOLAPI_API_KEY = process.env.SOLAPI_API_KEY || 'test-key';
  process.env.SOLAPI_API_SECRET = process.env.SOLAPI_API_SECRET || 'test-secret';

  const secret = process.env.JWT_SECRET!;
  storeToken = jwt.sign(
    { id: 'staff-up-1', email: 'up@char.test', storeId: STORE_ID, role: 'OWNER' },
    secret
  );
  franchiseToken = jwt.sign(
    { id: 'fruser-up-1', email: 'frup@char.test', franchiseId: FRANCHISE_ID, role: 'MANAGER', isFranchise: true },
    secret
  );
});

afterEach(async () => {
  solapiMock.uploadFileCalls.length = 0;
  solapiMock.uploadImageCalls.length = 0;
  for (const f of createdFiles) {
    await fs.promises.unlink(f).catch(() => {});
  }
  createdFiles.length = 0;
  // 혹시 추적을 놓친 테스트 아이디 프리픽스 파일 정리
  for (const dir of [mmsDir, franchiseMmsDir, brandMessageDir]) {
    if (!fs.existsSync(dir)) continue;
    for (const name of await fs.promises.readdir(dir)) {
      if (name.startsWith(STORE_ID) || name.startsWith(FRANCHISE_ID)) {
        await fs.promises.unlink(path.join(dir, name)).catch(() => {});
      }
    }
  }
});

describe('POST /api/sms/upload-image (매장 MMS)', () => {
  it('인증 없으면 401', async () => {
    const res = await request(app).post('/api/sms/upload-image');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: '인증 토큰이 필요합니다.' });
  });

  it('JPG 업로드 성공 — 응답 형태 + uploads/mms 저장 + SOLAPI MMS 업로드 호출', async () => {
    const jpeg = await makeJpeg(12, 8);
    const res = await request(app)
      .post('/api/sms/upload-image')
      .set(storeAuth())
      .attach('image', jpeg, 'test.jpg');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      imageUrl: expect.stringMatching(new RegExp(`^/uploads/mms/${STORE_ID}_\\d+\\.jpg$`)),
      filename: expect.stringMatching(new RegExp(`^${STORE_ID}_\\d+\\.jpg$`)),
      imageId: 'FILE-MMS-1',
      width: 12,
      height: 8,
      size: jpeg.length,
    });
    expect(res.body.imageUrl).toBe(`/uploads/mms/${res.body.filename}`);

    const filepath = trackUploaded(mmsDir, res.body.filename);
    expect(fs.existsSync(filepath)).toBe(true);
    expect((await fs.promises.readFile(filepath)).equals(jpeg)).toBe(true);

    expect(solapiMock.uploadFileCalls).toEqual([{ filepath, type: 'MMS' }]);
  });

  it('파일 없이 요청하면 400', async () => {
    const res = await request(app).post('/api/sms/upload-image').set(storeAuth());
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: '이미지 파일이 필요합니다.' });
  });

  it('PNG(비 JPG)는 fileFilter 에서 거부 → 앱 에러 핸들러 500', async () => {
    const png = await makePng();
    const res = await request(app)
      .post('/api/sms/upload-image')
      .set(storeAuth())
      .attach('image', png, 'test.png');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal Server Error' });
  });

  it('가로 1500px 초과 이미지는 400', async () => {
    const wide = await makeJpeg(1501, 4);
    const res = await request(app)
      .post('/api/sms/upload-image')
      .set(storeAuth())
      .attach('image', wide, 'wide.jpg');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: '이미지 가로 크기가 너무 큽니다. (최대 1500px, 현재 1501px)',
      width: 1501,
      maxWidth: 1500,
    });
  });

  it('DELETE /api/sms/delete-image — 본인 파일 삭제 성공 / 타 매장 파일 403 / 무인증 401', async () => {
    // 업로드 후 삭제
    const jpeg = await makeJpeg();
    const up = await request(app)
      .post('/api/sms/upload-image')
      .set(storeAuth())
      .attach('image', jpeg, 'del.jpg');
    expect(up.status).toBe(200);
    const filepath = trackUploaded(mmsDir, up.body.filename);
    expect(fs.existsSync(filepath)).toBe(true);

    const del = await request(app)
      .delete('/api/sms/delete-image')
      .set(storeAuth())
      .send({ filename: up.body.filename });
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ success: true });
    expect(fs.existsSync(filepath)).toBe(false);

    // 파일명 누락 → 400
    const noName = await request(app).delete('/api/sms/delete-image').set(storeAuth()).send({});
    expect(noName.status).toBe(400);
    expect(noName.body).toEqual({ error: '파일명이 필요합니다.' });

    // 다른 매장 프리픽스 → 403
    const forbidden = await request(app)
      .delete('/api/sms/delete-image')
      .set(storeAuth())
      .send({ filename: 'other-store_123.jpg' });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body).toEqual({ error: '권한이 없습니다.' });

    // 무인증 → 401
    const unauth = await request(app).delete('/api/sms/delete-image').send({ filename: 'x.jpg' });
    expect(unauth.status).toBe(401);
  });
});

describe('POST /api/franchise/sms/upload-image (프랜차이즈 MMS)', () => {
  it('인증 없으면 401 / 매장 토큰이면 401', async () => {
    const res = await request(app).post('/api/franchise/sms/upload-image');
    expect(res.status).toBe(401);

    const storeTokenRes = await request(app)
      .post('/api/franchise/sms/upload-image')
      .set(storeAuth());
    expect(storeTokenRes.status).toBe(401);
    expect(storeTokenRes.body).toEqual({ error: '프랜차이즈 계정이 아닙니다.' });
  });

  it('JPG 업로드 성공 — 응답 형태 + uploads/franchise-mms 저장 + SOLAPI MMS 업로드 호출', async () => {
    const jpeg = await makeJpeg(20, 15);
    const res = await request(app)
      .post('/api/franchise/sms/upload-image')
      .set(frAuth())
      .attach('image', jpeg, 'fr.jpg');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      imageUrl: expect.stringMatching(new RegExp(`^/uploads/franchise-mms/${FRANCHISE_ID}_\\d+\\.jpg$`)),
      filename: expect.stringMatching(new RegExp(`^${FRANCHISE_ID}_\\d+\\.jpg$`)),
      imageId: 'FILE-MMS-1',
      width: 20,
      height: 15,
      size: jpeg.length,
    });

    const filepath = trackUploaded(franchiseMmsDir, res.body.filename);
    expect(fs.existsSync(filepath)).toBe(true);
    expect(solapiMock.uploadFileCalls).toEqual([{ filepath, type: 'MMS' }]);
  });

  it('세로 1440px 초과 이미지는 400', async () => {
    const tall = await makeJpeg(4, 1441);
    const res = await request(app)
      .post('/api/franchise/sms/upload-image')
      .set(frAuth())
      .attach('image', tall, 'tall.jpg');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: '이미지 세로 크기가 너무 큽니다. (최대 1440px, 현재 1441px)',
      height: 1441,
      maxHeight: 1440,
    });
  });

  it('DELETE /api/franchise/sms/delete-image — 삭제 성공 / 타 프랜차이즈 파일 403 / 무인증 401', async () => {
    const jpeg = await makeJpeg();
    const up = await request(app)
      .post('/api/franchise/sms/upload-image')
      .set(frAuth())
      .attach('image', jpeg, 'del.jpg');
    expect(up.status).toBe(200);
    const filepath = trackUploaded(franchiseMmsDir, up.body.filename);

    const del = await request(app)
      .delete('/api/franchise/sms/delete-image')
      .set(frAuth())
      .send({ filename: up.body.filename });
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ success: true });
    expect(fs.existsSync(filepath)).toBe(false);

    const forbidden = await request(app)
      .delete('/api/franchise/sms/delete-image')
      .set(frAuth())
      .send({ filename: 'other-fr_123.jpg' });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body).toEqual({ error: '권한이 없습니다.' });

    const unauth = await request(app).delete('/api/franchise/sms/delete-image').send({ filename: 'x.jpg' });
    expect(unauth.status).toBe(401);
  });
});

describe('POST /api/brand-message/upload-image (브랜드 메시지)', () => {
  it('인증 없으면 401', async () => {
    const res = await request(app).post('/api/brand-message/upload-image');
    expect(res.status).toBe(401);
  });

  it('PNG 업로드 성공 — 확장자 유지 + uploads/brand-message 저장 + getSolapiService().uploadImage 호출', async () => {
    const png = await makePng(16, 9);
    const res = await request(app)
      .post('/api/brand-message/upload-image')
      .set(storeAuth())
      .attach('image', png, 'brand.png');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      imageUrl: expect.stringMatching(new RegExp(`^/uploads/brand-message/${STORE_ID}_\\d+\\.png$`)),
      filename: expect.stringMatching(new RegExp(`^${STORE_ID}_\\d+\\.png$`)),
      imageId: 'FILE-BM-1',
      width: 16,
      height: 9,
      size: png.length,
    });

    const filepath = trackUploaded(brandMessageDir, res.body.filename);
    expect(fs.existsSync(filepath)).toBe(true);
    expect((await fs.promises.readFile(filepath)).equals(png)).toBe(true);
    expect(solapiMock.uploadImageCalls).toEqual([filepath]);
  });

  it('JPG 업로드도 성공 (확장자 .jpg 유지)', async () => {
    const jpeg = await makeJpeg();
    const res = await request(app)
      .post('/api/brand-message/upload-image')
      .set(storeAuth())
      .attach('image', jpeg, 'brand.jpg');
    expect(res.status).toBe(200);
    expect(res.body.filename).toMatch(new RegExp(`^${STORE_ID}_\\d+\\.jpg$`));
    trackUploaded(brandMessageDir, res.body.filename);
  });

  it('GIF(비 JPG/PNG)는 fileFilter 에서 거부 → 앱 에러 핸들러 500', async () => {
    const png = await makePng();
    const res = await request(app)
      .post('/api/brand-message/upload-image')
      .set(storeAuth())
      .attach('image', png, 'bad.gif');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'Internal Server Error' });
  });

  it('DELETE /api/brand-message/delete-image — 삭제 성공 / 타 매장 파일 403 / 무인증 401', async () => {
    const png = await makePng();
    const up = await request(app)
      .post('/api/brand-message/upload-image')
      .set(storeAuth())
      .attach('image', png, 'del.png');
    expect(up.status).toBe(200);
    const filepath = trackUploaded(brandMessageDir, up.body.filename);

    const del = await request(app)
      .delete('/api/brand-message/delete-image')
      .set(storeAuth())
      .send({ filename: up.body.filename });
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ success: true });
    expect(fs.existsSync(filepath)).toBe(false);

    const forbidden = await request(app)
      .delete('/api/brand-message/delete-image')
      .set(storeAuth())
      .send({ filename: 'other-store_123.png' });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body).toEqual({ error: '권한이 없습니다.' });

    const unauth = await request(app).delete('/api/brand-message/delete-image').send({ filename: 'x.png' });
    expect(unauth.status).toBe(401);
  });
});
