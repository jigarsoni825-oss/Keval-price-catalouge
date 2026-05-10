/* ============================================================
   KEVAL MOBILE ZONE | MASTER LOGIC ENGINE
   Designed & Developed By: Jigar
   Version: 4.0 (Full Production Stack)
   ============================================================ */

/**
 * SECTION 1: GLOBAL CONFIGURATION & DATA RECEPTACLES
 * ------------------------------------------------------------
 * These placeholders are where you will manually paste your
 * credentials. The app is built to fail-safe if these are empty.
 */

const firebaseConfig = {
    // PASTE YOUR FIREBASE SDK CONFIGURATION OBJECT HERE
};

// Cloudinary Identity (For High-Speed HD Image Delivery)
const CLOUD_NAME = "PASTE_YOUR_CLOUDINARY_NAME_HERE"; 
const UPLOAD_PRESET = "keval_shop_preset"; 

// Initialize Firebase Instance
if (firebaseConfig.apiKey && !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

/**
 * SECTION 2: APPLICATION STATE MANAGEMENT
 * ------------------------------------------------------------
 */
let allProducts = [];        // Master database snapshot
let currentViewData = [];    // Currently filtered products
let compareQueue = [];       // ID list for Comparison Matrix
let variantDrafts = [];      // Temporary storage for form variants
let colorDrafts = [];        // Temporary storage for form images/colors
let isAdmin = false;         // UI state toggle
let activeLedgerID = null;   // Reference for stock audit

// Persistent Audio Preferences
let audioEnabled = localStorage.getItem('keval_audio') !== 'OFF';
let adminPin = localStorage.getItem('keval_admin_pin') || '1234';
let pinRequired = localStorage.getItem('keval_pin_enabled') === 'ON';

/**
 * SECTION 3: AUDIO CONTROLLER (MODERN INTERFACE)
 * ------------------------------------------------------------
 * Uses Web Audio API for ultra-low latency interface clicks.
 */
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

function triggerSound(type = 'click') {
    if (!audioEnabled) return;
    if (audioContext.state === 'suspended') audioContext.resume();

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    const now = audioContext.currentTime;

    if (type === 'click') {
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, now);
        oscillator.frequency.exponentialRampToValueAtTime(300, now + 0.05);
        gainNode.gain.setValueAtTime(0.1, now);
        gainNode.gain.linearRampToValueAtTime(0, now + 0.05);
        oscillator.start();
        oscillator.stop(now + 0.05);
    } else if (type === 'success') {
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(523.25, now); // C5
        oscillator.frequency.setValueAtTime(659.25, now + 0.1); // E5
        gainNode.gain.setValueAtTime(0.1, now);
        gainNode.gain.linearRampToValueAtTime(0, now + 0.2);
        oscillator.start();
        oscillator.stop(now + 0.2);
    }
}

/**
 * SECTION 4: CLOUDINARY HD UPLOADER ENGINE
 * ------------------------------------------------------------
 * Processes local files and returns optimized secure URLs.
 */
async function processImageUpload(file) {
    if (!file) return null;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', UPLOAD_PRESET);

    try {
        const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
            method: 'POST',
            body: formData
        });
        const result = await response.json();
        return result.secure_url; // Returns the optimized web link
    } catch (err) {
        console.error("Asset Upload Failure:", err);
        alert("Image upload failed. Check Cloudinary credentials.");
        return null;
    }
}

/**
 * SECTION 5: FIREBASE REALTIME SYNCHRONIZER
 * ------------------------------------------------------------
 * Listens for any change in the database and updates the UI instantly.
 */
function initializeDataSync() {
    db.ref('products').on('value', (snapshot) => {
        const data = snapshot.val();
        allProducts = [];

        if (data) {
            Object.keys(data).forEach(key => {
                allProducts.push({ id: key, ...data[key] });
            });
        }

        // Auto-refresh UI based on current view
        buildDynamicFilterLists();
        isAdmin ? renderAdminConsole() : renderUserCatalog();
    });
}

/**
 * SECTION 6: USER UI ENGINE (SHOPPING FRONTEND)
 * ------------------------------------------------------------
 */
