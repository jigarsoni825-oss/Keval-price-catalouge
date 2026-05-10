// ==========================================
// 1. CONFIGURATION (PASTE MANUALLY)
// ==========================================
const firebaseConfig = {
  // YOUR FIREBASE CONFIG HERE
};
const CLOUD_NAME = "YOUR_CLOUDINARY_NAME"; 
const UPLOAD_PRESET = "keval_shop_preset";

// --- INIT ---
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ==========================================
// 2. STATE & AUDIO
// ==========================================
let products = [];
let isAdmin = false;
let configuredVariants = [];
let configuredColors = [];
let compareQueue = [];
let audioOn = localStorage.getItem('keval_audio') !== 'OFF';
let adminPin = localStorage.getItem('keval_pin') || '1234';
let pinEnabled = localStorage.getItem('keval_pin_enabled') === 'ON';

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playClick() {
  if (!audioOn) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain); gain.connect(audioCtx.destination);
  osc.frequency.setValueAtTime(850, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.04);
  gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.04);
  osc.start(); osc.stop(audioCtx.currentTime + 0.04);
}

// ==========================================
// 3. CORE SYNC & UPLOAD
// ==========================================
db.ref('products').on('value', snap => {
  products = [];
  const data = snap.val();
  if (data) Object.keys(data).forEach(k => products.push({ id: k, ...data[k] }));
  isAdmin ? renderAdmin() : renderUser();
  updateFilters();
});

async function uploadImg(file) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', UPLOAD_PRESET);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body: formData });
  const result = await res.json();
  return result.secure_url;
}

// ==========================================
// 4. ADMIN PANEL LOGIC
// ==========================================
function renderAdmin() {
  const list = document.getElementById('adminList');
  const q = document.getElementById('adminSearch').value.toLowerCase();
  list.innerHTML = '';
  products.filter(p => p.model.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q)).forEach(p => {
    const div = document.createElement('div');
    div.className = 'admin-item';
    div.innerHTML = `
      <div style="background:#111; padding:15px; border-radius:10px; border:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <div><strong>${p.brand} ${p.model}</strong><br><small>Stock: ${p.variants?.[0]?.stock || 0}</small></div>
        <div style="display:flex; gap:10px;">
          <input type="number" value="${p.variants?.[0]?.price || 0}" style="width:100px; background:#000; border:1px solid var(--cyan); color:var(--green); text-align:center;" onchange="quickPrice('${p.id}', this.value)">
          <button onclick="openLedger('${p.id}')" class="btn-neon-green">📦</button>
          <button onclick="editEntry('${p.id}')" class="btn-neon-cyan">✏️</button>
          <button onclick="deleteProduct('${p.id}')" style="background:#ff3366;color:#fff;padding:5px 10px;">🗑️</button>
        </div>
      </div>
    `;
    list.appendChild(div);
  });
}

function quickPrice(id, newP) {
  const p = products.find(x => x.id === id);
  if (p && p.variants[0]) { p.variants[0].price = parseInt(newP); db.ref('products/' + id).set(p); }
}

function editEntry(id) {
  const p = products.find(x => x.id === id);
  clearForm();
  document.getElementById('editId').value = p.id;
  document.getElementById('pCat').value = p.category;
  document.getElementById('pBrand').value = p.brand;
  document.getElementById('pSeries').value = p.series;
  document.getElementById('pModel').value = p.model;
  document.getElementById('pDealer').value = p.dealer;
  document.getElementById('pSpecs').value = p.specs.join('\n');
  configuredVariants = [...p.variants];
  configuredColors = [...p.colors];
  renderVariants(); renderColors();
  toggleModal('entryModal', true);
}

async function deleteProduct(id) {
  if (confirm("Permanently delete this product?")) db.ref('products/' + id).remove();
}

// ==========================================
// 5. LEDGER ENGINE
// ==========================================
let activeLedgerId = '';
function openLedger(id) {
  activeLedgerId = id;
  const p = products.find(x => x.id === id);
  document.getElementById('lVar').innerHTML = p.variants.map((v, i) => `<option value="${i}">${v.name}</option>`).join('');
  renderLedgerHistory(p);
  toggleModal('ledgerModal', true);
}

