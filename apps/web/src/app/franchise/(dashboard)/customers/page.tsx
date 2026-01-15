'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Filter,
  ChevronDown,
  X,
  Users,
  Plus,
  Trash2,
  Calendar,
  MapPin,
  UserCircle,
  Hash,
  RefreshCw,
  Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

// Demo customers data (100명)
const DEMO_CUSTOMERS = [
  { id: '1', name: '김*호', phone: '010-****-5678', visitCount: 12, lastVisit: '2025-01-12', preferredCategories: ['한식', '구이'], region: '서울 강남구', age: '30대', gender: 'MALE' },
  { id: '2', name: '이*영', phone: '010-****-1234', visitCount: 8, lastVisit: '2025-01-10', preferredCategories: ['한식'], region: '서울 마포구', age: '20대', gender: 'FEMALE' },
  { id: '3', name: '박*진', phone: '010-****-9012', visitCount: 15, lastVisit: '2025-01-14', preferredCategories: ['한식', '일식'], region: '서울 강남구', age: '40대', gender: 'MALE' },
  { id: '4', name: '최*아', phone: '010-****-3456', visitCount: 6, lastVisit: '2025-01-08', preferredCategories: ['카페'], region: '경기 성남시', age: '20대', gender: 'FEMALE' },
  { id: '5', name: '정*수', phone: '010-****-7890', visitCount: 22, lastVisit: '2025-01-13', preferredCategories: ['한식', '구이', '일식'], region: '서울 송파구', age: '50대', gender: 'MALE' },
  { id: '6', name: '강*미', phone: '010-****-2345', visitCount: 4, lastVisit: '2025-01-05', preferredCategories: ['양식'], region: '인천 남동구', age: '30대', gender: 'FEMALE' },
  { id: '7', name: '윤*현', phone: '010-****-6789', visitCount: 18, lastVisit: '2025-01-14', preferredCategories: ['한식', '중식'], region: '부산 부산진구', age: '40대', gender: 'MALE' },
  { id: '8', name: '임*서', phone: '010-****-0123', visitCount: 9, lastVisit: '2025-01-11', preferredCategories: ['카페', '디저트'], region: '서울 서대문구', age: '20대', gender: 'FEMALE' },
  { id: '9', name: '한*우', phone: '010-****-4567', visitCount: 31, lastVisit: '2025-01-14', preferredCategories: ['한식', '구이'], region: '대구 중구', age: '60대', gender: 'MALE' },
  { id: '10', name: '오*빈', phone: '010-****-8901', visitCount: 7, lastVisit: '2025-01-09', preferredCategories: ['일식'], region: '광주 서구', age: '30대', gender: 'FEMALE' },
  { id: '11', name: '서*준', phone: '010-****-2346', visitCount: 14, lastVisit: '2025-01-13', preferredCategories: ['한식', '양식'], region: '대전 서구', age: '30대', gender: 'MALE' },
  { id: '12', name: '신*은', phone: '010-****-6780', visitCount: 5, lastVisit: '2025-01-07', preferredCategories: ['카페'], region: '울산 남구', age: '20대', gender: 'FEMALE' },
  { id: '13', name: '권*민', phone: '010-****-0124', visitCount: 11, lastVisit: '2025-01-12', preferredCategories: ['한식', '구이'], region: '경기 수원시', age: '40대', gender: 'MALE' },
  { id: '14', name: '황*지', phone: '010-****-4568', visitCount: 3, lastVisit: '2025-01-04', preferredCategories: ['디저트'], region: '제주 제주시', age: '20대', gender: 'FEMALE' },
  { id: '15', name: '안*석', phone: '010-****-8902', visitCount: 25, lastVisit: '2025-01-14', preferredCategories: ['한식', '중식', '구이'], region: '서울 용산구', age: '50대', gender: 'MALE' },
  { id: '16', name: '송*라', phone: '010-****-2347', visitCount: 8, lastVisit: '2025-01-10', preferredCategories: ['일식', '카페'], region: '서울 광진구', age: '30대', gender: 'FEMALE' },
  { id: '17', name: '전*혁', phone: '010-****-6781', visitCount: 19, lastVisit: '2025-01-13', preferredCategories: ['한식'], region: '충남 천안시', age: '40대', gender: 'MALE' },
  { id: '18', name: '홍*연', phone: '010-****-0125', visitCount: 6, lastVisit: '2025-01-06', preferredCategories: ['양식', '카페'], region: '충북 청주시', age: '20대', gender: 'FEMALE' },
  { id: '19', name: '유*훈', phone: '010-****-4569', visitCount: 13, lastVisit: '2025-01-11', preferredCategories: ['한식', '구이'], region: '전북 전주시', age: '50대', gender: 'MALE' },
  { id: '20', name: '조*희', phone: '010-****-8903', visitCount: 10, lastVisit: '2025-01-12', preferredCategories: ['디저트', '카페'], region: '경남 창원시', age: '30대', gender: 'FEMALE' },
  { id: '21', name: '배*철', phone: '010-****-1357', visitCount: 16, lastVisit: '2025-01-13', preferredCategories: ['한식', '구이'], region: '서울 종로구', age: '40대', gender: 'MALE' },
  { id: '22', name: '노*정', phone: '010-****-2468', visitCount: 7, lastVisit: '2025-01-09', preferredCategories: ['카페', '디저트'], region: '서울 성북구', age: '20대', gender: 'FEMALE' },
  { id: '23', name: '하*근', phone: '010-****-3579', visitCount: 23, lastVisit: '2025-01-14', preferredCategories: ['한식', '일식'], region: '경기 고양시', age: '50대', gender: 'MALE' },
  { id: '24', name: '양*윤', phone: '010-****-4680', visitCount: 4, lastVisit: '2025-01-05', preferredCategories: ['양식'], region: '경기 용인시', age: '30대', gender: 'FEMALE' },
  { id: '25', name: '손*기', phone: '010-****-5791', visitCount: 28, lastVisit: '2025-01-14', preferredCategories: ['한식', '중식', '구이'], region: '부산 해운대구', age: '60대', gender: 'MALE' },
  { id: '26', name: '백*나', phone: '010-****-6802', visitCount: 9, lastVisit: '2025-01-10', preferredCategories: ['일식', '카페'], region: '서울 강서구', age: '20대', gender: 'FEMALE' },
  { id: '27', name: '남*태', phone: '010-****-7913', visitCount: 17, lastVisit: '2025-01-12', preferredCategories: ['한식'], region: '대구 수성구', age: '40대', gender: 'MALE' },
  { id: '28', name: '심*주', phone: '010-****-8024', visitCount: 5, lastVisit: '2025-01-06', preferredCategories: ['디저트', '카페'], region: '광주 북구', age: '20대', gender: 'FEMALE' },
  { id: '29', name: '곽*성', phone: '010-****-9135', visitCount: 21, lastVisit: '2025-01-13', preferredCategories: ['한식', '구이'], region: '인천 연수구', age: '50대', gender: 'MALE' },
  { id: '30', name: '문*린', phone: '010-****-0246', visitCount: 11, lastVisit: '2025-01-11', preferredCategories: ['양식', '일식'], region: '서울 동작구', age: '30대', gender: 'FEMALE' },
  { id: '31', name: '장*원', phone: '010-****-1358', visitCount: 14, lastVisit: '2025-01-12', preferredCategories: ['한식', '중식'], region: '경기 안양시', age: '40대', gender: 'MALE' },
  { id: '32', name: '류*하', phone: '010-****-2469', visitCount: 6, lastVisit: '2025-01-07', preferredCategories: ['카페'], region: '서울 노원구', age: '20대', gender: 'FEMALE' },
  { id: '33', name: '차*용', phone: '010-****-3570', visitCount: 32, lastVisit: '2025-01-14', preferredCategories: ['한식', '구이', '일식'], region: '부산 사하구', age: '60대', gender: 'MALE' },
  { id: '34', name: '구*선', phone: '010-****-4681', visitCount: 8, lastVisit: '2025-01-08', preferredCategories: ['디저트'], region: '대전 유성구', age: '30대', gender: 'FEMALE' },
  { id: '35', name: '민*재', phone: '010-****-5792', visitCount: 19, lastVisit: '2025-01-13', preferredCategories: ['한식'], region: '울산 중구', age: '50대', gender: 'MALE' },
  { id: '36', name: '추*예', phone: '010-****-6803', visitCount: 3, lastVisit: '2025-01-03', preferredCategories: ['카페', '양식'], region: '경기 부천시', age: '20대', gender: 'FEMALE' },
  { id: '37', name: '도*환', phone: '010-****-7914', visitCount: 15, lastVisit: '2025-01-11', preferredCategories: ['한식', '구이'], region: '충남 아산시', age: '40대', gender: 'MALE' },
  { id: '38', name: '성*림', phone: '010-****-8025', visitCount: 10, lastVisit: '2025-01-10', preferredCategories: ['일식', '디저트'], region: '서울 은평구', age: '30대', gender: 'FEMALE' },
  { id: '39', name: '우*범', phone: '010-****-9136', visitCount: 26, lastVisit: '2025-01-14', preferredCategories: ['한식', '중식'], region: '경북 포항시', age: '50대', gender: 'MALE' },
  { id: '40', name: '탁*솔', phone: '010-****-0247', visitCount: 7, lastVisit: '2025-01-09', preferredCategories: ['카페'], region: '전남 여수시', age: '20대', gender: 'FEMALE' },
  { id: '41', name: '봉*일', phone: '010-****-1359', visitCount: 20, lastVisit: '2025-01-13', preferredCategories: ['한식', '구이'], region: '서울 관악구', age: '40대', gender: 'MALE' },
  { id: '42', name: '진*빈', phone: '010-****-2460', visitCount: 12, lastVisit: '2025-01-12', preferredCategories: ['양식', '카페'], region: '경기 의정부시', age: '30대', gender: 'FEMALE' },
  { id: '43', name: '엄*찬', phone: '010-****-3571', visitCount: 29, lastVisit: '2025-01-14', preferredCategories: ['한식', '일식', '구이'], region: '부산 동래구', age: '60대', gender: 'MALE' },
  { id: '44', name: '표*경', phone: '010-****-4682', visitCount: 4, lastVisit: '2025-01-04', preferredCategories: ['디저트'], region: '인천 계양구', age: '20대', gender: 'FEMALE' },
  { id: '45', name: '길*완', phone: '010-****-5793', visitCount: 18, lastVisit: '2025-01-12', preferredCategories: ['한식'], region: '대구 달서구', age: '50대', gender: 'MALE' },
  { id: '46', name: '변*담', phone: '010-****-6804', visitCount: 9, lastVisit: '2025-01-10', preferredCategories: ['카페', '일식'], region: '서울 중랑구', age: '30대', gender: 'FEMALE' },
  { id: '47', name: '석*욱', phone: '010-****-7915', visitCount: 24, lastVisit: '2025-01-13', preferredCategories: ['한식', '구이'], region: '광주 광산구', age: '40대', gender: 'MALE' },
  { id: '48', name: '맹*화', phone: '010-****-8026', visitCount: 6, lastVisit: '2025-01-06', preferredCategories: ['양식', '디저트'], region: '경기 안산시', age: '20대', gender: 'FEMALE' },
  { id: '49', name: '피*혁', phone: '010-****-9137', visitCount: 33, lastVisit: '2025-01-14', preferredCategories: ['한식', '중식', '구이'], region: '충북 충주시', age: '60대', gender: 'MALE' },
  { id: '50', name: '금*슬', phone: '010-****-0248', visitCount: 11, lastVisit: '2025-01-11', preferredCategories: ['카페'], region: '서울 금천구', age: '20대', gender: 'FEMALE' },
  { id: '51', name: '방*준', phone: '010-****-1360', visitCount: 16, lastVisit: '2025-01-12', preferredCategories: ['한식', '일식'], region: '경남 김해시', age: '40대', gender: 'MALE' },
  { id: '52', name: '천*율', phone: '010-****-2461', visitCount: 8, lastVisit: '2025-01-08', preferredCategories: ['디저트', '카페'], region: '서울 도봉구', age: '30대', gender: 'FEMALE' },
  { id: '53', name: '설*우', phone: '010-****-3572', visitCount: 27, lastVisit: '2025-01-14', preferredCategories: ['한식', '구이'], region: '전북 익산시', age: '50대', gender: 'MALE' },
  { id: '54', name: '마*인', phone: '010-****-4683', visitCount: 5, lastVisit: '2025-01-05', preferredCategories: ['양식'], region: '경기 시흥시', age: '20대', gender: 'FEMALE' },
  { id: '55', name: '제*동', phone: '010-****-5794', visitCount: 22, lastVisit: '2025-01-13', preferredCategories: ['한식', '중식'], region: '부산 북구', age: '40대', gender: 'MALE' },
  { id: '56', name: '빈*아', phone: '010-****-6805', visitCount: 13, lastVisit: '2025-01-11', preferredCategories: ['카페', '일식'], region: '대전 동구', age: '30대', gender: 'FEMALE' },
  { id: '57', name: '공*건', phone: '010-****-7916', visitCount: 30, lastVisit: '2025-01-14', preferredCategories: ['한식', '구이', '일식'], region: '서울 영등포구', age: '60대', gender: 'MALE' },
  { id: '58', name: '염*비', phone: '010-****-8027', visitCount: 7, lastVisit: '2025-01-07', preferredCategories: ['디저트'], region: '인천 부평구', age: '20대', gender: 'FEMALE' },
  { id: '59', name: '복*상', phone: '010-****-9138', visitCount: 17, lastVisit: '2025-01-12', preferredCategories: ['한식'], region: '경기 파주시', age: '50대', gender: 'MALE' },
  { id: '60', name: '태*원', phone: '010-****-0249', visitCount: 10, lastVisit: '2025-01-10', preferredCategories: ['양식', '카페'], region: '울산 동구', age: '30대', gender: 'FEMALE' },
  { id: '61', name: '음*승', phone: '010-****-1361', visitCount: 25, lastVisit: '2025-01-13', preferredCategories: ['한식', '구이'], region: '대구 동구', age: '40대', gender: 'MALE' },
  { id: '62', name: '목*진', phone: '010-****-2462', visitCount: 4, lastVisit: '2025-01-04', preferredCategories: ['카페', '디저트'], region: '서울 구로구', age: '20대', gender: 'FEMALE' },
  { id: '63', name: '소*택', phone: '010-****-3573', visitCount: 21, lastVisit: '2025-01-14', preferredCategories: ['한식', '중식'], region: '광주 남구', age: '50대', gender: 'MALE' },
  { id: '64', name: '어*름', phone: '010-****-4684', visitCount: 9, lastVisit: '2025-01-09', preferredCategories: ['일식'], region: '경기 광명시', age: '30대', gender: 'FEMALE' },
  { id: '65', name: '명*오', phone: '010-****-5795', visitCount: 34, lastVisit: '2025-01-14', preferredCategories: ['한식', '구이', '일식'], region: '충남 논산시', age: '60대', gender: 'MALE' },
  { id: '66', name: '현*미', phone: '010-****-6806', visitCount: 6, lastVisit: '2025-01-06', preferredCategories: ['양식', '카페'], region: '서울 동대문구', age: '20대', gender: 'FEMALE' },
  { id: '67', name: '국*현', phone: '010-****-7917', visitCount: 14, lastVisit: '2025-01-11', preferredCategories: ['한식'], region: '부산 연제구', age: '40대', gender: 'MALE' },
  { id: '68', name: '감*지', phone: '010-****-8028', visitCount: 11, lastVisit: '2025-01-10', preferredCategories: ['디저트', '일식'], region: '경기 군포시', age: '30대', gender: 'FEMALE' },
  { id: '69', name: '경*로', phone: '010-****-9139', visitCount: 28, lastVisit: '2025-01-13', preferredCategories: ['한식', '구이'], region: '전남 순천시', age: '50대', gender: 'MALE' },
  { id: '70', name: '계*별', phone: '010-****-0250', visitCount: 3, lastVisit: '2025-01-03', preferredCategories: ['카페'], region: '인천 서구', age: '20대', gender: 'FEMALE' },
  { id: '71', name: '고*평', phone: '010-****-1362', visitCount: 19, lastVisit: '2025-01-12', preferredCategories: ['한식', '중식'], region: '대전 대덕구', age: '40대', gender: 'MALE' },
  { id: '72', name: '관*정', phone: '010-****-2463', visitCount: 8, lastVisit: '2025-01-08', preferredCategories: ['양식', '디저트'], region: '서울 성동구', age: '30대', gender: 'FEMALE' },
  { id: '73', name: '광*호', phone: '010-****-3574', visitCount: 35, lastVisit: '2025-01-14', preferredCategories: ['한식', '구이', '일식'], region: '경북 구미시', age: '60대', gender: 'MALE' },
  { id: '74', name: '규*온', phone: '010-****-4685', visitCount: 5, lastVisit: '2025-01-05', preferredCategories: ['카페', '일식'], region: '경기 이천시', age: '20대', gender: 'FEMALE' },
  { id: '75', name: '근*식', phone: '010-****-5796', visitCount: 23, lastVisit: '2025-01-13', preferredCategories: ['한식'], region: '울산 북구', age: '50대', gender: 'MALE' },
  { id: '76', name: '기*향', phone: '010-****-6807', visitCount: 12, lastVisit: '2025-01-11', preferredCategories: ['디저트', '카페'], region: '서울 강동구', age: '30대', gender: 'FEMALE' },
  { id: '77', name: '낙*빈', phone: '010-****-7918', visitCount: 20, lastVisit: '2025-01-12', preferredCategories: ['한식', '구이'], region: '부산 금정구', age: '40대', gender: 'MALE' },
  { id: '78', name: '난*설', phone: '010-****-8029', visitCount: 7, lastVisit: '2025-01-07', preferredCategories: ['양식'], region: '경기 하남시', age: '20대', gender: 'FEMALE' },
  { id: '79', name: '내*천', phone: '010-****-9140', visitCount: 31, lastVisit: '2025-01-14', preferredCategories: ['한식', '중식', '구이'], region: '충북 제천시', age: '60대', gender: 'MALE' },
  { id: '80', name: '다*름', phone: '010-****-0251', visitCount: 10, lastVisit: '2025-01-10', preferredCategories: ['일식', '카페'], region: '대구 북구', age: '30대', gender: 'FEMALE' },
  { id: '81', name: '단*결', phone: '010-****-1363', visitCount: 15, lastVisit: '2025-01-11', preferredCategories: ['한식'], region: '광주 동구', age: '40대', gender: 'MALE' },
  { id: '82', name: '달*봄', phone: '010-****-2464', visitCount: 4, lastVisit: '2025-01-04', preferredCategories: ['카페', '디저트'], region: '서울 서초구', age: '20대', gender: 'FEMALE' },
  { id: '83', name: '대*수', phone: '010-****-3575', visitCount: 26, lastVisit: '2025-01-13', preferredCategories: ['한식', '구이'], region: '경남 양산시', age: '50대', gender: 'MALE' },
  { id: '84', name: '덕*자', phone: '010-****-4686', visitCount: 9, lastVisit: '2025-01-09', preferredCategories: ['양식', '일식'], region: '인천 미추홀구', age: '30대', gender: 'FEMALE' },
  { id: '85', name: '도*원', phone: '010-****-5797', visitCount: 36, lastVisit: '2025-01-14', preferredCategories: ['한식', '중식', '일식'], region: '전북 군산시', age: '60대', gender: 'MALE' },
  { id: '86', name: '동*천', phone: '010-****-6808', visitCount: 6, lastVisit: '2025-01-06', preferredCategories: ['디저트'], region: '경기 김포시', age: '20대', gender: 'FEMALE' },
  { id: '87', name: '두*민', phone: '010-****-7919', visitCount: 18, lastVisit: '2025-01-12', preferredCategories: ['한식', '구이'], region: '대전 중구', age: '40대', gender: 'MALE' },
  { id: '88', name: '라*희', phone: '010-****-8030', visitCount: 13, lastVisit: '2025-01-11', preferredCategories: ['카페'], region: '서울 양천구', age: '30대', gender: 'FEMALE' },
  { id: '89', name: '래*준', phone: '010-****-9141', visitCount: 29, lastVisit: '2025-01-14', preferredCategories: ['한식', '일식'], region: '부산 사상구', age: '50대', gender: 'MALE' },
  { id: '90', name: '려*운', phone: '010-****-0252', visitCount: 8, lastVisit: '2025-01-08', preferredCategories: ['양식', '카페'], region: '경기 남양주시', age: '20대', gender: 'FEMALE' },
  { id: '91', name: '력*상', phone: '010-****-1364', visitCount: 22, lastVisit: '2025-01-13', preferredCategories: ['한식', '구이'], region: '울산 울주군', age: '40대', gender: 'MALE' },
  { id: '92', name: '련*화', phone: '010-****-2465', visitCount: 11, lastVisit: '2025-01-10', preferredCategories: ['디저트', '일식'], region: '대구 서구', age: '30대', gender: 'FEMALE' },
  { id: '93', name: '렬*진', phone: '010-****-3576', visitCount: 33, lastVisit: '2025-01-14', preferredCategories: ['한식', '중식', '구이'], region: '광주 서구', age: '60대', gender: 'MALE' },
  { id: '94', name: '령*아', phone: '010-****-4687', visitCount: 5, lastVisit: '2025-01-05', preferredCategories: ['카페'], region: '서울 강북구', age: '20대', gender: 'FEMALE' },
  { id: '95', name: '례*문', phone: '010-****-5798', visitCount: 17, lastVisit: '2025-01-12', preferredCategories: ['한식'], region: '경기 오산시', age: '50대', gender: 'MALE' },
  { id: '96', name: '로*빈', phone: '010-****-6809', visitCount: 14, lastVisit: '2025-01-11', preferredCategories: ['양식', '디저트'], region: '충남 서산시', age: '30대', gender: 'FEMALE' },
  { id: '97', name: '록*찬', phone: '010-****-7920', visitCount: 24, lastVisit: '2025-01-13', preferredCategories: ['한식', '구이', '일식'], region: '인천 강화군', age: '40대', gender: 'MALE' },
  { id: '98', name: '론*희', phone: '010-****-8031', visitCount: 7, lastVisit: '2025-01-07', preferredCategories: ['카페', '일식'], region: '전남 목포시', age: '20대', gender: 'FEMALE' },
  { id: '99', name: '롱*석', phone: '010-****-9142', visitCount: 38, lastVisit: '2025-01-14', preferredCategories: ['한식', '중식'], region: '경북 경주시', age: '60대', gender: 'MALE' },
  { id: '100', name: '뢰*수', phone: '010-****-0253', visitCount: 10, lastVisit: '2025-01-10', preferredCategories: ['디저트', '양식'], region: '제주 서귀포시', age: '30대', gender: 'FEMALE' },
];

