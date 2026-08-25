import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const INVENTORY_HTML = path.join(ROOT, 'inventory.html');
const INVENTORY_JSON = path.join(ROOT, 'inventory.json');
const INVENTORY_TXT = path.join(ROOT, 'vehicle', 'inventory.txt');
const VEHICLE_DIR = path.join(ROOT, 'vehicle');
const START = '<!-- AI_INVENTORY_STATIC_START -->';
const END = '<!-- AI_INVENTORY_STATIC_END -->';

function stripComment(line) {
  return line.replace(/\s*\/\/.*$/, '').trim();
}

function parseInfo(text, id) {
  const lines = text.replace(/^\uFEFF/, '').replace(/\r/g, '').split('\n').map(stripComment);
  const car = {
    id,
    make: '', model: '', trim: '', year: '', mileage: '', engine: '', transmission: '', drive: '',
    color: '', date: '', price: '請洽詢', priceNote: '', carfax: '', cpo: false, source: '',
    status: 'available', condition: '', inStock: true, arrivalStatus: '', remark: '', highlights: [], equip: []
  };
  let inEquip = false;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const sep = line.indexOf('：');
    if (sep === -1) {
      if (inEquip) car.equip.push(line);
      continue;
    }

    const key = line.slice(0, sep).trim();
    const val = line.slice(sep + 1).trim();
    inEquip = false;

    switch (key) {
      case 'make': car.make = val; break;
      case 'model': car.model = val; break;
      case '車型暱稱': car.trim = val; break;
      case '年份': car.year = val; break;
      case '里程': car.mileage = val; break;
      case '排氣量': car.engine = val; break;
      case '變速箱': car.transmission = val; break;
      case '驅動方式': car.drive = val; break;
      case '出廠日期': car.date = val; break;
      case '售價': car.price = val || '請洽詢'; break;
      case '售價備註': car.priceNote = val; break;
      case '車況說明': car.remark = val; break;
      case 'CPO': car.cpo = val === '是'; break;
      case '總代理': car.source = val === '是' ? '總代理' : val === '否' ? '外匯車' : val; break;
      case '狀態': car.status = val || 'available'; break;
      case 'CARFAX': car.carfax = val; break;
      case '亮點配備': car.highlights = val.split(/[,，]/).map(s => s.trim()).filter(Boolean); break;
      case '重點配備':
        inEquip = true;
        if (val) car.equip = val.split(/[,，]/).map(s => s.trim()).filter(Boolean);
        break;
      case '車輛/內裝顏色':
      case '顏色': car.color = val; break;
      case '車況': car.condition = val; break;
      case '在庫': car.inStock = val !== '否'; break;
      case '到港狀態': car.arrivalStatus = val; break;
    }
  }

  if (!car.trim) car.trim = [car.year, car.color].filter(Boolean).join(' · ');
  return car;
}

