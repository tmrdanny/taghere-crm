const XLSX = require('xlsx');

const workbook = XLSX.readFile('/Users/zeroclasslab_1/Desktop/Code/taghere-crm/docs/태그히어 우리동네 손님 찾기 1차 DB.xlsx');

console.log('Sheet names:', workbook.SheetNames);

const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

console.log('\nFirst 5 rows:');
for (let i = 0; i < Math.min(5, data.length); i++) {
  console.log(`Row ${i}:`, data[i]);
}

console.log('\nTotal rows:', data.length);