async function commitLedger() {
  const p = products.find(x => x.id === activeLedgerId);
  const idx = document.getElementById('lVar').value;
  const qty = parseInt(document.getElementById('lQty').value);
  const type = document.getElementById('lType').value;
  if (type === 'SALE') p.variants[idx].stock -= qty; else p.variants[idx].stock += qty;
  if (!p.ledger) p.ledger = [];
  p.ledger.push({ type, qty, variant: p.variants[idx].name, date: new Date().toLocaleDateString(), note: document.getElementById('lNote').value });
  await db.ref('products/' + activeLedgerId).set(p);
  openLedger(activeLedgerId);
}

function renderLedgerHistory(p) {
  document.getElementById('ledgerHistory').innerHTML = (p.ledger || []).slice().reverse().map((l, i) => `
    <div class="ledger-row ${l.type.toLowerCase()}">
      <span>${l.type}: ${l.qty} (${l.variant})</span>
      <button onclick="undoLedger('${p.id}', ${p.ledger.length - 1 - i})" class="btn-red-mini">UNDO</button>
    </div>
  `).join('');
}

async function undoLedger(id, idx) {
  const p = products.find(x => x.id === id);
  const row = p.ledger[idx];
  const vIdx = p.variants.findIndex(v => v.name === row.variant);
  if (vIdx > -1) { if (row.type === 'SALE') p.variants[vIdx].stock += row.qty; else p.variants[vIdx].stock -= row.qty; }
  p.ledger.splice(idx, 1);
  await db.ref('products/' + id).set(p);
  openLedger(id);
}

// ==========================================
// 6. USER VIEW & COMPARISON
// ==========================================
function renderUser() {
  const grid = document.getElementById('productGrid');
  const q = document.getElementById('userSearch').value.toLowerCase();
  grid.innerHTML = '';
  products.filter(p => p.model.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q)).forEach(p => {
    const card = document.createElement('div');
    card.className = 'card';
    card.onclick = e => { if (e.target.tagName !== 'BUTTON') openDetails(p.id); };
    const img = p.colors?.[0]?.url || 'https://placehold.co/400x400/000/00f0ff?text=No+Image';
    card.innerHTML = `
      <div class="card-img-box"><img src="${img}"></div>
      <div style="color:var(--cyan);font-size:0.7rem;font-weight:bold;">${p.brand}</div>
      <h3 style="margin:5px 0;">${p.model}</h3>
      <div class="neon-price">₹${p.variants[0].price.toLocaleString('en-IN')}</div>
      <button onclick="addToCompare('${p.id}')" class="btn-neon-icon full-w">⚖️ COMPARE</button>
    `;
    grid.appendChild(card);
  });
}

function addToCompare(id) {
  if (compareQueue.includes(id)) return;
  if (compareQueue.length >= 5) return alert("Compare limit: 5");
  compareQueue.push(id);
  updateCompareDock();
}

function updateCompareDock() {
  const dock = document.getElementById('compareDock');
  const items = document.getElementById('dockItems');
  document.getElementById('compCount').innerText = compareQueue.length;
  if (compareQueue.length > 0) dock.classList.remove('hidden'); else dock.classList.add('hidden');
  items.innerHTML = compareQueue.map(id => {
    const p = products.find(x => x.id === id);
    return `<div class="dock-pill">${p.model} <span onclick="removeFromCompare('${id}')" style="color:red;margin-left:5px;">✕</span></div>`;
  }).join('');
}

function removeFromCompare(id) {
  compareQueue = compareQueue.filter(x => x !== id);
  updateCompareDock();
}

function clearCompare() { compareQueue = []; updateCompareDock(); }

function runMatrix() {
  const body = document.getElementById('matrixBody');
  let head = '<th>Specs</th>';
  let brands = '<td>Brand</td>';
  let models = '<td>Model</td>';
  let prices = '<td>Price</td>';
  let specs = '<td>Specs</td>';
  
  compareQueue.forEach(id => {
    const p = products.find(x => x.id === id);
    head += `<th><img src="${p.colors[0].url}" width="60"><br>${p.model}</th>`;
    brands += `<td>${p.brand}</td>`;
    models += `<td>${p.model}</td>`;
    prices += `<td>₹${p.variants[0].price}</td>`;
    specs += `<td>${p.specs.join('<br>')}</td>`;
  });

  body.innerHTML = `<table class="matrix-table"><tr>${head}</tr><tr>${brands}</tr><tr>${models}</tr><tr>${prices}</tr><tr>${specs}</tr></table>`;
  toggleModal('matrixModal', true);
}