function esc(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function statusLabel(status) {
  return ({ available: '正常販售', reserved: '已收訂', sold: '已售出' })[status] || status || '正常販售';
}

function numericPriceTwd(price) {
  if (!price || /請洽詢/.test(price)) return null;
  const wan = String(price).match(/([\d,.]+)\s*萬/);
  if (wan) return Math.round(Number(wan[1].replaceAll(',', '')) * 10000);
  const plain = String(price).match(/[\d,]+/);
  return plain ? Number(plain[0].replaceAll(',', '')) : null;
}

function firstPhotoUrl(id) {
  const carDir = path.join(VEHICLE_DIR, id);
  const exts = ['jpg', 'jpeg', 'JPG', 'JPEG', 'png', 'PNG', 'webp', 'WEBP'];
  const files = fs.existsSync(carDir) ? fs.readdirSync(carDir) : [];
  for (const ext of exts) {
    const file = files.find(name => name.toLowerCase() === `1.${ext}`.toLowerCase());
    if (file) {
      return `https://ys-autos.com/vehicle/${id}/${file}`;
    }
  }
  return 'https://ys-autos.com/logo.png';
}

function plainDescription(car) {
  return [
    car.remark,
    car.highlights.length ? `亮點配備：${car.highlights.join('、')}` : '',
    car.condition ? `車況：${car.condition}` : '',
    car.mileage ? `里程：${car.mileage}` : ''
  ].filter(Boolean).join(' ');
}

function loadCars() {
  if (!fs.existsSync(VEHICLE_DIR)) throw new Error('vehicle directory not found');
  return fs.readdirSync(VEHICLE_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && /^car\d+$/i.test(d.name))
    .map(d => ({ name: d.name, num: Number(d.name.match(/\d+/)?.[0] || 0) }))
    .sort((a, b) => a.num - b.num)
    .flatMap(({ name }) => {
      const info = path.join(VEHICLE_DIR, name, 'info.txt');
      if (!fs.existsSync(info)) return [];
      return [parseInfo(fs.readFileSync(info, 'utf8'), name)];
    });
}

function staticSection(cars) {
  const current = cars.filter(c => c.inStock);
  const incoming = cars.filter(c => !c.inStock);
  const cards = cars.map(c => {
    const title = [c.year, c.make, c.model].filter(Boolean).join(' ');
    const fields = [
      ['售價', c.price], ['年份', c.year], ['品牌', c.make], ['車款', c.model], ['車型', c.trim],
      ['里程', c.mileage], ['顏色', c.color], ['車況', c.condition], ['來源', c.source],
      ['狀態', statusLabel(c.status)], ['在庫', c.inStock ? '是' : '否'], ['到港狀態', c.arrivalStatus],
      ['CARFAX', c.carfax], ['CPO', c.cpo ? '是' : '否']
    ].filter(([, v]) => v !== '' && v != null);
    const highlights = c.highlights.length ? `<p>亮點配備：${c.highlights.map(esc).join('、')}</p>` : '';
    const remark = c.remark ? `<p>車況說明：${esc(c.remark)}</p>` : '';
    return `        <article data-vehicle-id="${esc(c.id)}">
            <h3>${esc(title || c.id)}</h3>
            <ul>${fields.map(([k, v]) => `<li>${esc(k)}：${esc(v)}</li>`).join('')}</ul>
            ${highlights}
            ${remark}
        </article>`;
  }).join('\n');

  // Vehicle is a Product subtype. Only emit Product/Vehicle structured data when a
  // genuine numeric price exists; otherwise Google requires offers, review, or
  // aggregateRating. Unpriced/incoming cars remain in the static HTML and machine-
  // readable inventory files below without inventing a price or rating.
  const pricedCars = cars
    .map(c => ({ car: c, price: numericPriceTwd(c.price) }))
    .filter(({ price }) => Number.isFinite(price) && price > 0);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: '耀笙國際汽車已標價車輛',
    numberOfItems: pricedCars.length,
    itemListElement: pricedCars.map(({ car: c, price }, i) => {
      const offer = {
        '@type': 'Offer',
        url: `https://ys-autos.com/inventory#${c.id}`,
        price,
        priceCurrency: 'TWD',
        itemCondition: 'https://schema.org/UsedCondition',
        availability: c.inStock && c.status === 'available' ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
        shippingDetails: {
          '@type': 'OfferShippingDetails',
          shippingDestination: {
            '@type': 'DefinedRegion',
            addressCountry: 'TW'
          },
          shippingRate: {
            '@type': 'MonetaryAmount',
            value: 0,
            currency: 'TWD'
          }
        },
        hasMerchantReturnPolicy: {
          '@type': 'MerchantReturnPolicy',
          applicableCountry: 'TW',
          returnPolicyCategory: 'https://schema.org/MerchantReturnNotPermitted'
        }
      };
      const vehicle = {
        '@type': 'Vehicle',
        name: [c.year, c.make, c.model, c.trim].filter(Boolean).join(' '),
        url: `https://ys-autos.com/inventory#${c.id}`,
        image: firstPhotoUrl(c.id),
        description: plainDescription(c) || undefined,
        vehicleModelDate: c.year || undefined,
        model: c.model || undefined,
        color: c.color || undefined,
        mileageFromOdometer: c.mileage ? { '@type': 'QuantitativeValue', value: c.mileage } : undefined,
        brand: c.make ? { '@type': 'Brand', name: c.make } : undefined,
        offers: offer
      };
      return { '@type': 'ListItem', position: i + 1, item: vehicle };
    })
  };

  return `${START}
<script type="application/ld+json" id="inventory-jsonld-static">${JSON.stringify(jsonLd)}</script>
<section id="aiInventoryStatic" aria-label="耀笙國際汽車目前在庫車輛" style="position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;clip-path:inset(50%)!important;white-space:nowrap!important;border:0!important;">
    <h2>耀笙國際汽車目前在庫車輛</h2>
    <p>此為與 vehicle/carN/info.txt 自動同步的靜態在庫資料，供搜尋引擎與 AI 讀取。頁面載入期間若看到「車輛資料載入中」，請以下列清單為準。</p>
    <p>目前共 ${cars.length} 台資料；在庫 ${current.length} 台；即將到港或非現場在庫 ${incoming.length} 台。</p>
${cards}
    <p><a href="/inventory.json">完整機器可讀 JSON</a>｜<a href="/vehicle/inventory.txt">純文字在庫清單</a></p>
</section>
${END}`;
}

