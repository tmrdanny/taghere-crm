const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkAllPhones() {
  const all = await prisma.externalCustomer.findMany({
    select: { id: true, phone: true }
  });

  const wrongLengths = all.filter(c => c.phone.length !== 11);
  console.log(`전체 고객: ${all.length}`);
  console.log(`잘못된 길이: ${wrongLengths.length}`);

  const lengthDist = {};
  wrongLengths.forEach(c => {
    const len = c.phone.length;
    lengthDist[len] = (lengthDist[len] || 0) + 1;
  });

  console.log('\n길이별 분포:');
  Object.entries(lengthDist).sort((a, b) => parseInt(b[0]) - parseInt(a[0])).forEach(([len, count]) => {
    console.log(`  ${len}자리: ${count}건`);
  });

  console.log('\n샘플 (각 길이별 1개):');
  Object.keys(lengthDist).forEach(len => {
    const sample = wrongLengths.find(c => c.phone.length === parseInt(len));
    if (sample) {
      console.log(`  ${len}자리: ${sample.phone}`);
    }
  });

  await prisma.$disconnect();
}

checkAllPhones().catch(console.error);
