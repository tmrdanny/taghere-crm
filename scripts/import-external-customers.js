const XLSX = require('xlsx');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// 엑셀 시리얼 날짜를 JavaScript Date로 변환
function excelDateToJSDate(serial) {
  const utc_days = Math.floor(serial - 25569);
  const date = new Date(utc_days * 86400 * 1000);
  return date;
}

// 생년에서 연령대 계산
function getAgeGroup(birthYear) {
  const currentYear = new Date().getFullYear();
  const age = currentYear - birthYear;

  if (age < 30) return 'TWENTIES';
  if (age < 40) return 'THIRTIES';
  if (age < 50) return 'FORTIES';
  if (age < 60) return 'FIFTIES';
  return 'SIXTY_PLUS';
}

// 시/도를 시/군/구와 함께 설정 (시/도만 있으므로 임의의 구로 설정)
const sidoToSigungu = {
  '서울': '강남구',
  '경기': '성남시',
  '인천': '남동구',
  '부산': '해운대구',
  '대구': '수성구',
  '광주': '서구',
  '대전': '유성구',
  '울산': '남구',
  '세종': '세종시',
  '강원': '춘천시',
  '충북': '청주시',
  '충남': '천안시',
  '전북': '전주시',
  '전남': '순천시',
  '경북': '포항시',
  '경남': '창원시',
  '제주': '제주시',
};

async function main() {
  const workbook = XLSX.readFile('/Users/zeroclasslab_1/Desktop/Code/taghere-crm/docs/태그히어 우리동네 손님 찾기 1차 DB.xlsx');
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  // 헤더 제외
  const dataRows = rows.slice(1);

  console.log(`Total rows to process: ${dataRows.length}`);

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  // 배치 처리
  const batchSize = 100;
  const customersToCreate = [];

  for (const row of dataRows) {
    const [phoneRaw, sido, genderRaw, birthdaySerial] = row;

    if (!phoneRaw || !sido || !birthdaySerial) {
      skipCount++;
      continue;
    }

    // 전화번호 포맷팅
    const phoneStr = String(phoneRaw);
    let phone;
    if (phoneStr.length === 10 && phoneStr.startsWith('10')) {
      // 이미 "10"으로 시작하는 10자리 (예: 1036301992) -> 앞에 "0"만 추가
      phone = `0${phoneStr}`;
    } else if (phoneStr.length === 11 && phoneStr.startsWith('010')) {
      // 이미 완전한 11자리 (예: 01036301992)
      phone = phoneStr;
    } else {
      // 8자리 뒷번호만 있는 경우 (예: 36301992) -> "010" 추가
      phone = `010${phoneStr.padStart(8, '0')}`;
    }

    // 성별 변환
    const gender = genderRaw === '여' ? 'FEMALE' : genderRaw === '남' ? 'MALE' : null;

    // 생년 추출 및 연령대 계산
    const birthDate = excelDateToJSDate(birthdaySerial);
    const birthYear = birthDate.getFullYear();
    const ageGroup = getAgeGroup(birthYear);

    // 시/도 매핑
    const regionSido = sido;
    const regionSigungu = sidoToSigungu[sido] || '기타';

    customersToCreate.push({
      phone,
      ageGroup,
      gender,
      regionSido,
      regionSigungu,
      consentMarketing: true,
      consentAt: new Date(),
    });
  }

  console.log(`Customers to create: ${customersToCreate.length}`);

  // 기존 데이터 삭제 (테스트용)
  console.log('Clearing existing external customers...');
  await prisma.externalCustomerWeeklySlot.deleteMany({});
  await prisma.externalSmsMessage.deleteMany({});
  await prisma.externalCustomer.deleteMany({});

  // 배치로 삽입
  for (let i = 0; i < customersToCreate.length; i += batchSize) {
    const batch = customersToCreate.slice(i, i + batchSize);

    try {
      await prisma.externalCustomer.createMany({
        data: batch,
        skipDuplicates: true,
      });
      successCount += batch.length;
      console.log(`Processed ${Math.min(i + batchSize, customersToCreate.length)} / ${customersToCreate.length}`);
    } catch (error) {
      console.error(`Batch error at ${i}:`, error.message);
      errorCount += batch.length;
    }
  }

  console.log('\n=== Import Complete ===');
  console.log(`Success: ${successCount}`);
  console.log(`Skipped: ${skipCount}`);
  console.log(`Errors: ${errorCount}`);

  // 통계 확인
  const totalInDb = await prisma.externalCustomer.count();
  console.log(`\nTotal in DB: ${totalInDb}`);

  // 지역별 통계
  const byRegion = await prisma.externalCustomer.groupBy({
    by: ['regionSido'],
    _count: true,
  });
  console.log('\nBy Region:');
  byRegion.forEach(r => console.log(`  ${r.regionSido}: ${r._count}`));

  // 연령대별 통계
  const byAge = await prisma.externalCustomer.groupBy({
    by: ['ageGroup'],
    _count: true,
  });
  console.log('\nBy Age Group:');
  byAge.forEach(a => console.log(`  ${a.ageGroup}: ${a._count}`));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