function textInventory(cars) {
  const header = [
    '耀笙國際汽車｜目前在庫車輛',
    '此檔案由 vehicle/carN/info.txt 自動產生，供 AI、搜尋引擎與其他機器讀取。',
    `總資料數：${cars.length}；在庫：${cars.filter(c => c.inStock).length}；非現場在庫/即將到港：${cars.filter(c => !c.inStock).length}`,
    ''
  ];
  const rows = cars.flatMap(c => [
    `【${c.id}】${[c.year, c.make, c.model, c.trim].filter(Boolean).join(' ')}`,
    `售價：${c.price || '請洽詢'}`,
    `里程：${c.mileage || '未提供'}`,
    `顏色：${c.color || '未提供'}`,
    `來源：${c.source || '未提供'}`,
    `車況：${c.condition || '未提供'}`,
    `狀態：${statusLabel(c.status)}`,
    `在庫：${c.inStock ? '是' : '否'}`,
    ...(c.arrivalStatus ? [`到港狀態：${c.arrivalStatus}`] : []),
    ...(c.carfax ? [`CARFAX：${c.carfax}`] : []),
    ...(c.highlights.length ? [`亮點配備：${c.highlights.join('、')}`] : []),
    ...(c.remark ? [`車況說明：${c.remark}`] : []),
    ''
  ]);
  return [...header, ...rows].join('\n').trimEnd() + '\n';
}

function patchHtml(html, cars) {
  html = html.replace(new RegExp(`(?:\\r?\\n)*${START}[\\s\\S]*?${END}(?:\\r?\\n)*`, 'g'), '\n');

  const inventoryMarker = '<!-- ══ INVENTORY GRID ══ -->';
  if (!html.includes(inventoryMarker)) throw new Error('inventory grid marker not found');
  html = html.replace(inventoryMarker, `${staticSection(cars)}\n\n${inventoryMarker}`);

  const emptyStateRe = /(<div class="empty-state" id="emptyState">\s*<i[^>]*><\/i>\s*<p>)[\s\S]*?(<\/p>)/;
  if (!emptyStateRe.test(html)) throw new Error('empty state markup not found');
  html = html.replace(emptyStateRe, '$1車輛資料載入中，請稍候。$2');

  if (!html.includes('// AI crawler-safe empty state')) {
    const zeroNeedle = `if (allResults.length === 0) {\n            grid.innerHTML = '';\n            emptyState.classList.add('show');`;
    const zeroReplacement = `if (allResults.length === 0) {\n            grid.innerHTML = '';\n            // AI crawler-safe empty state: raw HTML stays neutral; only show this after JS confirms zero results.\n            const emptyMsg = emptyState.querySelector('p');\n            if (emptyMsg) emptyMsg.textContent = '目前沒有符合條件的車輛，請切換其他篩選條件或直接聯繫我們代為尋車。';\n            emptyState.classList.add('show');`;
    if (!html.includes(zeroNeedle)) throw new Error('zero-results branch not found');
    html = html.replace(zeroNeedle, zeroReplacement);
  }

  return html;
}

const cars = loadCars();
if (!cars.length) console.warn('No vehicle info files found; generating an empty static inventory.');

const originalHtml = fs.readFileSync(INVENTORY_HTML, 'utf8');
const nextHtml = patchHtml(originalHtml, cars);
fs.writeFileSync(INVENTORY_HTML, nextHtml);
fs.writeFileSync(INVENTORY_JSON, JSON.stringify({
  dealer: '耀笙國際汽車',
  url: 'https://ys-autos.com/inventory',
  total: cars.length,
  inStock: cars.filter(c => c.inStock).length,
  incoming: cars.filter(c => !c.inStock).length,
  vehicles: cars
}, null, 2) + '\n');
fs.writeFileSync(INVENTORY_TXT, textInventory(cars));
console.log(`Generated crawler-readable inventory for ${cars.length} vehicles.`);