// Filter options
const REGION_OPTIONS = ['서울', '경기', '인천', '부산', '대구', '광주', '대전', '울산', '충남', '충북', '전북', '전남', '경북', '경남', '강원', '제주'];
const AGE_OPTIONS = ['20대', '30대', '40대', '50대', '60대 이상'];
const GENDER_OPTIONS = [
  { value: 'MALE', label: '남성' },
  { value: 'FEMALE', label: '여성' },
];
const VISIT_COUNT_OPTIONS = [
  { value: '1', label: '1회' },
  { value: '2-5', label: '2-5회' },
  { value: '6-10', label: '6-10회' },
  { value: '10+', label: '10회 이상' },
];
const LAST_VISIT_OPTIONS = [
  { value: '7', label: '7일 이내' },
  { value: '30', label: '30일 이내' },
  { value: '90', label: '90일 이내' },
  { value: '90+', label: '90일 이상' },
];

interface Customer {
  id: string;
  name: string;
  phone: string;
  visitCount: number;
  lastVisit: string;
  preferredCategories: string[];
  region: string;
  age: string;
  gender: string;
}

interface SegmentCondition {
  id: string;
  field: 'region' | 'age' | 'gender' | 'visitCount' | 'lastVisit';
  operator: 'equals' | 'in' | 'gt' | 'lt' | 'between';
  value: string | string[];
}

