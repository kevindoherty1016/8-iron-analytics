const d1 = new Date('2024-05-12');
console.log('2024-05-12 -> toISO:', d1.toISOString().split('T')[0]);

const d2 = new Date('5/12/2024');
console.log('5/12/2024 -> toISO:', d2.toISOString().split('T')[0]);

const d3 = new Date('05/12/2024');
console.log('05/12/2024 -> toISO:', d3.toISOString().split('T')[0]);

// Let's do local math
const year = d1.getFullYear();
const month = String(d1.getMonth() + 1).padStart(2, '0');
const day = String(d1.getDate()).padStart(2, '0');
console.log('2024-05-12 -> local:', `${year}-${month}-${day}`);

