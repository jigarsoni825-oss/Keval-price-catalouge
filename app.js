// ==========================================
// 1. CLOUDINARY & FIREBASE CONFIG
// ==========================================
const CLOUD_NAME = "YOUR_NAME_HERE"; // IMPORTANT: Replace with your Cloudinary Cloud Name
const UPLOAD_PRESET = "keval_shop_preset";
const db = firebase.database();

// ==========================================
// 2. STATE & AUDIO SYSTEM
// ==========================================
let products = [];
let configuredVariants = [];
let configuredColors = [];
let isAdmin = false;
let audioOn = localStorage.getItem('keval_audio') !== 'OFF';
let adminPin = localStorage.getItem('keval_pin') || '1234';
let pinEnabled = localStorage.getItem('keval_pin_enabled') === 'ON';

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound() {
  if (!audioOn) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain); gain.connect(audioCtx.destination);
  osc.frequency.setValueAtTime(800, audioCtx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.03);
  gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
  gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.03);
  osc.start(); osc.stop(audioCtx.currentTime + 0.03);
}

// ==========================================
// 3. CLOUDINARY UPLOADER
// ==========================================
async function uploadToCloudinary(file) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', UPLOAD_PRESET);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: 'POST', body: formData });
  const data = await res.json();
  return data.secure_url; // Returns lightweight web link
}

// ==========================================
// 4. DATA SYNCHRONIZATION
// ==========================================
db.ref('products').on('value', snap => {
  products = [];
  const data = snap.val();
  if (data) Object.keys(data).forEach(k => products.push({id: k, ...data[k]}));
  buildFilters();
  if (isAdmin) renderAdmin(); else renderUser();
});

// ==========================================
// 5. ADMIN CONSOLE & QUICK EDIT
// ==========================================
function renderAdmin() {
  const list = document.getElementById('adminList');
  const q = document.getElementById('adminSearch').value.toLowerCase();
  list.innerHTML = '';
  products.filter(p => p.model.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q)).forEach(p => {
    const div = document.createElement('div');
    div.className = 'admin-item';
    const baseP = p.variants[0] ? p.variants[0].price : 0;
    div.innerHTML = `
      <div style="background:#111; padding:15px; border-radius:8px; border:1px solid var(--border); display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
        <div><strong>${p.brand} ${p.model}</strong><br><small>${p.category} • Dealer: ${p.dealer}</small></div>
        <div style="display:flex; gap:10px; align-items:center;">
          <input type="number" value="${baseP}" style="width:100px; background:#000; border:1px solid var(--cyan); color:var(--green); text-align:center;" onchange="quickUpdatePrice('${p.id}', this.value)">
          <button onclick="openLedger('${p.id}')" class="btn-neon-green">📦 STOCK</button>
          <button onclick="editEntry('${p.id}')" class="btn-neon-cyan">✏️</button>
          <button onclick="deleteEntry('${p.id}')" class="btn-red-mini">🗑️</button>
        </div>
      </div>
    `;
    list.appendChild(div);
  });
}

function quickUpdatePrice(id, newP) {
  const p = products.find(x => x.id === id);
  if (p && p.variants[0]) {
    p.variants[0].price = parseInt(newP);
    db.ref('products/' + id).set(p);
  }
}

// ==========================================
// 6. LEDGER CORE (Edit & Undo)
// ==========================================
let activeLedgerId = '';
function openLedger(id) {
  activeLedgerId = id;
  const p = products.find(x => x.id === id);
  const vSel = document.getElementById('lVar');
  vSel.innerHTML = p.variants.map((v, i) => `<option value="${i}">${v.name} (Cur: ${v.stock})</option>`).join('');
  renderLedgerHistory(p);
  toggleModal('ledgerModal', true);
}

function renderLedgerHistory(p) {
  const hist = document.getElementById('ledgerHistory');
  hist.innerHTML = (p.ledger || []).map((l, i) => `
    <div class="ledger-row ${l.type.toLowerCase()}">
      <div><strong>${l.type}:</strong> ${l.variant} (${l.qty})<br><small>${l.date} - ${l.note}</small></div>
      <button onclick="deleteLedgerRow('${p.id}', ${i})" class="btn-red-mini">UNDO</button>
    </div>
  `).join('');
}

async function commitLedger() {
  const p = products.find(x => x.id === activeLedgerId);
  const idx = document.getElementById('lVar').value;
  const type = document.getElementById('lType').value;
  const qty = parseInt(document.getElementById('lQty').value);
  const note = document.getElementById('lNote').value;

  if (type === 'SALE') p.variants[idx].stock -= qty;
  else p.variants[idx].stock += qty;

  const entry = { type, variant: p.variants[idx].name, qty, note, date: new Date().toLocaleDateString() };
  if (!p.ledger) p.ledger = [];
  p.ledger.push(entry);

  await db.ref('products/' + activeLedgerId).set(p);
  openLedger(activeLedgerId);
}