interface SegmentGroup {
  id: string;
  conditions: SegmentCondition[];
  logic: 'AND' | 'OR';
}

export default function FranchiseCustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSegmentModalOpen, setIsSegmentModalOpen] = useState(false);
  const [segmentGroups, setSegmentGroups] = useState<SegmentGroup[]>([]);
  const [groupLogic, setGroupLogic] = useState<'AND' | 'OR'>('AND');
  const [estimatedTargetCount, setEstimatedTargetCount] = useState(0);

  // Auth token helper
  const getAuthToken = () => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('franchiseToken') || '';
    }
    return '';
  };

  // Fetch customers - 데모에서는 항상 DEMO_CUSTOMERS 사용
  const fetchCustomers = useCallback(async () => {
    setIsLoading(true);
    // 데모 데이터 바로 사용
    setTimeout(() => {
      setCustomers(DEMO_CUSTOMERS);
      setIsLoading(false);
    }, 500);
  }, []);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  // Calculate estimated target count based on segment conditions
  useEffect(() => {
    if (segmentGroups.length === 0) {
      setEstimatedTargetCount(customers.length);
      return;
    }

    // Simple filtering logic for demo
    const filtered = customers.filter((customer) => {
      const groupResults = segmentGroups.map((group) => {
        const conditionResults = group.conditions.map((condition) => {
          switch (condition.field) {
            case 'region':
              if (Array.isArray(condition.value)) {
                return condition.value.some((v) => customer.region.includes(v));
              }
              return customer.region.includes(condition.value as string);
            case 'age':
              if (Array.isArray(condition.value)) {
                return condition.value.includes(customer.age);
              }
              return customer.age === condition.value;
            case 'gender':
              return customer.gender === condition.value;
            case 'visitCount':
              const vc = customer.visitCount;
              if (condition.value === '1') return vc === 1;
              if (condition.value === '2-5') return vc >= 2 && vc <= 5;
              if (condition.value === '6-10') return vc >= 6 && vc <= 10;
              if (condition.value === '10+') return vc > 10;
              return true;
            case 'lastVisit':
              const daysDiff = Math.floor((Date.now() - new Date(customer.lastVisit).getTime()) / (1000 * 60 * 60 * 24));
              if (condition.value === '7') return daysDiff <= 7;
              if (condition.value === '30') return daysDiff <= 30;
              if (condition.value === '90') return daysDiff <= 90;
              if (condition.value === '90+') return daysDiff > 90;
              return true;
            default:
              return true;
          }
        });

        return group.logic === 'AND'
          ? conditionResults.every((r) => r)
          : conditionResults.some((r) => r);
      });

      return groupLogic === 'AND'
        ? groupResults.every((r) => r)
        : groupResults.some((r) => r);
    });

    setEstimatedTargetCount(filtered.length);
  }, [segmentGroups, groupLogic, customers]);

  // Filter customers by search
  const filteredCustomers = customers.filter((customer) => {
    const matchesSearch =
      customer.name.includes(searchQuery) ||
      customer.phone.includes(searchQuery) ||
      customer.region.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  // Add segment group
  const addSegmentGroup = () => {
    setSegmentGroups([
      ...segmentGroups,
      {
        id: Date.now().toString(),
        conditions: [],
        logic: 'AND',
      },
    ]);
  };

  // Remove segment group
  const removeSegmentGroup = (groupId: string) => {
    setSegmentGroups(segmentGroups.filter((g) => g.id !== groupId));
  };

  // Add condition to group
  const addCondition = (groupId: string) => {
    setSegmentGroups(
      segmentGroups.map((group) => {
        if (group.id === groupId) {
          return {
            ...group,
            conditions: [
              ...group.conditions,
              {
                id: Date.now().toString(),
                field: 'region',
                operator: 'in',
                value: [],
              },
            ],
          };
        }
        return group;
      })
    );
  };

  // Remove condition from group
  const removeCondition = (groupId: string, conditionId: string) => {
    setSegmentGroups(
      segmentGroups.map((group) => {
        if (group.id === groupId) {
          return {
            ...group,
            conditions: group.conditions.filter((c) => c.id !== conditionId),
          };
        }
        return group;
      })
    );
  };

  // Update condition
  const updateCondition = (groupId: string, conditionId: string, updates: Partial<SegmentCondition>) => {
    setSegmentGroups(
      segmentGroups.map((group) => {
        if (group.id === groupId) {
          return {
            ...group,
            conditions: group.conditions.map((c) => {
              if (c.id === conditionId) {
                return { ...c, ...updates };
              }
              return c;
            }),
          };
        }
        return group;
      })
    );
  };

  // Toggle group logic
  const toggleGroupLogic = (groupId: string) => {
    setSegmentGroups(
      segmentGroups.map((group) => {
        if (group.id === groupId) {
          return {
            ...group,
            logic: group.logic === 'AND' ? 'OR' : 'AND',
          };
        }
        return group;
      })
    );
  };

  // Format date
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  // Loading skeleton
  const renderSkeleton = () => (
    <div className="animate-pulse">
      {[...Array(10)].map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-6 py-4 border-b border-slate-100">
          <div className="h-4 bg-slate-200 rounded w-24"></div>
          <div className="h-4 bg-slate-200 rounded w-32"></div>
          <div className="h-4 bg-slate-200 rounded w-16"></div>
          <div className="h-4 bg-slate-200 rounded w-24"></div>
          <div className="h-4 bg-slate-200 rounded w-32"></div>
        </div>
      ))}
    </div>
  );

  // Empty state
  const renderEmptyState = () => (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
        <Users className="w-8 h-8 text-slate-400" />
      </div>
      <h3 className="text-lg font-medium text-slate-900 mb-1">고객이 없습니다</h3>
      <p className="text-sm text-slate-500">검색 조건을 변경해보세요</p>
    </div>
  );

  // Render field options in segment builder
  const renderFieldOptions = (condition: SegmentCondition, groupId: string) => {
    switch (condition.field) {
      case 'region':
        return (
          <div className="flex flex-wrap gap-2">
            {REGION_OPTIONS.map((region) => (
              <button
                key={region}
                onClick={() => {
                  const currentValue = Array.isArray(condition.value) ? condition.value : [];
                  const newValue = currentValue.includes(region)
                    ? currentValue.filter((v) => v !== region)
                    : [...currentValue, region];
                  updateCondition(groupId, condition.id, { value: newValue });
                }}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-full border transition-colors',
                  Array.isArray(condition.value) && condition.value.includes(region)
                    ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                )}
              >
                {region}
              </button>
            ))}
          </div>
        );
      case 'age':
        return (
          <div className="flex flex-wrap gap-2">
            {AGE_OPTIONS.map((age) => (
              <button
                key={age}
                onClick={() => {
                  const currentValue = Array.isArray(condition.value) ? condition.value : [];
                  const newValue = currentValue.includes(age)
                    ? currentValue.filter((v) => v !== age)
                    : [...currentValue, age];
                  updateCondition(groupId, condition.id, { value: newValue });
                }}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-full border transition-colors',
                  Array.isArray(condition.value) && condition.value.includes(age)
                    ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                )}
              >
                {age}
              </button>
            ))}
          </div>
        );
      case 'gender':
        return (
          <div className="flex gap-2">
            {GENDER_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => updateCondition(groupId, condition.id, { value: option.value })}
                className={cn(
                  'px-4 py-2 text-sm font-medium rounded-lg border transition-colors',
                  condition.value === option.value
                    ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        );
      case 'visitCount':
        return (
          <div className="flex flex-wrap gap-2">
            {VISIT_COUNT_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => updateCondition(groupId, condition.id, { value: option.value })}
                className={cn(
                  'px-4 py-2 text-sm font-medium rounded-lg border transition-colors',
                  condition.value === option.value
                    ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        );
      case 'lastVisit':
        return (
          <div className="flex flex-wrap gap-2">
            {LAST_VISIT_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => updateCondition(groupId, condition.id, { value: option.value })}
                className={cn(
                  'px-4 py-2 text-sm font-medium rounded-lg border transition-colors',
                  condition.value === option.value
                    ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">고객 통합 DB</h1>
            <p className="text-sm text-slate-500 mt-1">
              전체 {customers.length.toLocaleString()}명의 고객
            </p>
          </div>
        </div>

        {/* Search and Segment Builder */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm mb-6">
          <div className="p-4 flex items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="이름, 연락처, 지역으로 검색"
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            {/* Segment Builder Button */}
            <button
              onClick={() => setIsSegmentModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              <Filter className="w-4 h-4" />
              세그먼트 빌더
            </button>

            {/* Export Button */}
            <button className="flex items-center gap-2 px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:bg-slate-50 transition-colors">
              <Download className="w-4 h-4" />
              내보내기
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    이름
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    연락처
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">
                    방문횟수
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    최근방문
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                    선호업종
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoading ? (
                  <tr>
                    <td colSpan={5}>{renderSkeleton()}</td>
                  </tr>
                ) : filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={5}>{renderEmptyState()}</td>
                  </tr>
                ) : (
                  filteredCustomers.map((customer) => (
                    <tr
                      key={customer.id}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-slate-100 rounded-full flex items-center justify-center">
                            <UserCircle className="w-5 h-5 text-slate-400" />
                          </div>
                          <span className="text-sm font-medium text-slate-900">{customer.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600 font-mono">{customer.phone}</td>
                      <td className="px-6 py-4 text-sm text-slate-900 text-right font-medium">
                        {customer.visitCount}회
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-500">{formatDate(customer.lastVisit)}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {customer.preferredCategories.map((category) => (
                            <span
                              key={category}
                              className="bg-slate-100 text-slate-700 px-2 py-0.5 text-xs font-medium rounded-full"
                            >
                              {category}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Segment Builder Modal */}
      {isSegmentModalOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 z-40"
            onClick={() => setIsSegmentModalOpen(false)}
          />

          {/* Modal */}
          <div className="fixed inset-4 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-full md:max-w-3xl md:max-h-[80vh] bg-white rounded-2xl shadow-xl z-50 flex flex-col">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">세그먼트 빌더</h2>
                <p className="text-sm text-slate-500">조건을 설정하여 타겟 고객을 선택하세요</p>
              </div>
              <button
                onClick={() => setIsSegmentModalOpen(false)}
                className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Estimated Target Count */}
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                      <Users className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <p className="text-sm text-indigo-600">예상 타겟 수</p>
                      <p className="text-2xl font-bold text-indigo-900">
                        {estimatedTargetCount.toLocaleString()}명
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setSegmentGroups([]);
                      setGroupLogic('AND');
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm text-indigo-600 hover:bg-indigo-100 rounded-lg transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                    초기화
                  </button>
                </div>
              </div>

              {/* Segment Groups */}
              {segmentGroups.length > 0 && (
                <div className="space-y-4">
                  {segmentGroups.map((group, groupIndex) => (
                    <div key={group.id}>
                      {groupIndex > 0 && (
                        <div className="flex items-center justify-center my-3">
                          <button
                            onClick={() => setGroupLogic(groupLogic === 'AND' ? 'OR' : 'AND')}
                            className="px-4 py-1 bg-slate-100 text-slate-600 rounded-full text-sm font-medium hover:bg-slate-200 transition-colors"
                          >
                            {groupLogic}
                          </button>
                        </div>
                      )}

                      <div className="border border-slate-200 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-medium text-slate-700">조건 그룹 {groupIndex + 1}</span>
                          <button
                            onClick={() => removeSegmentGroup(group.id)}
                            className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>

                        {/* Conditions */}
                        <div className="space-y-3">
                          {group.conditions.map((condition, conditionIndex) => (
                            <div key={condition.id}>
                              {conditionIndex > 0 && (
                                <div className="flex items-center justify-center my-2">
                                  <button
                                    onClick={() => toggleGroupLogic(group.id)}
                                    className="px-3 py-0.5 bg-slate-100 text-slate-500 rounded-full text-xs font-medium hover:bg-slate-200 transition-colors"
                                  >
                                    {group.logic}
                                  </button>
                                </div>
                              )}

                              <div className="bg-slate-50 rounded-lg p-3">
                                <div className="flex items-center justify-between mb-2">
                                  <select
                                    value={condition.field}
                                    onChange={(e) =>
                                      updateCondition(group.id, condition.id, {
                                        field: e.target.value as SegmentCondition['field'],
                                        value: [],
                                      })
                                    }
                                    className="text-sm font-medium text-slate-700 bg-transparent border-none focus:ring-0 cursor-pointer"
                                  >
                                    <option value="region">지역</option>
                                    <option value="age">연령대</option>
                                    <option value="gender">성별</option>
                                    <option value="visitCount">방문 횟수</option>
                                    <option value="lastVisit">최근 방문일</option>
                                  </select>
                                  <button
                                    onClick={() => removeCondition(group.id, condition.id)}
                                    className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                                {renderFieldOptions(condition, group.id)}
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Add Condition Button */}
                        <button
                          onClick={() => addCondition(group.id)}
                          className="mt-3 flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 transition-colors"
                        >
                          <Plus className="w-4 h-4" />
                          조건 추가
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Group Button */}
              <button
                onClick={addSegmentGroup}
                className="mt-4 w-full py-3 border-2 border-dashed border-slate-200 rounded-xl text-sm text-slate-500 hover:border-indigo-300 hover:text-indigo-600 transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                조건 그룹 추가
              </button>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                onClick={() => setIsSegmentModalOpen(false)}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                취소
              </button>
              <button
                onClick={() => setIsSegmentModalOpen(false)}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
              >
                적용하기
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