function renderUserCatalog() {
    const grid = document.getElementById('productGrid');
    const searchVal = document.getElementById('userSearch').value.toLowerCase();
    const catVal = document.getElementById('userFilterCat').value;
    const brandVal = document.getElementById('userFilterBrand').value;

    grid.innerHTML = '';

    const filtered = allProducts.filter(p => {
        const matchesSearch = p.model.toLowerCase().includes(searchVal) || 
                              p.brand.toLowerCase().includes(searchVal) ||
                              p.series.toLowerCase().includes(searchVal);
        const matchesCat = catVal === "" || p.category === catVal;
        const matchesBrand = brandVal === "" || p.brand === brandVal;
        return matchesSearch && matchesCat && matchesBrand;
    });

    filtered.forEach(product => {
        const primaryImg = product.colors?.[0]?.url || 'https://placehold.co/400x400/000/00f0ff?text=No+Preview';
        const basePrice = product.variants?.[0]?.price || 0;
        const baseStock = product.variants?.[0]?.stock || 0;

        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <div class="card-img-box" onclick="viewProductDetails('${product.id}')">
                <img src="${primaryImg}" alt="${product.model}">
            </div>
            <div class="card-brand">${product.brand} • ${product.series}</div>
            <h3 class="card-title" onclick="viewProductDetails('${product.id}')">${product.model}</h3>
            <div class="card-price">₹${basePrice.toLocaleString('en-IN')}</div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px;">
                <span style="font-size:0.7rem; color:${baseStock > 0 ? 'var(--neon-green)' : 'var(--neon-red)'}; font-weight:bold;">
                    ${baseStock > 0 ? 'IN STOCK' : 'OUT OF STOCK'}
                </span>
                <button onclick="addToComparison('${product.id}')" class="btn-neon-icon">⚖️ COMPARE</button>
            </div>
        `;
        grid.appendChild(card);
    });
}

function buildDynamicFilterLists() {
    const cats = [...new Set(allProducts.map(p => p.category))];
    const brands = [...new Set(allProducts.map(p => p.brand))];

    const catSelect = document.getElementById('userFilterCat');
    const brandSelect = document.getElementById('userFilterBrand');

    const prevCat = catSelect.value;
    const prevBrand = brandSelect.value;

    catSelect.innerHTML = '<option value="">ALL CATEGORIES</option>' + cats.map(c => `<option value="${c}">${c}</option>`).join('');
    brandSelect.innerHTML = '<option value="">ALL BRANDS</option>' + brands.map(b => `<option value="${b}">${b}</option>`).join('');

    catSelect.value = prevCat;
    brandSelect.value = prevBrand;
}

/**
 * SECTION 7: ADMIN CONSOLE ENGINE (BACKEND TOOLS)
 * ------------------------------------------------------------
 */
function renderAdminConsole() {
    const list = document.getElementById('adminList');
    const searchVal = document.getElementById('adminSearch').value.toLowerCase();
    list.innerHTML = '';

    const filtered = allProducts.filter(p => p.model.toLowerCase().includes(searchVal) || p.brand.toLowerCase().includes(searchVal));

    filtered.forEach(p => {
        const firstPrice = p.variants?.[0]?.price || 0;
        const totalStock = p.variants?.reduce((acc, v) => acc + (v.stock || 0), 0) || 0;

        const row = document.createElement('div');
        row.className = 'admin-item';
        row.innerHTML = `
            <div style="flex:1;">
                <div style="font-weight:900; color:#fff;">${p.brand} ${p.model}</div>
                <div style="font-size:0.7rem; color:var(--neon-cyan);">${p.category} | Dealer: ${p.dealer}</div>
                <div style="font-size:0.7rem; color:var(--text-dim);">Total Units: ${totalStock}</div>
            </div>
            <div style="display:flex; gap:12px; align-items:center;">
                <div style="display:flex; flex-direction:column; align-items:center;">
                   <label style="font-size:0.6rem; color:var(--neon-green);">QUICK PRICE</label>
                   <input type="number" value="${firstPrice}" class="neon-input" style="width:110px; margin:0; padding:8px; text-align:center; color:var(--neon-green);" 
                          onchange="updateProductPriceQuick('${p.id}', this.value)">
                </div>
                <button onclick="manageLedger('${p.id}')" class="btn-neon-purple" title="Stock Audit">📦</button>
                <button onclick="editProductEntry('${p.id}')" class="btn-neon-cyan" title="Edit Specs">✏️</button>
                <button onclick="deleteProductPermanent('${p.id}')" style="background:var(--neon-red); color:#fff; padding:10px;">🗑️</button>
            </div>
        `;
        list.appendChild(row);
    });
}

function updateProductPriceQuick(id, newVal) {
    const p = allProducts.find(x => x.id === id);
    if (p && p.variants[0]) {
        p.variants[0].price = parseInt(newVal);
        db.ref('products/' + id).set(p)
          .then(() => triggerSound('success'));
    }
}

/**
 * SECTION 8: STOCK AUDIT LEDGER (REVERSION LOGIC)
 * ------------------------------------------------------------
 */
function manageLedger(id) {
    activeLedgerID = id;
    const p = allProducts.find(x => x.id === id);
    
    // Fill Variant Dropdown
    const varSelect = document.getElementById('lVar');
    varSelect.innerHTML = p.variants.map((v, i) => `<option value="${i}">${v.name} (Cur: ${v.stock})</option>`).join('');

    // Clear Inputs
    document.getElementById('lQty').value = 1;
    document.getElementById('lNote').value = '';

    renderLedgerHistory(p);
    toggleModal('ledgerModal', true);
}

function renderLedgerHistory(product) {
    const container = document.getElementById('ledgerHistory');
    container.innerHTML = '';

    if (!product.ledger || product.ledger.length === 0) {
        container.innerHTML = '<div style="padding:20px; text-align:center; color:var(--text-dim);">NO TRANSACTION HISTORY</div>';
        return;
    }

    // Show newest first
    [...product.ledger].reverse().forEach((entry, index) => {
        const actualIndex = product.ledger.length - 1 - index;
        const row = document.createElement('div');
        row.className = `ledger-row ${entry.type === 'SALE' ? 'sale' : 'purchase'}`;
        row.innerHTML = `
            <div>
                <strong>${entry.type}: ${entry.variant}</strong><br>
                <small>${entry.date} | ${entry.note}</small>
            </div>
            <div style="display:flex; align-items:center; gap:15px;">
                <span style="font-weight:900;">${entry.type === 'SALE' ? '-' : '+'}${entry.qty}</span>
                <button onclick="revertLedgerTransaction('${product.id}', ${actualIndex})" class="btn-red-mini" style="background:var(--neon-red); color:#fff; padding:4px 8px; font-size:0.6rem;">UNDO</button>
            </div>
        `;
        container.appendChild(row);
    });
}

async function commitLedger() {
    const p = allProducts.find(x => x.id === activeLedgerID);
    const vIdx = document.getElementById('lVar').value;
    const type = document.getElementById('lType').value;
    const qty = parseInt(document.getElementById('lQty').value);
    const note = document.getElementById('lNote').value || "Manual Adjustment";

    if (isNaN(qty) || qty <= 0) return;

    // Adjust Stock
    if (type === 'SALE') {
        p.variants[vIdx].stock -= qty;
    } else {
        p.variants[vIdx].stock += qty;
    }

    // Add History
    const newEntry = {
        type,
        variant: p.variants[vIdx].name,
        qty,
        note,
        date: new Date().toLocaleString('en-IN')
    };

    if (!p.ledger) p.ledger = [];
    p.ledger.push(newEntry);

    await db.ref('products/' + activeLedgerID).set(p);
    triggerSound('success');
    manageLedger(activeLedgerID); // Refresh UI
}

async function revertLedgerTransaction(id, index) {
    if (!confirm("Are you sure you want to delete this record and REVERT the stock?")) return;

    const p = allProducts.find(x => x.id === id);
    const entry = p.ledger[index];

    // Find the variant to revert stock
    const vIdx = p.variants.findIndex(v => v.name === entry.variant);
    if (vIdx > -1) {
        if (entry.type === 'SALE') {
            p.variants[vIdx].stock += entry.qty; // Give back stock
        } else {
            p.variants[vIdx].stock -= entry.qty; // Remove purchased stock
        }
    }

    // Remove entry
    p.ledger.splice(index, 1);

    await db.ref('products/' + id).set(p);
    triggerSound('click');
    manageLedger(id);
}

/**
 * SECTION 9: FORM ENGINE (CREATE & EDIT)
 * ------------------------------------------------------------
 */
function editProductEntry(id) {
    const p = allProducts.find(x => x.id === id);
    if (!p) return;

    document.getElementById('editId').value = p.id;
    document.getElementById('modalTitle').innerText = "EDIT PRODUCT: " + p.model;
    document.getElementById('pCat').value = p.category;
    document.getElementById('pBrand').value = p.brand;
    document.getElementById('pSeries').value = p.series;
    document.getElementById('pModel').value = p.model;
    document.getElementById('pDealer').value = p.dealer;
    document.getElementById('pSpecs').value = p.specs.join('\n');

    variantDrafts = [...p.variants];
    colorDrafts = [...(p.colors || [])];

    renderVariantDrafts();
    renderColorDrafts();
    toggleModal('entryModal', true);
}

function addVariant() {
    const name = document.getElementById('vName').value.trim();
    const price = parseInt(document.getElementById('vPrice').value);
    const stock = parseInt(document.getElementById('vStock').value) || 0;

    if (!name || isNaN(price)) return;

    variantDrafts.push({ name, price, stock });
    document.getElementById('vName').value = '';
    document.getElementById('vPrice').value = '';
    document.getElementById('vStock').value = '0';
    renderVariantDrafts();
}

function renderVariantDrafts() {
    const container = document.getElementById('variantPills');
    container.innerHTML = variantDrafts.map((v, i) => `
        <div class="variant-pill" onclick="variantDrafts.splice(${i},1); renderVariantDrafts();">
            ${v.name} - ₹${v.price} (Qty: ${v.stock}) ✕
        </div>
    `).join('');
}

async function addColorSlot() {
    const name = prompt("Enter Colour Name (e.g., Titanium Blue):");
    if (!name) return;

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            alert("Uploading HD Visual... Please wait.");
            const url = await processImageUpload(file);
            if (url) {
                colorDrafts.push({ name, url });
                renderColorDrafts();
            }
        }
    };
    fileInput.click();
}

function renderColorDrafts() {
    const container = document.getElementById('colorContainer');
    container.innerHTML = colorDrafts.map((c, i) => `
        <div class="admin-item" style="padding:10px; margin-bottom:5px; border:1px solid var(--border-bright);">
            <div style="display:flex; align-items:center; gap:10px;">
                <img src="${c.url}" width="40" height="40" style="object-fit:cover; border-radius:4px;">
                <span>${c.name}</span>
            </div>
            <button type="button" class="btn-red-mini" onclick="colorDrafts.splice(${i},1); renderColorDrafts();">✕</button>
        </div>
    `).join('');
}

document.getElementById('productForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (variantDrafts.length === 0) return alert("Add at least one variant/price.");

    const id = document.getElementById('editId').value || "PROD_" + Date.now();
    const specs = document.getElementById('pSpecs').value.split('\n').filter(s => s.trim());
    
    // Preserve existing ledger if editing
    const existing = allProducts.find(x => x.id === id);
    const ledger = existing ? (existing.ledger || []) : [];

    const productDoc = {
        id,
        category: document.getElementById('pCat').value,
        brand: document.getElementById('pBrand').value,
        series: document.getElementById('pSeries').value,
        model: document.getElementById('pModel').value,
        dealer: document.getElementById('pDealer').value,
        specs,
        variants: variantDrafts,
        colors: colorDrafts,
        ledger
    };

    await db.ref('products/' + id).set(productDoc);
    triggerSound('success');
    toggleModal('entryModal', false);
    clearProductForm();
});

function clearProductForm() {
    document.getElementById('productForm').reset();
    document.getElementById('editId').value = '';
    variantDrafts = [];
    colorDrafts = [];
    renderVariantDrafts();
    renderColorDrafts();
}

/**
 * SECTION 10: PRODUCT COMPARISON (MATRIX ENGINE)
 * ------------------------------------------------------------
 */
function addToComparison(id) {
    if (compareQueue.includes(id)) return;
    if (compareQueue.length >= 5) return alert("Comparison Matrix limit: 5 Items");
    
    compareQueue.push(id);
    triggerSound('click');
    updateCompareDock();
}

function updateCompareDock() {
    const dock = document.getElementById('compareDock');
    const countSpan = document.getElementById('compCount');
    const itemsCont = document.getElementById('dockItems');

    countSpan.innerText = compareQueue.length;
    
    if (compareQueue.length > 0) {
        dock.classList.remove('hidden');
    } else {
        dock.classList.add('hidden');
    }

    itemsCont.innerHTML = compareQueue.map(id => {
        const p = allProducts.find(x => x.id === id);
        return `
            <div class="dock-pill">
                ${p.model} <span onclick="removeFromCompare('${id}')">✕</span>
            </div>
        `;
    }).join('');
}

function removeFromCompare(id) {
    compareQueue = compareQueue.filter(x => x !== id);
    updateCompareDock();
}

document.getElementById('btnCompClear').onclick = () => {
    compareQueue = [];
    updateCompareDock();
};

document.getElementById('btnOpenMatrix').onclick = () => {
    if (compareQueue.length < 2) return alert("Select at least 2 items to compare.");
    
    const body = document.getElementById('matrixBody');
    const items = compareQueue.map(id => allProducts.find(x => x.id === id));

    let html = '<table class="matrix-table">';
    
    // Header Row (Images & Models)
    html += '<thead><tr><th>SPECIFICATIONS</th>';
    items.forEach(p => {
        const img = p.colors?.[0]?.url || '';
        html += `<th><img src="${img}" style="width:80px; display:block; margin:0 auto 10px auto;">${p.model}</th>`;
    });
    html += '</tr></thead><tbody>';

    // Categories
    html += '<tr><td><strong>CATEGORY</strong></td>' + items.map(p => `<td>${p.category}</td>`).join('') + '</tr>';
    // Brand/Series
    html += '<tr><td><strong>BRAND • SERIES</strong></td>' + items.map(p => `<td>${p.brand} ${p.series}</td>`).join('') + '</tr>';
    // Base Price
    html += '<tr><td><strong>BASE PRICE</strong></td>' + items.map(p => `<td style="color:var(--neon-green); font-weight:bold;">₹${p.variants[0].price}</td>`).join('') + '</tr>';
    // Variants
    html += '<tr><td><strong>VARIANTS</strong></td>' + items.map(p => `<td>${p.variants.map(v => v.name).join('<br>')}</td>`).join('') + '</tr>';
    // Specs
    html += '<tr><td><strong>DEEP SPECS</strong></td>' + items.map(p => `<td><small>${p.specs.join('<br>')}</small></td>`).join('') + '</tr>';
    
    html += '</tbody></table>';
    body.innerHTML = html;
    toggleModal('matrixModal', true);
};

/**
 * SECTION 11: SHOPPING DETAIL VIEW ENGINE
 * ------------------------------------------------------------
 */
function viewProductDetails(id) {
    const p = allProducts.find(x => x.id === id);
    if (!p) return;

    document.getElementById('dTitle').innerText = p.model;
    document.getElementById('dCat').innerText = p.category;
    document.getElementById('dDealer').innerText = p.dealer;

    // Visuals
    const mainImg = document.getElementById('dMainImg');
    const thumbRow = document.getElementById('dThumbs');
    mainImg.src = p.colors?.[0]?.url || '';
    thumbRow.innerHTML = (p.colors || []).map((c, i) => `
        <img src="${c.url}" class="thumb ${i === 0 ? 'active' : ''}" onclick="changeDetailVisual(this, '${c.url}')">
    `).join('');

    // Variants & Price
    const variantBox = document.getElementById('dVariants');
    const priceBox = document.getElementById('dPrice');
    const stockBox = document.getElementById('dStock');

    priceBox.innerText = `₹${p.variants[0].price.toLocaleString('en-IN')}`;
    stockBox.innerText = `${p.variants[0].stock} UNITS`;

    variantBox.innerHTML = p.variants.map((v, i) => `
        <button class="btn-neon-icon ${i === 0 ? 'btn-neon-cyan' : ''}" 
                onclick="updateDetailPrice(this, ${v.price}, ${v.stock})">
            ${v.name}
        </button>
    `).join('');

    // Specs
    const specsBox = document.getElementById('dSpecs');
    specsBox.innerHTML = p.specs.map(s => `<div>⚡ ${s}</div>`).join('');

    toggleModal('detailModal', true);
}

function changeDetailVisual(el, url) {
    document.getElementById('dMainImg').src = url;
    document.querySelectorAll('.thumb').forEach(t => t.classList.remove('active'));
    el.classList.add('active');
}

function updateDetailPrice(el, price, stock) {
    document.getElementById('dPrice').innerText = `₹${price.toLocaleString('en-IN')}`;
    document.getElementById('dStock').innerText = `${stock} UNITS`;
    
    el.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('btn-neon-cyan'));
    el.classList.add('btn-neon-cyan');
}

/**
 * SECTION 12: UTILITY FUNCTIONS & HANDLERS
 * ------------------------------------------------------------
 */
function toggleModal(id, show) {
    const modal = document.getElementById(id);
    modal.classList.toggle('hidden', !show);
    if (show) triggerSound('click');
}

function deleteProductPermanent(id) {
    if (confirm("CRITICAL: Permanently wipe this product from cloud inventory?")) {
        db.ref('products/' + id).remove();
        triggerSound('click');
    }
}

// Admin PIN Logic
document.getElementById('btnAdminToggle').onclick = () => {
    if (isAdmin) {
        // Switch back to User
        isAdmin = false;
        document.getElementById('adminView').classList.add('hidden');
        document.getElementById('userView').classList.remove('hidden');
        document.getElementById('btnAdminToggle').innerText = "⚙️ ADMIN CONTROL";
        renderUserCatalog();
    } else {
        if (pinRequired) {
            toggleModal('pinGate', true);
        } else {
            switchToAdmin();
        }
    }
};

document.getElementById('btnVerifyPin').onclick = () => {
    const entered = document.getElementById('pinInput').value;
    if (entered === adminPin) {
        toggleModal('pinGate', false);
        document.getElementById('pinInput').value = '';
        switchToAdmin();
    } else {
        alert("ACCESS DENIED: PIN INVALID.");
        document.getElementById('pinInput').value = '';
    }
};

function switchToAdmin() {
    isAdmin = true;
    document.getElementById('userView').classList.add('hidden');
    document.getElementById('adminView').classList.remove('hidden');
    document.getElementById('btnAdminToggle').innerText = "🏠 SHOP VIEW";
    renderAdminConsole();
}

// PIN Setup Utility
document.getElementById('btnPinSetup').onclick = () => {
    const newPin = prompt("Set New 4-Digit Security PIN:", adminPin);
    if (newPin && newPin.length === 4) {
        adminPin = newPin;
        localStorage.setItem('keval_admin_pin', newPin);
        
        const enable = confirm("Enable PIN protection for Admin Panel?");
        pinRequired = enable;
        localStorage.setItem('keval_pin_enabled', enable ? 'ON' : 'OFF');
        alert("Security Configuration Updated.");
    }
};

// Audio Toggle Utility
document.getElementById('btnAudioToggle').onclick = () => {
    audioEnabled = !audioEnabled;
    localStorage.setItem('keval_audio', audioEnabled ? 'ON' : 'OFF');
    document.getElementById('btnAudioToggle').innerText = `🔊 AUDIO: ${audioEnabled ? 'ON' : 'OFF'}`;
    if (audioEnabled) triggerSound('success');
};

// Search Handlers
document.getElementById('userSearch').oninput = renderUserCatalog;
document.getElementById('userFilterCat').onchange = renderUserCatalog;
document.getElementById('userFilterBrand').onchange = renderUserCatalog;
document.getElementById('adminSearch').oninput = renderAdminConsole;

// Initialization Sequence
document.getElementById('btnCreateEntry').onclick = () => {
    clearProductForm();
    document.getElementById('modalTitle').innerText = "CREATE NEW DATABASE ENTRY";
    toggleModal('entryModal', true);
};

document.getElementById('btnExportPanel').onclick = () => {
    // Basic PDF Export using html2pdf
    const element = document.getElementById('adminList');
    const opt = {
        margin: 0.5,
        filename: `Keval_Inventory_${new Date().toLocaleDateString()}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(element).save();
};

// Start Data Sync
initializeDataSync();

console.log("Keval Mobile Zone: Logic Engine Active.");
