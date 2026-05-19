const CARDS_KEY = 'cards'
const LOCATIONS_KEY = 'locations'

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  })
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

async function getAll(kv, key) {
  const raw = await kv.get(key)
  return raw ? JSON.parse(raw) : []
}

async function saveAll(kv, key, data) {
  await kv.put(key, JSON.stringify(data))
}

async function handleAPI(request, env) {
  const url = new URL(request.url)
  const path = url.pathname
  const method = request.method

  // Cards
  if (path === '/api/cards' && method === 'GET') {
    return json(await getAll(env.INVENTORY, CARDS_KEY))
  }
  if (path === '/api/cards' && method === 'POST') {
    const body = await request.json()
    const cards = await getAll(env.INVENTORY, CARDS_KEY)
    const card = { id: uid(), createdAt: Date.now(), ...body }
    cards.push(card)
    await saveAll(env.INVENTORY, CARDS_KEY, cards)
    return json(card, 201)
  }
  const cardMatch = path.match(/^\/api\/cards\/([^/]+)$/)
  if (cardMatch) {
    const id = cardMatch[1]
    const cards = await getAll(env.INVENTORY, CARDS_KEY)
    if (method === 'PUT') {
      const body = await request.json()
      const idx = cards.findIndex(c => c.id === id)
      if (idx === -1) return json({ error: 'not found' }, 404)
      cards[idx] = { ...cards[idx], ...body }
      await saveAll(env.INVENTORY, CARDS_KEY, cards)
      return json(cards[idx])
    }
    if (method === 'DELETE') {
      const filtered = cards.filter(c => c.id !== id)
      await saveAll(env.INVENTORY, CARDS_KEY, filtered)
      return json({ ok: true })
    }
  }

  // Locations
  if (path === '/api/locations' && method === 'GET') {
    return json(await getAll(env.INVENTORY, LOCATIONS_KEY))
  }
  if (path === '/api/locations' && method === 'POST') {
    const body = await request.json()
    const locations = await getAll(env.INVENTORY, LOCATIONS_KEY)
    const loc = { id: uid(), createdAt: Date.now(), ...body }
    locations.push(loc)
    await saveAll(env.INVENTORY, LOCATIONS_KEY, locations)
    return json(loc, 201)
  }
  const locMatch = path.match(/^\/api\/locations\/([^/]+)$/)
  if (locMatch) {
    const id = locMatch[1]
    const locations = await getAll(env.INVENTORY, LOCATIONS_KEY)
    if (method === 'DELETE') {
      await saveAll(env.INVENTORY, LOCATIONS_KEY, locations.filter(l => l.id !== id))
      // Remove locationId from cards in this location
      const cards = await getAll(env.INVENTORY, CARDS_KEY)
      const updated = cards.map(c => c.locationId === id ? { ...c, locationId: null } : c)
      await saveAll(env.INVENTORY, CARDS_KEY, updated)
      return json({ ok: true })
    }
  }

  // Bulk import
  if (path === '/api/cards/bulk' && method === 'POST') {
    const body = await request.json()
    if (!Array.isArray(body)) return json({ error: 'expected array' }, 400)
    const cards = await getAll(env.INVENTORY, CARDS_KEY)
    const now = Date.now()
    const added = body.map(b => ({ id: uid(), createdAt: now, ...b }))
    await saveAll(env.INVENTORY, CARDS_KEY, [...cards, ...added])
    return json({ imported: added.length }, 201)
  }

  // Location view (for QR scan)
  const locViewMatch = path.match(/^\/location\/([^/]+)$/)
  if (locViewMatch && method === 'GET') {
    const id = locViewMatch[1]
    const [locations, cards] = await Promise.all([
      getAll(env.INVENTORY, LOCATIONS_KEY),
      getAll(env.INVENTORY, CARDS_KEY),
    ])
    const loc = locations.find(l => l.id === id)
    if (!loc) return new Response('Location not found', { status: 404 })
    const locCards = cards.filter(c => c.locationId === id)
    return new Response(locationPage(loc, locCards), {
      headers: { 'Content-Type': 'text/html;charset=UTF-8' },
    })
  }

  return json({ error: 'not found' }, 404)
}