// ==========================================
// 7. FORM UTILS
// ==========================================
function toggleModal(id, show) { document.getElementById(id).classList.toggle('hidden', !show); if(show) playClick(); }

async function addColorSlot() {
  const name = prompt("Color Name:");
  if (!name) return;
  const input = document.createElement('input'); input.type = 'file';
  input.onchange = async () => {
    const url = await uploadImg(input.files[0]);
    configuredColors.push({ name, url });
    renderColors();
  };
  input.click();
}

function renderColors() {
  document.getElementById('colorContainer').innerHTML = configuredColors.map((c, i) => `
    <div class="admin-item" style="padding:5px; margin-top:5px; border:1px solid #333;">
      <img src="${c.url}" width="30"> <span>${c.name}</span>
      <button type="button" onclick="configuredColors.splice(${i},1);renderColors();" class="btn-red-mini">✕</button>
    </div>
  `).join('');
}

function addVariant() {
  const n = document.getElementById('vName').value;
  const p = parseInt(document.getElementById('vPrice').value);
  const s = parseInt(document.getElementById('vStock').value);
  if (n && p) { configuredVariants.push({ name: n, price: p, stock: s }); renderVariants(); }
}

function renderVariants() {
  document.getElementById('variantPills').innerHTML = configuredVariants.map((v, i) => `
    <span class="variant-pill" style="background:#222;padding:5px 10px;margin:2px;display:inline-block;border-radius:15px;" onclick="configuredVariants.splice(${i},1);renderVariants();">${v.name} - ₹${v.price} ✕</span>
  `).join('');
}

function clearForm() {
  document.getElementById('productForm').reset();
  document.getElementById('editId').value = '';
  configuredVariants = []; configuredColors = [];
  renderVariants(); renderColors();
}

document.getElementById('productForm').onsubmit = async e => {
  e.preventDefault();
  const id = document.getElementById('editId').value || "ITEM_" + Date.now();
  const data = {
    id, brand: document.getElementById('pBrand').value, category: document.getElementById('pCat').value,
    series: document.getElementById('pSeries').value, model: document.getElementById('pModel').value,
    dealer: document.getElementById('pDealer').value, specs: document.getElementById('pSpecs').value.split('\n').filter(s=>s.trim()),
    variants: configuredVariants, colors: configuredColors
  };
  await db.ref('products/' + id).update(data);
  toggleModal('entryModal', false);
  clearForm();
};

// ==========================================
// 8. DETAILS VIEW
// ==========================================
function openDetails(id) {
  const p = products.find(x => x.id === id);
  document.getElementById('dTitle').innerText = p.model;
  document.getElementById('dPrice').innerText = `₹${p.variants[0].price.toLocaleString('en-IN')}`;
  document.getElementById('dStock').innerText = p.variants[0].stock;
  document.getElementById('dDealer').innerText = p.dealer;
  document.getElementById('dMainImg').src = p.colors[0].url;
  
  document.getElementById('dThumbs').innerHTML = p.colors.map(c => `
    <img src="${c.url}" class="thumb" onclick="document.getElementById('dMainImg').src='${c.url}'">
  `).join('');
  
  document.getElementById('dSpecs').innerHTML = p.specs.map(s => `<li>• ${s}</li>`).join('');
  document.getElementById('dVariants').innerHTML = p.variants.map(v => `
    <button class="btn-neon-icon" style="margin-right:5px;">${v.name}</button>
  `).join('');

  toggleModal('detailModal', true);
}

// PIN GATE
function verifyPin() {
  if (document.getElementById('pinInput').value === adminPin) { isAdmin = true; toggleModal('pinGate', false); renderAdmin(); document.getElementById('adminView').classList.remove('hidden'); document.getElementById('userView').classList.add('hidden'); }
  else { alert("INVALID PIN"); }
}

document.getElementById('btnAdminToggle').onclick = () => {
  if (isAdmin) { isAdmin = false; renderUser(); document.getElementById('adminView').classList.add('hidden'); document.getElementById('userView').classList.remove('hidden'); }
  else { if (pinEnabled) toggleModal('pinGate', true); else { isAdmin = true; renderAdmin(); document.getElementById('adminView').classList.remove('hidden'); document.getElementById('userView').classList.add('hidden'); } }
};

document.getElementById('btnCreateEntry').onclick = () => { clearForm(); toggleModal('entryModal', true); };
document.getElementById('userSearch').oninput = renderUser;
document.getElementById('adminSearch').oninput = renderAdmin;
