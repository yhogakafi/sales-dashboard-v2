const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', '.data', 'Affiliate Marketing New.xlsx');
const wb = xlsx.readFile(filePath);

function parseHpp(val) {
  if (!val && val !== 0) return 0;
  if (typeof val === 'number') return val;
  const s = String(val).trim().replace(/^Rp\.?\s*/i, '');
  const clean = s.replace(/\./g, '').replace(/,/g, '.').replace(/[^0-9.]/g, '');
  const num = parseFloat(clean);
  return isNaN(num) ? 0 : num;
}

function normalizeDate(val) {
  if (!val && val !== 0) return '';
  if (val instanceof Date) {
    return val.toISOString().slice(0, 10);
  }
  if (typeof val === 'number') {
    const ms = Math.round((val - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return d.toISOString().slice(0, 10);
  }
  const str = String(val).trim();
  const ymdMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (ymdMatch) {
    const yr = ymdMatch[1];
    const mo = ('0' + ymdMatch[2]).slice(-2);
    const da = ('0' + ymdMatch[3]).slice(-2);
    return `${yr}-${mo}-${da}`;
  }
  return str;
}

function extractRecords(sheetName, platform) {
  const ws = wb.Sheets[sheetName];
  if (!ws) return [];
  const rawData = xlsx.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (!rawData || rawData.length === 0) return [];

  let headerRowIdx = -1;
  for (let r = 0; r < Math.min(10, rawData.length); r++) {
    const row = rawData[r];
    if (!row) continue;
    const rowStr = row.map(c => String(c || '').toLowerCase()).join(' ');
    if (rowStr.includes('username') || rowStr.includes('nama affiliator') || rowStr.includes('progress')) {
      headerRowIdx = r;
      break;
    }
  }

  if (headerRowIdx === -1) headerRowIdx = 0;

  const header = rawData[headerRowIdx].map(h => String(h || '').trim().toLowerCase());
  const colMap = {};

  for (let c = 0; c < header.length; c++) {
    const h = header[c];
    if (!h) continue;
    if (/^(tanggal\s*listing|tanggal|date)$/.test(h)) colMap.date = c;
    else if (colMap.date === undefined && (/tanggal.*listing/.test(h) || (!/dealing|posting/.test(h) && /date|tanggal/.test(h)))) colMap.date = c;

    if (/^(username|nama)$/.test(h) || (/username/.test(h) && !/link/.test(h))) colMap.username = c;
    if (/^(progress|status|progress\s*status)$/.test(h)) colMap.progress = c;
    else if (colMap.progress === undefined && /progress/.test(h) && !/sample|content/.test(h)) colMap.progress = c;

    if (/^(brand|merek)$/.test(h) || /brand/.test(h)) colMap.brand = c;
    if (/^(gmv|omset)$/.test(h) && colMap.gmv === undefined) colMap.gmv = c;
    if (/follower/.test(h)) colMap.followers = c;
    if (/kategori|category/.test(h)) colMap.category = c;
    if (/kontak|contact|phone|wa|email/.test(h)) colMap.contact = c;

    if (/tanggal\s*dealing|date\s*dealing/.test(h)) colMap.tanggalDealing = c;
    if (/sample\s*product|produk\s*sample/.test(h)) colMap.sampleProduct = c;
    if (/tipe\s*kerjasama/.test(h)) colMap.tipeKerjasama = c;
    if (/progress\s*sample/.test(h)) colMap.progressSample = c;
    if (/tanggal\s*posting|date\s*posting/.test(h)) colMap.tanggalPosting = c;
    if (/progress\s*content/.test(h)) colMap.progressContent = c;
    if (/nomor\s*pesanan|no\.?\s*pesanan|order\s*number/.test(h)) colMap.nomorPesanan = c;
    if (/link\s*posting/.test(h)) colMap.linkPosting = c;
    if (/^(produk|product)$/.test(h)) colMap.produk = c;
    if (/hpp/.test(h)) colMap.hpp = c;
    if (/link\s*produk|link\s*product/.test(h)) colMap.linkProduk = c;
    if (/link\s*(shopee|tiktok)/.test(h)) colMap.linkPlatform = c;
    if (/traffic/.test(h)) colMap.traffic = c;
  }

  const records = [];
  for (let r = headerRowIdx + 1; r < rawData.length; r++) {
    const row = rawData[r];
    if (!row || !row.length) continue;
    const username = colMap.username !== undefined ? String(row[colMap.username] || '').trim() : '';
    const brand = colMap.brand !== undefined ? String(row[colMap.brand] || '').trim() : '';
    const progress = colMap.progress !== undefined ? String(row[colMap.progress] || '').trim() : '';
    const dateRaw = colMap.date !== undefined ? row[colMap.date] : '';

    if (!username && !brand && !progress) continue;

    const dateStr = normalizeDate(dateRaw);
    const dealingDateStr = colMap.tanggalDealing !== undefined ? normalizeDate(row[colMap.tanggalDealing]) : '';
    const postingDateStr = colMap.tanggalPosting !== undefined ? normalizeDate(row[colMap.tanggalPosting]) : '';

    records.push({
      platform,
      date: dateStr || 'N/A',
      username: username || '(No Username)',
      brand: brand || '(No Brand)',
      progress: progress || '(Empty)',
      followers: colMap.followers !== undefined ? String(row[colMap.followers] || '').trim() : '-',
      gmv: colMap.gmv !== undefined ? String(row[colMap.gmv] || '').trim() : '-',
      category: colMap.category !== undefined ? String(row[colMap.category] || '').trim() : '-',
      contact: colMap.contact !== undefined ? String(row[colMap.contact] || '').trim() : '-',

      tanggalDealing: dealingDateStr || '',
      sampleProduct: colMap.sampleProduct !== undefined ? String(row[colMap.sampleProduct] || '').trim() : '',
      tipeKerjasama: colMap.tipeKerjasama !== undefined ? String(row[colMap.tipeKerjasama] || '').trim() : '',
      progressSample: colMap.progressSample !== undefined ? String(row[colMap.progressSample] || '').trim() : '',
      tanggalPosting: postingDateStr || '',
      progressContent: colMap.progressContent !== undefined ? String(row[colMap.progressContent] || '').trim() : '',
      nomorPesanan: colMap.nomorPesanan !== undefined ? String(row[colMap.nomorPesanan] || '').trim() : '',
      linkPosting: colMap.linkPosting !== undefined ? String(row[colMap.linkPosting] || '').trim() : '',
      produk: colMap.produk !== undefined ? String(row[colMap.produk] || '').trim() : '',
      hpp: colMap.hpp !== undefined ? String(row[colMap.hpp] || '').trim() : '',
      linkProduk: colMap.linkProduk !== undefined ? String(row[colMap.linkProduk] || '').trim() : '',
      traffic: colMap.traffic !== undefined ? String(row[colMap.traffic] || '').trim() : ''
    });
  }

  return records;
}

const ttRecords = extractRecords('DAILY APPROACH TIKTOK', 'TikTok');
const spRecords = extractRecords('DAILY APPROACH SHOPEE', 'Shopee');
const allRecords = ttRecords.concat(spRecords);

allRecords.sort((a, b) => {
  if (a.date !== b.date) return b.date.localeCompare(a.date);
  if (a.platform !== b.platform) return a.platform.localeCompare(b.platform);
  return a.username.localeCompare(b.username);
});

const priorityStatuses = ['Listing', 'Approaching', 'Respon', 'Dealing'];
const dataStatuses = allRecords.map(r => r.progress).filter(Boolean);
const allStatuses = [...priorityStatuses];
dataStatuses.forEach(s => {
  if (!allStatuses.some(x => x.toLowerCase() === s.toLowerCase()) && s.trim()) {
    allStatuses.push(s.trim());
  }
});

const allBrands = Array.from(new Set(allRecords.map(r => r.brand).filter(Boolean))).sort();
const allCategories = Array.from(new Set(allRecords.map(r => r.category).filter(Boolean))).sort();
const allDates = Array.from(new Set(allRecords.map(r => r.date).filter(Boolean))).sort().reverse();

// Daily breakdown
const dailyBreakdown = allDates.map(d => {
  const dRecs = allRecords.filter(r => r.date === d);
  const row = {
    date: d,
    total: dRecs.length,
    tiktok: dRecs.filter(r => r.platform.toLowerCase() === 'tiktok').length,
    shopee: dRecs.filter(r => r.platform.toLowerCase() === 'shopee').length
  };
  allStatuses.forEach(s => {
    row[s.toLowerCase()] = dRecs.filter(r => r.progress.toLowerCase() === s.toLowerCase()).length;
  });
  return row;
});

// Progress breakdown
const progressBreakdown = allStatuses.map(s => {
  const sRecs = allRecords.filter(r => r.progress.toLowerCase() === s.toLowerCase());
  return {
    status: s,
    tiktok: sRecs.filter(r => r.platform.toLowerCase() === 'tiktok').length,
    shopee: sRecs.filter(r => r.platform.toLowerCase() === 'shopee').length,
    total: sRecs.length,
    percentage: allRecords.length > 0 ? (sRecs.length / allRecords.length) : 0
  };
});

// Brand breakdown
const brandBreakdown = allBrands.map(b => {
  const bRecs = allRecords.filter(r => r.brand.toLowerCase() === b.toLowerCase());
  const row = {
    brand: b,
    tiktok: bRecs.filter(r => r.platform.toLowerCase() === 'tiktok').length,
    shopee: bRecs.filter(r => r.platform.toLowerCase() === 'shopee').length,
    total: bRecs.length,
    percentage: allRecords.length > 0 ? (bRecs.length / allRecords.length) : 0
  };
  allStatuses.forEach(s => {
    row[s.toLowerCase()] = bRecs.filter(r => r.progress.toLowerCase() === s.toLowerCase()).length;
  });
  return row;
});

const statusCounts = {};
allStatuses.forEach(s => {
  statusCounts[s] = allRecords.filter(r => r.progress.toLowerCase() === s.toLowerCase()).length;
});

// 1 baris di kolom PRODUCT yang ada isinya = 1 sample
const sampleRecords = allRecords.filter(r => !!(r.produk && r.produk.trim()));
const totalSampleCount = sampleRecords.length;
const totalHppSum = sampleRecords.reduce((acc, r) => acc + parseHpp(r.hpp), 0);

// Rekap sample per tanggal dealing
const sampleGroupByDate = {};
sampleRecords.forEach(r => {
  const d = r.tanggalDealing || r.date || 'N/A';
  if (!sampleGroupByDate[d]) {
    sampleGroupByDate[d] = { date: d, count: 0, tt: 0, sp: 0, hpp: 0 };
  }
  sampleGroupByDate[d].count += 1;
  if (r.platform.toLowerCase() === 'tiktok') sampleGroupByDate[d].tt += 1;
  else sampleGroupByDate[d].sp += 1;
  sampleGroupByDate[d].hpp += parseHpp(r.hpp);
});

const sampleRekapDaily = Object.keys(sampleGroupByDate).sort().reverse().map(d => ({
  date: d,
  totalSample: sampleGroupByDate[d].count,
  tiktok: sampleGroupByDate[d].tt,
  shopee: sampleGroupByDate[d].sp,
  totalHpp: sampleGroupByDate[d].hpp
}));

const payload = {
  summary: {
    totalAffiliators: allRecords.length,
    tiktokTotal: ttRecords.length,
    shopeeTotal: spRecords.length,
    statusCounts,
    listingTotal: statusCounts['Listing'] || 0,
    approachingTotal: statusCounts['Approaching'] || 0,
    responTotal: statusCounts['Respon'] || 0,
    dealingTotal: statusCounts['Dealing'] || 0,
    totalSamples: totalSampleCount,
    totalHpp: totalHppSum,
    activeBrands: allBrands
  },
  availableStatuses: allStatuses,
  availableBrands: allBrands,
  availableCategories: allCategories,
  dailyBreakdown,
  progressBreakdown,
  brandBreakdown,
  sampleRekapDaily,
  affiliatorDetails: allRecords.map((r, idx) => ({
    no: idx + 1,
    date: r.date,
    platform: r.platform,
    username: r.username,
    brand: r.brand,
    progress: r.progress,
    followers: r.followers,
    gmv: r.gmv,
    category: r.category,
    contact: r.contact,
    tanggalDealing: r.tanggalDealing || '',
    sampleProduct: r.sampleProduct || '',
    tipeKerjasama: r.tipeKerjasama || '',
    progressSample: r.progressSample || '',
    tanggalPosting: r.tanggalPosting || '',
    progressContent: r.progressContent || '',
    nomorPesanan: r.nomorPesanan || '',
    linkPosting: r.linkPosting || '',
    produk: r.produk || '',
    hpp: r.hpp || '',
    linkProduk: r.linkProduk || '',
    traffic: r.traffic || ''
  })),
  source: 'Google Sheet - AFFILIATE REPORT',
  updatedAt: new Date().toISOString(),
  savedAt: new Date().toISOString()
};

const targetFile = path.join(__dirname, '..', '.data', 'laporan-affiliate', 'latest.json');
fs.mkdirSync(path.dirname(targetFile), { recursive: true });
fs.writeFileSync(targetFile, JSON.stringify(payload, null, 2), 'utf-8');

console.log('Successfully written to', targetFile);
console.log('Total Affiliators:', allRecords.length);
console.log('Total Samples:', totalSampleCount);
console.log('Total HPP:', totalHppSum);
console.log('Sample Rekap Rows:', sampleRekapDaily.length);