function locationPage(loc, cards) {
  const rows = cards.length
    ? cards.map(c => `
      <tr>
        <td>${esc(c.name)}</td>
        <td>${esc(c.set || '-')}</td>
        <td>${esc(c.number || '-')}</td>
        <td>${esc(c.condition || '-')}</td>
        <td>${c.quantity ?? 1}</td>
      </tr>`).join('')
    : '<tr><td colspan="5" style="text-align:center;color:#888">此位置沒有卡片</td></tr>'

  return `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(loc.name)} — 寶可夢庫存</title>
<style>
  body{font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:16px;background:#f5f5f5}
  h1{color:#e63946;margin:0 0 4px}
  p{color:#555;margin:0 0 16px}
  table{width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.1)}
  th{background:#e63946;color:#fff;padding:10px 12px;text-align:left;font-size:.85rem}
  td{padding:10px 12px;border-bottom:1px solid #eee;font-size:.9rem}
  tr:last-child td{border-bottom:none}
</style>
</head>
<body>
<h1>📦 ${esc(loc.name)}</h1>
<p>${esc(loc.description || '')} — ${rows} 張卡片</p>
<table>
  <thead><tr><th>名稱</th><th>系列</th><th>編號</th><th>狀態</th><th>數量</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
</body>
</html>`
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

const HTML = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>🃏 寶可夢卡牌庫存</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
<script src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"></script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:system-ui,sans-serif;background:#f0f2f5;min-height:100vh}
header{background:#e63946;color:#fff;padding:16px 20px;display:flex;align-items:center;gap:12px}
header h1{font-size:1.3rem}
.tabs{display:flex;background:#fff;border-bottom:2px solid #e63946}
.tab{padding:12px 20px;cursor:pointer;font-weight:600;color:#666;border-bottom:3px solid transparent;margin-bottom:-2px}
.tab.active{color:#e63946;border-bottom-color:#e63946}
.page{display:none;padding:16px;max-width:900px;margin:0 auto}
.page.active{display:block}
.toolbar{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap}
input[type=text],select{padding:8px 12px;border:1px solid #ddd;border-radius:6px;font-size:.9rem;flex:1;min-width:120px}
button{padding:8px 16px;border:none;border-radius:6px;cursor:pointer;font-size:.9rem;font-weight:600}
.btn-primary{background:#e63946;color:#fff}
.btn-secondary{background:#fff;color:#333;border:1px solid #ddd}
.btn-danger{background:#fff;color:#e63946;border:1px solid #e63946}
.btn-sm{padding:4px 10px;font-size:.8rem}
.card-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
.card-item{background:#fff;border-radius:10px;padding:14px;box-shadow:0 1px 4px rgba(0,0,0,.08)}
.card-item h3{font-size:1rem;margin-bottom:6px;color:#222}
.card-meta{font-size:.8rem;color:#666;display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}
.tag{background:#f0f2f5;padding:2px 8px;border-radius:10px}
.tag.loc{background:#e8f4fd;color:#1a6fa8}
.card-actions{display:flex;gap:6px;margin-top:8px}
.loc-list{display:grid;gap:10px}
.loc-item{background:#fff;border-radius:10px;padding:14px;box-shadow:0 1px 4px rgba(0,0,0,.08);display:flex;align-items:center;gap:12px}
.loc-info{flex:1}
.loc-info h3{font-size:1rem;color:#222}
.loc-info p{font-size:.8rem;color:#666;margin-top:2px}
.qr-wrap{width:80px;height:80px;flex-shrink:0}
.qr-wrap canvas,.qr-wrap img{width:80px!important;height:80px!important}
.modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:100;align-items:center;justify-content:center}
.modal.open{display:flex}
.modal-box{background:#fff;border-radius:12px;padding:24px;width:90%;max-width:420px}
.modal-box h2{margin-bottom:16px;font-size:1.1rem}
.form-group{margin-bottom:12px}
.form-group label{display:block;font-size:.85rem;color:#555;margin-bottom:4px}
.form-group input,.form-group select,.form-group textarea{width:100%;padding:8px 12px;border:1px solid #ddd;border-radius:6px;font-size:.9rem}
.form-group textarea{height:60px;resize:vertical}
.modal-actions{display:flex;gap:8px;margin-top:16px;justify-content:flex-end}
.badge{display:inline-block;background:#e8f4fd;color:#1a6fa8;font-size:.75rem;padding:2px 8px;border-radius:10px}
.empty{text-align:center;padding:40px;color:#999}
</style>
</head>
<body>
<header>
  <span style="font-size:2rem">🃏</span>
  <div><h1>寶可夢卡牌庫存</h1><div style="font-size:.8rem;opacity:.85">Pokemon Card Inventory</div></div>
</header>
<div class="tabs">
  <div class="tab active" onclick="showTab('cards')">卡片清單</div>
  <div class="tab" onclick="showTab('locations')">儲存位置</div>
</div>

<!-- Cards Tab -->
<div id="tab-cards" class="page active">
  <div class="toolbar">
    <input type="text" id="search" placeholder="搜尋卡片名稱、系列..." oninput="renderCards()">
    <select id="filter-loc" onchange="renderCards()"><option value="">所有位置</option></select>
    <button class="btn-primary" onclick="openCardModal()">＋ 新增卡片</button>
    <button class="btn-secondary" onclick="openImportModal()">📥 Excel 匯入</button>
    <button class="btn-secondary" onclick="downloadTemplate()">📄 下載範本</button>
  </div>
  <div id="card-grid" class="card-grid"></div>
</div>

<!-- Locations Tab -->
<div id="tab-locations" class="page">
  <div class="toolbar">
    <button class="btn-primary" onclick="openLocModal()">＋ 新增位置</button>
  </div>
  <div id="loc-list" class="loc-list"></div>
</div>

<!-- Card Modal -->
<div class="modal" id="card-modal">
  <div class="modal-box">
    <h2 id="card-modal-title">新增卡片</h2>
    <div class="form-group"><label>卡片名稱 *</label><input id="c-name" type="text" placeholder="例：皮卡丘"></div>
    <div class="form-group"><label>系列</label><input id="c-set" type="text" placeholder="例：Base Set"></div>
    <div class="form-group"><label>卡片編號</label><input id="c-number" type="text" placeholder="例：58/102"></div>
    <div class="form-group"><label>狀態</label>
      <select id="c-condition">
        <option value="">未標記</option>
        <option value="Mint">Mint (M)</option>
        <option value="Near Mint">Near Mint (NM)</option>
        <option value="Excellent">Excellent (EX)</option>
        <option value="Good">Good (GD)</option>
        <option value="Light Played">Light Played (LP)</option>
        <option value="Played">Played (PL)</option>
        <option value="Poor">Poor (PR)</option>
      </select>
    </div>
    <div class="form-group"><label>數量</label><input id="c-quantity" type="number" value="1" min="1"></div>
    <div class="form-group"><label>儲存位置</label><select id="c-location"><option value="">未指定</option></select></div>
    <div class="form-group"><label>備註</label><textarea id="c-notes" placeholder="例：閃卡、限定版..."></textarea></div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal('card-modal')">取消</button>
      <button class="btn-primary" onclick="saveCard()">儲存</button>
    </div>
  </div>
</div>

<!-- Location Modal -->
<div class="modal" id="loc-modal">
  <div class="modal-box">
    <h2>新增儲存位置</h2>
    <div class="form-group"><label>位置名稱 *</label><input id="l-name" type="text" placeholder="例：Box A-1、活頁本第3頁"></div>
    <div class="form-group"><label>說明</label><input id="l-desc" type="text" placeholder="例：書架第二層左側"></div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal('loc-modal')">取消</button>
      <button class="btn-primary" onclick="saveLoc()">儲存</button>
    </div>
  </div>
</div>

<!-- Import Modal -->
<div class="modal" id="import-modal">
  <div class="modal-box" style="max-width:600px">
    <h2>📥 Excel 匯入</h2>
    <p style="font-size:.85rem;color:#666;margin-bottom:12px">支援 .xlsx / .xls / .csv。欄位標題需包含：名稱（必填）、系列、編號、狀態、數量、位置、備註</p>
    <div class="form-group">
      <input type="file" id="import-file" accept=".xlsx,.xls,.csv" onchange="parseImportFile(this)">
    </div>
    <div id="import-preview" style="display:none">
      <div style="font-size:.85rem;color:#555;margin-bottom:8px" id="import-summary"></div>
      <div style="overflow-x:auto;max-height:220px;overflow-y:auto;border:1px solid #eee;border-radius:6px">
        <table style="width:100%;border-collapse:collapse;font-size:.8rem" id="import-table"></table>
      </div>
      <div style="margin-top:8px;font-size:.8rem;color:#e63946" id="import-warn"></div>
    </div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal('import-modal')">取消</button>
      <button class="btn-primary" id="import-btn" onclick="doImport()" disabled>匯入</button>
    </div>
  </div>
</div>

<!-- QR Modal -->
<div class="modal" id="qr-modal">
  <div class="modal-box" style="text-align:center">
    <h2 id="qr-modal-title"></h2>
    <div id="qr-modal-code" style="display:flex;justify-content:center;margin:16px 0"></div>
    <p id="qr-modal-url" style="font-size:.75rem;color:#888;word-break:break-all;margin-bottom:16px"></p>
    <button class="btn-secondary" onclick="closeModal('qr-modal')">關閉</button>
  </div>
</div>

<script>
let cards = [], locations = [], editCardId = null

async function load() {
  const [c, l] = await Promise.all([
    fetch('/api/cards').then(r => r.json()),
    fetch('/api/locations').then(r => r.json()),
  ])
  cards = c; locations = l
  renderCards(); renderLocs(); populateLocSelects()
}

function showTab(t) {
  document.querySelectorAll('.tab').forEach((el,i) => el.classList.toggle('active', ['cards','locations'][i] === t))
  document.querySelectorAll('.page').forEach(el => el.classList.remove('active'))
  document.getElementById('tab-' + t).classList.add('active')
}

function populateLocSelects() {
  const opts = locations.map(l => \`<option value="\${l.id}">\${esc(l.name)}</option>\`).join('')
  document.getElementById('c-location').innerHTML = '<option value="">未指定</option>' + opts
  document.getElementById('filter-loc').innerHTML = '<option value="">所有位置</option>' + opts
}

function renderCards() {
  const q = document.getElementById('search').value.toLowerCase()
  const fl = document.getElementById('filter-loc').value
  const filtered = cards.filter(c => {
    const matchQ = !q || (c.name+c.set+c.number+c.notes).toLowerCase().includes(q)
    const matchL = !fl || c.locationId === fl
    return matchQ && matchL
  })
  const grid = document.getElementById('card-grid')
  if (!filtered.length) { grid.innerHTML = '<div class="empty">沒有找到卡片</div>'; return }
  grid.innerHTML = filtered.map(c => {
    const loc = locations.find(l => l.id === c.locationId)
    return \`<div class="card-item">
      <h3>\${esc(c.name)}</h3>
      <div class="card-meta">
        \${c.set ? \`<span class="tag">\${esc(c.set)}</span>\` : ''}
        \${c.number ? \`<span class="tag">#\${esc(c.number)}</span>\` : ''}
        \${c.condition ? \`<span class="tag">\${esc(c.condition)}</span>\` : ''}
        \${c.quantity > 1 ? \`<span class="tag">x\${c.quantity}</span>\` : ''}
        \${loc ? \`<span class="tag loc">📦 \${esc(loc.name)}</span>\` : ''}
      </div>
      \${c.notes ? \`<div style="font-size:.8rem;color:#888;margin-bottom:6px">\${esc(c.notes)}</div>\` : ''}
      <div class="card-actions">
        <button class="btn-sm btn-secondary" onclick="openCardModal('\${c.id}')">編輯</button>
        <button class="btn-sm btn-danger" onclick="deleteCard('\${c.id}')">刪除</button>
      </div>
    </div>\`
  }).join('')
}

function renderLocs() {
  const list = document.getElementById('loc-list')
  if (!locations.length) { list.innerHTML = '<div class="empty">還沒有位置，請新增</div>'; return }
  list.innerHTML = locations.map(l => {
    const count = cards.filter(c => c.locationId === l.id).length
    return \`<div class="loc-item">
      <div class="loc-info">
        <h3>📦 \${esc(l.name)}</h3>
        <p>\${esc(l.description || '')} \${count > 0 ? \`<span class="badge">\${count} 張</span>\` : ''}</p>
      </div>
      <div class="qr-wrap" id="qr-\${l.id}"></div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <button class="btn-sm btn-secondary" onclick="showQR('\${l.id}')">放大 QR</button>
        <button class="btn-sm btn-danger" onclick="deleteLoc('\${l.id}')">刪除</button>
      </div>
    </div>\`
  }).join('')
  // Render mini QR codes
  locations.forEach(l => {
    const url = location.origin + '/location/' + l.id
    new QRCode(document.getElementById('qr-' + l.id), { text: url, width: 80, height: 80, correctLevel: QRCode.CorrectLevel.M })
  })
}

function openCardModal(id) {
  editCardId = id || null
  document.getElementById('card-modal-title').textContent = id ? '編輯卡片' : '新增卡片'
  const c = id ? cards.find(x => x.id === id) : {}
  document.getElementById('c-name').value = c.name || ''
  document.getElementById('c-set').value = c.set || ''
  document.getElementById('c-number').value = c.number || ''
  document.getElementById('c-condition').value = c.condition || ''
  document.getElementById('c-quantity').value = c.quantity ?? 1
  document.getElementById('c-location').value = c.locationId || ''
  document.getElementById('c-notes').value = c.notes || ''
  document.getElementById('card-modal').classList.add('open')
}

async function saveCard() {
  const name = document.getElementById('c-name').value.trim()
  if (!name) { alert('請輸入卡片名稱'); return }
  const data = {
    name,
    set: document.getElementById('c-set').value.trim(),
    number: document.getElementById('c-number').value.trim(),
    condition: document.getElementById('c-condition').value,
    quantity: parseInt(document.getElementById('c-quantity').value) || 1,
    locationId: document.getElementById('c-location').value || null,
    notes: document.getElementById('c-notes').value.trim(),
  }
  if (editCardId) {
    await fetch('/api/cards/' + editCardId, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) })
  } else {
    await fetch('/api/cards', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(data) })
  }
  closeModal('card-modal'); await load()
}

async function deleteCard(id) {
  if (!confirm('確定要刪除這張卡片嗎？')) return
  await fetch('/api/cards/' + id, { method: 'DELETE' })
  await load()
}

function openLocModal() {
  document.getElementById('l-name').value = ''
  document.getElementById('l-desc').value = ''
  document.getElementById('loc-modal').classList.add('open')
}

async function saveLoc() {
  const name = document.getElementById('l-name').value.trim()
  if (!name) { alert('請輸入位置名稱'); return }
  await fetch('/api/locations', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ name, description: document.getElementById('l-desc').value.trim() })
  })
  closeModal('loc-modal'); await load()
}

async function deleteLoc(id) {
  if (!confirm('刪除此位置？該位置的卡片將變為「未指定」')) return
  await fetch('/api/locations/' + id, { method: 'DELETE' })
  await load()
}

function showQR(locId) {
  const loc = locations.find(l => l.id === locId)
  const url = location.origin + '/location/' + locId
  document.getElementById('qr-modal-title').textContent = '📦 ' + loc.name
  document.getElementById('qr-modal-url').textContent = url
  const container = document.getElementById('qr-modal-code')
  container.innerHTML = ''
  new QRCode(container, { text: url, width: 200, height: 200, correctLevel: QRCode.CorrectLevel.M })
  document.getElementById('qr-modal').classList.add('open')
}

function closeModal(id) { document.getElementById(id).classList.remove('open') }

function esc(s) {
  return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

// --- Excel Import ---
let importRows = []

const COL_MAP = {
  '名稱': 'name', 'name': 'name', 'card name': 'name', '卡片名稱': 'name',
  '系列': 'set', 'set': 'set', 'series': 'set',
  '編號': 'number', 'number': 'number', 'no': 'number', 'card no': 'number',
  '狀態': 'condition', 'condition': 'condition', 'grade': 'condition',
  '數量': 'quantity', 'quantity': 'quantity', 'qty': 'quantity', 'count': 'quantity',
  '位置': 'location', 'location': 'location', 'box': 'location', '儲存位置': 'location',
  '備註': 'notes', 'notes': 'notes', 'note': 'notes', 'remark': 'notes',
}

function openImportModal() {
  importRows = []
  document.getElementById('import-file').value = ''
  document.getElementById('import-preview').style.display = 'none'
  document.getElementById('import-btn').disabled = true
  document.getElementById('import-modal').classList.add('open')
}

function parseImportFile(input) {
  const file = input.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = e => {
    const wb = XLSX.read(e.target.result, { type: 'array' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
    if (raw.length < 2) { alert('檔案沒有資料'); return }

    const headers = raw[0].map(h => String(h).trim().toLowerCase())
    const fieldMap = headers.map(h => COL_MAP[h] || null)
    const nameIdx = fieldMap.indexOf('name')
    if (nameIdx === -1) { alert('找不到「名稱」欄位，請確認標題列'); return }

    importRows = raw.slice(1).filter(row => row[nameIdx]).map(row => {
      const card = {}
      fieldMap.forEach((field, i) => {
        if (!field || field === 'location') return
        const val = String(row[i] ?? '').trim()
        if (val) card[field] = field === 'quantity' ? (parseInt(val) || 1) : val
      })
      // resolve location name → id
      const locIdx = fieldMap.indexOf('location')
      if (locIdx !== -1 && row[locIdx]) {
        const locName = String(row[locIdx]).trim()
        const found = locations.find(l => l.name.toLowerCase() === locName.toLowerCase())
        if (found) card.locationId = found.id
        else card._locName = locName  // unresolved — shown as warning
      }
      return card
    })

    const unresolved = [...new Set(importRows.filter(r => r._locName).map(r => r._locName))]
    const warn = unresolved.length ? \`⚠️ 找不到位置：\${unresolved.join('、')}，這些卡片將設為「未指定」\` : ''
    document.getElementById('import-warn').textContent = warn
    document.getElementById('import-summary').textContent = \`共 \${importRows.length} 筆資料\`

    // Preview table
    const previewFields = ['name','set','number','condition','quantity','_locName']
    const head = '<thead style="background:#f0f2f5"><tr>' + ['名稱','系列','編號','狀態','數量','位置'].map(h => \`<th style="padding:6px 10px;text-align:left">\${h}</th>\`).join('') + '</tr></thead>'
    const body = '<tbody>' + importRows.slice(0, 8).map(r =>
      '<tr style="border-bottom:1px solid #eee">' + previewFields.map(f => \`<td style="padding:6px 10px">\${esc(r[f] || (f==='_locName'?'':'-'))}</td>\`).join('') + '</tr>'
    ).join('') + (importRows.length > 8 ? \`<tr><td colspan="6" style="padding:6px 10px;color:#888">…還有 \${importRows.length-8} 筆</td></tr>\` : '') + '</tbody>'
    document.getElementById('import-table').innerHTML = head + body
    document.getElementById('import-preview').style.display = 'block'
    document.getElementById('import-btn').disabled = false
  }
  reader.readAsArrayBuffer(file)
}

async function doImport() {
  const clean = importRows.map(({ _locName, ...r }) => r)
  const res = await fetch('/api/cards/bulk', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(clean)
  })
  const data = await res.json()
  closeModal('import-modal')
  await load()
  alert(\`成功匯入 \${data.imported} 張卡片！\`)
}

function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([
    ['名稱','系列','編號','狀態','數量','位置','備註'],
    ['皮卡丘','Base Set','58/102','Near Mint',1,'Box A-1',''],
    ['噴火龍','Base Set','4/102','Mint',1,'Box A-1','閃卡'],
  ])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Cards')
  XLSX.writeFile(wb, 'pokemon-inventory-template.xlsx')
}

// Close modal on backdrop click
document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m) m.classList.remove('open') }))

load()
</script>
</body>
</html>`

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': '*', 'Access-Control-Allow-Headers': '*' } })
    }

    // API routes
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/location/')) {
      return handleAPI(request, env)
    }

    // Serve frontend
    return new Response(HTML, { headers: { 'Content-Type': 'text/html;charset=UTF-8' } })
  },
}