async function deleteLedgerRow(prodId, rowIdx) {
  if (!confirm("Revert stock and delete this record?")) return;
  const p = products.find(x => x.id === prodId);
  const row = p.ledger[rowIdx];
  const vIdx = p.variants.findIndex(v => v.name === row.variant);
  
  if (vIdx > -1) {
    if (row.type === 'SALE') p.variants[vIdx].stock += row.qty;
    else p.variants[vIdx].stock -= row.qty;
  }
  
  p.ledger.splice(rowIdx, 1);
  await db.ref('products/' + prodId).set(p);
  openLedger(prodId);
}

// ==========================================
// 7. FORM & MULTI-COLOUR HANDLING
// ==========================================
async function handleForm(e) {
  e.preventDefault();
  const id = document.getElementById('editId').value || "ITEM_" + Date.now();
  const specs = document.getElementById('pSpecs').value.split('\n').filter(s => s.trim());
  const existing = products.find(x => x.id === id);

  const data = {
    id, category: document.getElementById('pCat').value, brand: document.getElementById('pBrand').value,
    series: document.getElementById('pSeries').value, model: document.getElementById('pModel').value,
    dealer: document.getElementById('pDealer').value, specs,
    variants: configuredVariants, colors: configuredColors,
    ledger: existing ? (existing.ledger || []) : []
  };

  await db.ref('products/' + id).set(data);
  toggleModal('entryModal', false);
  clearForm();
}

async function addColorSlot() {
  const name = prompt("Enter Colour Name (e.g. Midnight Blue):");
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
    <div style="background:#000; padding:10px; margin-top:5px; border-radius:6px; display:flex; justify-content:space-between; align-items:center;">
      <img src="${c.url}" width="40" height="40" style="object-fit:cover;"> <span>${c.name}</span>
      <button type="button" onclick="configuredColors.splice(${i},1);renderColorSlots()" class="btn-red-mini">✕</button>
    </div>
  `).join('');
}

// ==========================================
// 8. USER VIEW & COMPARISON
// ==========================================
function renderUser() {
  const grid = document.getElementById('productGrid');
  const q = document.getElementById('userSearch').value.toLowerCase();
  grid.innerHTML = '';
  products.filter(p => p.model.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q)).forEach(p => {
    const card = document.createElement('div');
    card.className = 'card';
    card.onclick = (e) => { if(e.target.tagName !== 'BUTTON') openDetails(p.id); };
    const pic = p.colors && p.colors[0] ? p.colors[0].url : 'https://placehold.co/400x400/000/00f0ff?text=No+Pic';
    const basePrice = p.variants[0] ? p.variants[0].price : 0;
    
    card.innerHTML = `
      <div class="card-img-box"><img src="${pic}"></div>
      <div class="meta-brand">${p.brand} • ${p.series}</div>
      <h3 class="meta-model">${p.model}</h3>
      <div class="neon-price">₹${basePrice.toLocaleString('en-IN')}</div>
      <div style="font-size:0.7rem; color:var(--text-muted);">Dealer: ${p.dealer}</div>
    `;
    grid.appendChild(card);
  });
}

// ==========================================
// 9. UTILS & HELPERS
// ==========================================
function toggleModal(id, show) { document.getElementById(id).classList.toggle('hidden', !show); if(show) playSound(); }

function addVariant() {
  const n = document.getElementById('vName').value;
  const p = parseInt(document.getElementById('vPrice').value);
  const s = parseInt(document.getElementById('vStock').value);
  if(n && p) { configuredVariants.push({name:n, price:p, stock:s}); renderVariantPills(); }
}

function renderVariantPills() {
  document.getElementById('variantPills').innerHTML = configuredVariants.map((v, i) => `
    <span class="variant-pill active" onclick="configuredVariants.splice(${i},1);renderVariantPills()">${v.name} - ₹${v.price} ✕</span>
  `).join('');
}

function clearForm() {
  document.getElementById('productForm').reset();
  document.getElementById('editId').value = '';
  configuredVariants = []; configuredColors = [];
  renderVariantPills(); renderColorSlots();
}

// PIN Gate Logic
function verifyPin() {
  if(document.getElementById('pinInput').value === adminPin) { toggleModal('pinGate', false); isAdmin = true; renderAdmin(); }
  else { alert("WRONG PIN"); document.getElementById('pinInput').value = ''; }
}

document.getElementById('btnAdminToggle').onclick = () => {
  if(isAdmin) { isAdmin = false; renderUser(); }
  else { if(pinEnabled) toggleModal('pinGate', true); else { isAdmin = true; renderAdmin(); } }
};

document.getElementById('btnCreateEntry').onclick = () => { clearForm(); toggleModal('entryModal', true); };
document.getElementById('productForm').onsubmit = handleForm;
document.getElementById('userSearch').oninput = renderUser;
document.getElementById('adminSearch').oninput = renderAdmin;
