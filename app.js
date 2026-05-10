// --- CONFIGURATION ---
const CLOUD_NAME = "YOUR_CLOUDINARY_NAME"; // Replace with your cloud name
const UPLOAD_PRESET = "keval_shop_preset";
const db = firebase.database();

// --- APP STATE ---
let products = [];
let isAdmin = false;
let configuredVariants = [];
let configuredColors = [];
let audioOn = localStorage.getItem('keval_audio') !== 'OFF';
let adminPin = localStorage.getItem('keval_pin') || '1234';
let pinEnabled = localStorage.getItem('keval_pin_enabled') === 'ON';

// --- DATABASE SYNC ---
db.ref('products').on('value', snap => {
  products = [];
  const data = snap.val();
  if (data) Object.keys(data).forEach(k => products.push({ id: k, ...data[k] }));
  isAdmin ? renderAdmin() : renderUser();
  updateFilters();
});

// --- CLOUDINARY ENGINE ---
async function uploadToCloudinary(file) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', UPLOAD_PRESET);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body: formData });
  const result = await res.json();
  return result.secure_url;
}

// --- USER VIEW ---
function renderUser() {
  const grid = document.getElementById('productGrid');
  const q = document.getElementById('userSearch').value.toLowerCase();
  grid.innerHTML = '';
  products.filter(p => p.model.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q)).forEach(p => {
    const card = document.createElement('div');
    card.className = 'card';
    card.onclick = () => openDetails(p.id);
    const img = p.colors?.[0]?.url || 'https://placehold.co/400x400/000/00f0ff?text=No+Image';
    const price = p.variants?.[0]?.price || 0;
    card.innerHTML = `
      <div class="card-img-box"><img src="${img}"></div>
      <div style="color:var(--cyan); font-size:0.7rem; font-weight:bold;">${p.brand} • ${p.series}</div>
      <h3 style="margin:5px 0;">${p.model}</h3>
      <div class="neon-price">₹${price.toLocaleString('en-IN')}</div>
    `;
    grid.appendChild(card);
  });
}

// --- ADMIN VIEW ---
function renderAdmin() {
  const list = document.getElementById('adminList');
  const q = document.getElementById('adminSearch').value.toLowerCase();
  list.innerHTML = '';
  products.filter(p => p.model.toLowerCase().includes(q)).forEach(p => {
    const div = document.createElement('div');
    div.className = 'admin-item';
    div.innerHTML = `
      <div><strong>${p.brand} ${p.model}</strong><br><small>Stock: ${p.variants?.[0]?.stock || 0}</small></div>
      <div style="display:flex; gap:8px;">
        <button onclick="openLedger('${p.id}')" class="btn-neon-green">📦</button>
        <button onclick="editEntry('${p.id}')" class="btn-neon-cyan">✏️</button>
        <button onclick="deleteEntry('${p.id}')" class="btn-red-mini">🗑️</button>
      </div>
    `;
    list.appendChild(div);
  });
}

// --- CORE FUNCTIONS ---
function toggleModal(id, show) { document.getElementById(id).classList.toggle('hidden', !show); }

async function handleForm(e) {
  e.preventDefault();
  const id = document.getElementById('editId').value || "ITEM_" + Date.now();
  const p = products.find(x => x.id === id);
  const data = {
    id, brand: document.getElementById('pBrand').value, category: document.getElementById('pCat').value,
    series: document.getElementById('pSeries').value, model: document.getElementById('pModel').value,
    dealer: document.getElementById('pDealer').value, specs: document.getElementById('pSpecs').value.split('\n'),
    variants: configuredVariants, colors: configuredColors, ledger: p?.ledger || []
  };
  await db.ref('products/' + id).set(data);
  toggleModal('entryModal', false);
  clearForm();
}

async function addColorSlot() {
  const name = prompt("Color Name:");
  if (!name) return;
  const input = document.createElement('input'); input.type = 'file';
  input.onchange = async () => {
    const url = await uploadToCloudinary(input.files[0]);
    configuredColors.push({ name, url });
    renderColorSlots();
  };
  input.click();
}

function renderColorSlots() {
  const cont = document.getElementById('colorContainer');
  cont.innerHTML = configuredColors.map((c, i) => `
    <div class="admin-item" style="padding:5px; margin-top:5px;">
      <img src="${c.url}" width="30"> <span>${c.name}</span>
      <button type="button" onclick="configuredColors.splice(${i},1);renderColorSlots();" class="btn-red-mini">✕</button>
    </div>
  `).join('');
}

// --- LEDGER ---
let activeLedgerId = '';
function openLedger(id) {
  activeLedgerId = id;
  const p = products.find(x => x.id === id);
  const vSel = document.getElementById('lVar');
  vSel.innerHTML = p.variants.map((v, i) => `<option value="${i}">${v.name}</option>`).join('');
  renderLedgerHistory(p);
  toggleModal('ledgerModal', true);
}

async function commitLedger() {
  const p = products.find(x => x.id === activeLedgerId);
  const idx = document.getElementById('lVar').value;
  const qty = parseInt(document.getElementById('lQty').value);
  const type = document.getElementById('lType').value;
  
  if (type === 'SALE') p.variants[idx].stock -= qty;
  else p.variants[idx].stock += qty;

  if (!p.ledger) p.ledger = [];
  p.ledger.push({ type, qty, variant: p.variants[idx].name, date: new Date().toLocaleDateString(), note: document.getElementById('lNote').value });
  
  await db.ref('products/' + activeLedgerId).set(p);
  openLedger(activeLedgerId);
}

function renderLedgerHistory(p) {
  const hist = document.getElementById('ledgerHistory');
  hist.innerHTML = (p.ledger || []).map((l, i) => `
    <div class="ledger-row ${l.type.toLowerCase()}">
      <span>${l.type}: ${l.qty} (${l.variant})</span>
      <button onclick="deleteLedgerRow('${p.id}', ${i})" class="btn-red-mini">UNDO</button>
    </div>
  `).join('');
}

async function deleteLedgerRow(id, idx) {
  const p = products.find(x => x.id === id);
  const row = p.ledger[idx];
  const vIdx = p.variants.findIndex(v => v.name === row.variant);
  if (vIdx > -1) {
    if (row.type === 'SALE') p.variants[vIdx].stock += row.qty;
    else p.variants[vIdx].stock -= row.qty;
  }
  p.ledger.splice(idx, 1);
  await db.ref('products/' + id).set(p);
  openLedger(id);
}

// --- UI TOGGLES ---
document.getElementById('btnAdminToggle').onclick = () => {
  if (isAdmin) { isAdmin = false; renderUser(); document.getElementById('adminView').classList.add('hidden'); document.getElementById('userView').classList.remove('hidden'); }
  else { if (pinEnabled) toggleModal('pinGate', true); else { isAdmin = true; renderAdmin(); document.getElementById('adminView').classList.remove('hidden'); document.getElementById('userView').classList.add('hidden'); } }
};

function verifyPin() {
  if (document.getElementById('pinInput').value === adminPin) { isAdmin = true; toggleModal('pinGate', false); renderAdmin(); document.getElementById('adminView').classList.remove('hidden'); document.getElementById('userView').classList.add('hidden'); }
  else { alert("INVALID PIN"); }
}

document.getElementById('btnCreateEntry').onclick = () => { clearForm(); toggleModal('entryModal', true); };
document.getElementById('productForm').onsubmit = handleForm;
document.getElementById('userSearch').oninput = renderUser;
document.getElementById('adminSearch').oninput = renderAdmin;
