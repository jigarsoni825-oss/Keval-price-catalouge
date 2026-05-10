/* ============================================================
   KEVAL MOBILE ZONE | MASTER LOGIC ENGINE
   ------------------------------------------------------------
   Designed & Developed By: Jigar
   Location: Padra, Gujarat
   Project: Keval Mobile Zone Inventory & Showroom Portal
   Version: 5.5 (Enterprise Build)
   ============================================================ */

/**
 * SECTION 1: CORE FIREBASE INFRASTRUCTURE
 * ------------------------------------------------------------
 * This section links your app to the Google Cloud Database.
 * These keys are your unique shop identifiers.
 */

const firebaseConfig = {
  apiKey: "AIzaSyDcesyj1CJkNpkZVdFb2-k5pXwg-nW8uiQ",
  authDomain: "keval-mobile-zone.firebaseapp.com",
  databaseURL: "https://keval-mobile-zone-default-rtdb.firebaseio.com",
  projectId: "keval-mobile-zone",
  storageBucket: "keval-mobile-zone.firebasestorage.app",
  messagingSenderId: "617707071181",
  appId: "1:617707071181:web:78123529b66d61d58e6b84"
};

// Initialize Firebase Production Instance
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

/**
 * SECTION 2: CLOUDINARY HD ASSET CONFIGURATION
 * ------------------------------------------------------------
 * Handles the high-speed image delivery for the showroom.
 */
// IMPORTANT: Paste your Cloud Name from your Cloudinary Dashboard here
const CLOUD_NAME = "PASTE_YOUR_CLOUDINARY_NAME_HERE"; 
const UPLOAD_PRESET = "keval_shop_preset"; 

/**
 * SECTION 3: APPLICATION GLOBAL STATE
 * ------------------------------------------------------------
 */
let allProductsBank = [];      // Full local copy of database
let compareMatrixQueue = [];   // Selected items for comparison (Max 5)
let currentVariantDrafts = []; // Temp storage for form
let currentColorDrafts = [];   // Temp storage for HD images
let isAdminMode = false;       // UI state toggle
let activeLedgerItemID = null; // Reference for stock auditing

// Persistent User Settings (Saved in Browser Memory)
let isAudioEnabled = localStorage.getItem('keval_audio') !== 'OFF';
let masterAdminPin = localStorage.getItem('keval_admin_pin') || '1234';
let isPinSecurityActive = localStorage.getItem('keval_pin_enabled') === 'ON';

/**
 * SECTION 4: HIGH-FIDELITY AUDIO ENGINE
 * ------------------------------------------------------------
 */
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

function playInterfaceSound(type = 'click') {
    if (!isAudioEnabled) return;
    if (audioContext.state === 'suspended') audioContext.resume();

    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.connect(gain);
    gain.connect(audioContext.destination);

    const now = audioContext.currentTime;

    if (type === 'click') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(900, now);
        osc.frequency.exponentialRampToValueAtTime(300, now + 0.04);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.04);
        osc.start(); osc.stop(now + 0.04);
    } else if (type === 'success') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(500, now);
        osc.frequency.setValueAtTime(1000, now + 0.08);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.15);
        osc.start(); osc.stop(now + 0.15);
    } else if (type === 'error') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.linearRampToValueAtTime(100, now + 0.2);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.2);
        osc.start(); osc.stop(now + 0.2);
    }
}

/**
 * SECTION 5: CLOUDINARY UPLOAD HANDLER
 * ------------------------------------------------------------
 */
async function uploadToCloudinary(file) {
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
        return result.secure_url;
    } catch (error) {
        console.error("Showroom Upload Error:", error);
        playInterfaceSound('error');
        alert("CRITICAL: Cloudinary Link Failed. Check Cloud Name.");
        return null;
    }
}

/**
 * SECTION 6: REAL-TIME DATABASE SYNCHRONIZER
 * ------------------------------------------------------------
 */
function startLiveSync() {
    db.ref('products').on('value', (snapshot) => {
        allProductsBank = [];
        const data = snapshot.val();
        if (data) {
            Object.keys(data).forEach(key => {
                allProductsBank.push({ id: key, ...data[key] });
            });
        }
        
        // Dynamic Filter Logic
        populateFilterMenus();
        
        // Refresh UI based on state
        if (isAdminMode) {
            renderAdminDashboard();
        } else {
            renderUserShowroom();
        }
        
        // Update comparison dock count
        updateComparisonDockUI();
    });
}

function populateFilterMenus() {
    const categories = [...new Set(allProductsBank.map(p => p.category))];
    const brands = [...new Set(allProductsBank.map(p => p.brand))];

    const catSelect = document.getElementById('userFilterCat');
    const brandSelect = document.getElementById('userFilterBrand');

    const activeCat = catSelect.value;
    const activeBrand = brandSelect.value;

    catSelect.innerHTML = '<option value="">ALL CATEGORIES</option>' + categories.map(c => `<option value="${c}">${c}</option>`).join('');
    brandSelect.innerHTML = '<option value="">ALL BRANDS</option>' + brands.map(b => `<option value="${b}">${b}</option>`).join('');

    catSelect.value = activeCat;
    brandSelect.value = activeBrand;
}

/**
 * SECTION 7: USER SHOWROOM (FRONTEND RENDERING)
 * ------------------------------------------------------------
 */
function renderUserShowroom() {
    const grid = document.getElementById('productGrid');
    const searchQuery = document.getElementById('userSearch').value.toLowerCase();
    const filterCat = document.getElementById('userFilterCat').value;
    const filterBrand = document.getElementById('userFilterBrand').value;

    grid.innerHTML = '';

    const displaySet = allProductsBank.filter(p => {
        const matchSearch = p.model.toLowerCase().includes(searchQuery) || p.brand.toLowerCase().includes(searchQuery);
        const matchCat = filterCat === "" || p.category === filterCat;
        const matchBrand = filterBrand === "" || p.brand === filterBrand;
        return matchSearch && matchCat && matchBrand;
    });

    if (displaySet.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding:50px; color:var(--text-muted);">NO MATCHING PRODUCTS IN SHOWROOM</div>`;
        return;
    }

    displaySet.forEach(product => {
        const primaryImg = product.colors?.[0]?.url || 'https://placehold.co/400x400/000/00f0ff?text=Keval+Mobile';
        const initialPrice = product.variants?.[0]?.price || 0;
        const totalStock = product.variants?.reduce((a, v) => a + (v.stock || 0), 0) || 0;

        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <div class="card-img-box" onclick="openProductDetailView('${product.id}')">
                <img src="${primaryImg}" loading="lazy">
            </div>
            <div class="card-brand">${product.brand.toUpperCase()} • ${product.series.toUpperCase()}</div>
            <h3 class="card-title" onclick="openProductDetailView('${product.id}')">${product.model}</h3>
            <div class="card-price">₹${initialPrice.toLocaleString('en-IN')}</div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:15px;">
                <span style="font-size:0.7rem; font-weight:bold; color:${totalStock > 0 ? 'var(--neon-green)' : 'var(--neon-red)'};">
                    ${totalStock > 0 ? `IN STOCK (${totalStock})` : 'OUT OF STOCK'}
                </span>
                <button onclick="handleComparisonQueue('${product.id}')" class="btn-neon-icon">⚖️ COMPARE</button>
            </div>
        `;
        grid.appendChild(card);
    });
}

/**
 * SECTION 8: ADMIN DASHBOARD (MANAGEMENT LOGIC)
 * ------------------------------------------------------------
 */
function renderAdminDashboard() {
    const list = document.getElementById('adminList');
    const search = document.getElementById('adminSearch').value.toLowerCase();
    list.innerHTML = '';

    const adminSet = allProductsBank.filter(p => p.model.toLowerCase().includes(search) || p.brand.toLowerCase().includes(search));

    adminSet.forEach(p => {
        const basePrice = p.variants?.[0]?.price || 0;
        const row = document.createElement('div');
        row.className = 'admin-item';
        row.innerHTML = `
            <div style="flex:1;">
                <div style="font-weight:900; font-size:1.1rem; color:#fff;">${p.brand} ${p.model}</div>
                <div style="font-size:0.75rem; color:var(--neon-cyan);">${p.category} | Dealer: ${p.dealer}</div>
            </div>
            <div style="display:flex; gap:15px; align-items:center;">
                <div style="text-align:center;">
                    <label style="font-size:0.6rem; color:var(--neon-green); display:block; margin-bottom:5px;">DAILY PRICE ₹</label>
                    <input type="number" value="${basePrice}" class="neon-input" 
                           style="width:110px; margin:0; padding:8px; text-align:center; color:var(--neon-green); border-color:var(--neon-green);" 
                           onchange="quickUpdateBasePrice('${p.id}', this.value)">
                </div>
                <button onclick="triggerStockLedger('${p.id}')" class="btn-neon-purple" title="Audit Ledger">📦</button>
                <button onclick="initiateProductEdit('${p.id}')" class="btn-neon-cyan" title="Edit Full Specs">✏️</button>
                <button onclick="performPermanentDelete('${p.id}', '${p.model}')" style="background:var(--neon-red); color:#fff; padding:10px;">🗑️</button>
            </div>
        `;
        list.appendChild(row);
    });
}

function quickUpdateBasePrice(id, newPrice) {
    const p = allProductsBank.find(x => x.id === id);
    if (p && p.variants[0]) {
        p.variants[0].price = parseInt(newPrice);
        db.ref('products/' + id).update(p).then(() => {
            playInterfaceSound('success');
        });
    }
}

/**
 * SECTION 9: STOCK AUDIT LEDGER (PRECISION REVERSION)
 * ------------------------------------------------------------
 */
function triggerStockLedger(id) {
    activeLedgerItemID = id;
    const p = allProductsBank.find(x => x.id === id);
    if (!p) return;

    // Build Variant Selector
    const vSel = document.getElementById('lVar');
    vSel.innerHTML = p.variants.map((v, i) => `<option value="${i}">${v.name} (Now: ${v.stock})</option>`).join('');

    // Reset Form
    document.getElementById('lQty').value = 1;
    document.getElementById('lNote').value = '';

    renderLedgerHistory(p);
    toggleModal('ledgerModal', true);
}

function renderLedgerHistory(product) {
    const historyBox = document.getElementById('ledgerHistory');
    historyBox.innerHTML = '';

    if (!product.ledger || product.ledger.length === 0) {
        historyBox.innerHTML = '<div style="padding:30px; text-align:center; color:var(--text-muted);">NO TRANSACTION RECORDS FOUND</div>';
        return;
    }

    // Newest Records First
    [...product.ledger].reverse().forEach((entry, idx) => {
        const originalIndex = product.ledger.length - 1 - idx;
        const row = document.createElement('div');
        row.className = `ledger-row ${entry.type === 'SALE' ? 'sale' : 'purchase'}`;
        row.innerHTML = `
            <div style="flex:1;">
                <div style="font-weight:bold;">${entry.type === 'SALE' ? '📤 SALE' : '📥 PURCHASE'} - ${entry.variant}</div>
                <div style="font-size:0.75rem; color:var(--text-muted);">${entry.date} • Note: ${entry.note}</div>
            </div>
            <div style="display:flex; align-items:center; gap:20px;">
                <span style="font-weight:900; font-size:1rem; color:${entry.type === 'SALE' ? 'var(--neon-red)' : 'var(--neon-green)'};">
                    ${entry.type === 'SALE' ? '-' : '+'}${entry.qty} Units
                </span>
                <button onclick="undoLedgerTransaction('${product.id}', ${originalIndex})" class="btn-red-mini" 
                        style="background:var(--neon-red); color:#fff; border-radius:4px; font-size:0.65rem;">REVERT</button>
            </div>
        `;
        historyBox.appendChild(row);
    });
}

async function commitLedger() {
    const p = allProductsBank.find(x => x.id === activeLedgerItemID);
    const varIndex = document.getElementById('lVar').value;
    const type = document.getElementById('lType').value;
    const quantity = parseInt(document.getElementById('lQty').value);
    const note = document.getElementById('lNote').value || "Manual Update";

    if (isNaN(quantity) || quantity <= 0) {
        playInterfaceSound('error');
        return;
    }

    // Mathematical Stock Adjustment
    if (type === 'SALE') {
        p.variants[varIndex].stock -= quantity;
    } else {
        p.variants[varIndex].stock += quantity;
    }

    // Create Audit Log
    const logEntry = {
        type,
        variant: p.variants[varIndex].name,
        qty: quantity,
        note,
        date: new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
    };

    if (!p.ledger) p.ledger = [];
    p.ledger.push(logEntry);

    await db.ref('products/' + activeLedgerItemID).set(p);
    playInterfaceSound('success');
    triggerStockLedger(activeLedgerItemID); // Refresh UI
}

async function undoLedgerTransaction(prodId, ledgerIdx) {
    if (!confirm("CRITICAL: Revert physical stock and permanently delete this audit record?")) return;

    const p = allProductsBank.find(x => x.id === prodId);
    const entryToUndo = p.ledger[ledgerIdx];

    // Identify variant and reverse the math
    const targetVarIdx = p.variants.findIndex(v => v.name === entryToUndo.variant);
    if (targetVarIdx > -1) {
        if (entryToUndo.type === 'SALE') {
            p.variants[targetVarIdx].stock += entryToUndo.qty; // Return sold stock
        } else {
            p.variants[targetVarIdx].stock -= entryToUndo.qty; // Remove purchased stock
        }
    }

    // Remove the row from ledger array
    p.ledger.splice(ledgerIdx, 1);

    await db.ref('products/' + prodId).set(p);
    playInterfaceSound('click');
    triggerStockLedger(prodId);
}

/**
 * SECTION 10: PRODUCT FORM HUB (CREATE & EDIT)
 * ------------------------------------------------------------
 */
function initiateProductEdit(id) {
    const p = allProductsBank.find(x => x.id === id);
    if (!p) return;

    document.getElementById('editId').value = p.id;
    document.getElementById('modalTitle').innerText = "SYSTEM UPDATE: " + p.model.toUpperCase();
    document.getElementById('pCat').value = p.category;
    document.getElementById('pBrand').value = p.brand;
    document.getElementById('pSeries').value = p.series;
    document.getElementById('pModel').value = p.model;
    document.getElementById('pDealer').value = p.dealer;
    document.getElementById('pSpecs').value = (p.specs || []).join('\n');

    currentVariantDrafts = [...p.variants];
    currentColorDrafts = [...(p.colors || [])];

    refreshFormDrafts();
    toggleModal('entryModal', true);
}

function addVariant() {
    const label = document.getElementById('vName').value.trim();
    const cost = parseInt(document.getElementById('vPrice').value);
    const count = parseInt(document.getElementById('vStock').value) || 0;

    if (!label || isNaN(cost)) {
        playInterfaceSound('error');
        return;
    }

    currentVariantDrafts.push({ name: label, price: cost, stock: count });
    
    // Clear mini-inputs
    document.getElementById('vName').value = '';
    document.getElementById('vPrice').value = '';
    document.getElementById('vStock').value = '0';
    
    refreshFormDrafts();
}

function refreshFormDrafts() {
    // Render Variants
    const vCont = document.getElementById('variantPills');
    vCont.innerHTML = currentVariantDrafts.map((v, i) => `
        <div class="variant-pill" onclick="currentVariantDrafts.splice(${i},1); refreshFormDrafts();">
            ${v.name} • ₹${v.price} (Qty: ${v.stock}) ✕
        </div>
    `).join('');

    // Render Color Slots
    const cCont = document.getElementById('colorContainer');
    cCont.innerHTML = currentColorDrafts.map((c, i) => `
        <div class="admin-item" style="padding:8px; margin-top:8px; border:1px solid var(--border-bright);">
            <div style="display:flex; align-items:center; gap:12px;">
                <img src="${c.url}" width="40" height="40" style="object-fit:cover; border-radius:6px; border:1px solid var(--neon-cyan);">
                <span style="font-weight:bold;">${c.name}</span>
            </div>
            <button type="button" class="btn-red-mini" onclick="currentColorDrafts.splice(${i},1); refreshFormDrafts();">✕</button>
        </div>
    `).join('');
}

async function addColorSlot() {
    const colName = prompt("IDENTIFY COLOUR (e.g., Midnight Black):");
    if (!colName) return;

    const picker = document.createElement('input');
    picker.type = 'file';
    picker.accept = 'image/*';
    picker.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            alert("UPLOADING HD ASSET... PLEASE WAIT.");
            const secureUrl = await uploadToCloudinary(file);
            if (secureUrl) {
                currentColorDrafts.push({ name: colName, url: secureUrl });
                refreshFormDrafts();
            }
        }
    };
    picker.click();
}

document.getElementById('productForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (currentVariantDrafts.length === 0) {
        alert("CRITICAL ERROR: Define at least one price variant.");
        return;
    }

    const id = document.getElementById('editId').value || "KMZ_" + Date.now();
    const lines = document.getElementById('pSpecs').value.split('\n').filter(s => s.trim());
    
    const existingObj = allProductsBank.find(x => x.id === id);
    const ledgerData = existingObj ? (existingObj.ledger || []) : [];

    const finalDoc = {
        id,
        category: document.getElementById('pCat').value,
        brand: document.getElementById('pBrand').value,
        series: document.getElementById('pSeries').value,
        model: document.getElementById('pModel').value,
        dealer: document.getElementById('pDealer').value,
        specs: lines,
        variants: currentVariantDrafts,
        colors: currentColorDrafts,
        ledger: ledgerData
    };

    await db.ref('products/' + id).set(finalDoc);
    playInterfaceSound('success');
    toggleModal('entryModal', false);
    resetFormState();
});

function resetFormState() {
    document.getElementById('productForm').reset();
    document.getElementById('editId').value = '';
    currentVariantDrafts = [];
    currentColorDrafts = [];
    refreshFormDrafts();
}

/**
 * SECTION 11: FIVE-PRODUCT COMPARISON MATRIX
 * ------------------------------------------------------------
 */
function handleComparisonQueue(id) {
    if (compareMatrixQueue.includes(id)) {
        compareMatrixQueue = compareMatrixQueue.filter(x => x !== id);
    } else {
        if (compareMatrixQueue.length >= 5) {
            alert("MATRIX LIMIT: Maximum 5 items allowed side-by-side.");
            return;
        }
        compareMatrixQueue.push(id);
    }
    playInterfaceSound('click');
    updateComparisonDockUI();
}

function updateComparisonDockUI() {
    const dock = document.getElementById('compareDock');
    const countText = document.getElementById('compCount');
    const itemFlow = document.getElementById('dockItems');

    countText.innerText = compareMatrixQueue.length;
    
    if (compareMatrixQueue.length > 0) {
        dock.classList.remove('hidden');
    } else {
        dock.classList.add('hidden');
    }

    itemFlow.innerHTML = compareMatrixQueue.map(id => {
        const prod = allProductsBank.find(x => x.id === id);
        return `
            <div class="dock-pill">
                ${prod.model} <span onclick="handleComparisonQueue('${id}')" style="cursor:pointer; color:var(--neon-red); font-weight:bold; margin-left:8px;">✕</span>
            </div>
        `;
    }).join('');
}

function clearCompare() {
    compareMatrixQueue = [];
    updateComparisonDockUI();
}

function runComparisonMatrix() {
    if (compareMatrixQueue.length < 2) {
        alert("Please select at least 2 models for matrix generation.");
        return;
    }
    
    const targetBody = document.getElementById('matrixBody');
    const selectedItems = compareMatrixQueue.map(id => allProductsBank.find(x => x.id === id));

    let matrixHtml = '<table class="matrix-table">';
    
    // Header (Model Visuals)
    matrixHtml += '<thead><tr><th>SPEC METRIC</th>';
    selectedItems.forEach(p => {
        const icon = p.colors?.[0]?.url || '';
        matrixHtml += `<th><img src="${icon}" style="width:80px; margin:0 auto 10px auto; display:block;">${p.model}</th>`;
    });
    matrixHtml += '</tr></thead><tbody>';

    // Metrics Rows
    const metrics = [
        { label: 'BRAND', key: 'brand' },
        { label: 'SERIES', key: 'series' },
        { label: 'PRICE (BASE)', key: 'variants', format: (v) => `₹${v[0].price}` },
        { label: 'VARIANTS', key: 'variants', format: (v) => v.map(x => x.name).join('<br>') },
        { label: 'DEEP SPECS', key: 'specs', format: (s) => s.join('<br>') }
    ];

    metrics.forEach(m => {
        matrixHtml += `<tr><td><strong>${m.label}</strong></td>`;
        selectedItems.forEach(p => {
            const data = p[m.key];
            const displayValue = m.format ? m.format(data) : data;
            matrixHtml += `<td>${displayValue}</td>`;
        });
        matrixHtml += '</tr>';
    });
    
    matrixHtml += '</tbody></table>';
    targetBody.innerHTML = matrixHtml;
    toggleModal('matrixModal', true);
}

/**
 * SECTION 12: PRODUCT DETAIL VIEW (SHOPPING HUB)
 * ------------------------------------------------------------
 */
function openProductDetailView(id) {
    const p = allProductsBank.find(x => x.id === id);
    if (!p) return;

    document.getElementById('dTitle').innerText = p.model;
    document.getElementById('dCat').innerText = p.category.toUpperCase();
    document.getElementById('dDealer').innerText = p.dealer.toUpperCase();

    // Visual Frame
    const mainImg = document.getElementById('dMainImg');
    const thumbArea = document.getElementById('dThumbs');
    mainImg.src = p.colors?.[0]?.url || '';
    
    thumbArea.innerHTML = (p.colors || []).map((c, i) => `
        <img src="${c.url}" class="thumb ${i === 0 ? 'active' : ''}" 
             onclick="swapShowroomImage(this, '${c.url}')">
    `).join('');

    // Pricing & Variants
    const vArea = document.getElementById('dVariants');
    const pArea = document.getElementById('dPrice');
    const sArea = document.getElementById('dStock');

    pArea.innerText = `₹${p.variants[0].price.toLocaleString('en-IN')}`;
    sArea.innerText = `${p.variants[0].stock} UNITS`;

    vArea.innerHTML = p.variants.map((v, i) => `
        <button class="btn-neon-icon ${i === 0 ? 'btn-neon-cyan' : ''}" 
                style="padding:8px 15px; margin-right:8px;"
                onclick="syncDetailPricing(this, ${v.price}, ${v.stock})">
            ${v.name}
        </button>
    `).join('');

    // Specs List
    const specArea = document.getElementById('dSpecs');
    specArea.innerHTML = (p.specs || []).map(s => `<div style="margin-bottom:8px;">⚡ ${s}</div>`).join('');

    toggleModal('detailModal', true);
}

function swapShowroomImage(thumb, url) {
    document.getElementById('dMainImg').src = url;
    document.querySelectorAll('.thumb').forEach(t => t.classList.remove('active'));
    thumb.classList.add('active');
}

function syncDetailPricing(btn, price, stock) {
    document.getElementById('dPrice').innerText = `₹${price.toLocaleString('en-IN')}`;
    document.getElementById('dStock').innerText = `${stock} UNITS`;
    
    btn.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('btn-neon-cyan'));
    btn.classList.add('btn-neon-cyan');
}

/**
 * SECTION 13: SECURITY GATE & NAVIGATION
 * ------------------------------------------------------------
 */
function toggleModal(id, show) {
    const modal = document.getElementById(id);
    modal.classList.toggle('hidden', !show);
    if (show) playInterfaceSound('click');
}

function performPermanentDelete(id, name) {
    if (confirm(`CRITICAL WARNING: Permanently wipe ${name.toUpperCase()} from cloud inventory?`)) {
        db.ref('products/' + id).remove();
        playInterfaceSound('click');
    }
}

// PIN Verification Logic
function executePinVerification() {
    const entered = document.getElementById('pinInput').value;
    if (entered === masterAdminPin) {
        isAdminMode = true;
        toggleModal('pinGate', false);
        document.getElementById('pinInput').value = '';
        enterAdminUI();
    } else {
        playInterfaceSound('error');
        alert("SECURITY ALERT: INVALID PIN ENTERED.");
        document.getElementById('pinInput').value = '';
    }
}

document.getElementById('btnAdminToggle').onclick = () => {
    if (isAdminMode) {
        isAdminMode = false;
        document.getElementById('adminView').classList.add('hidden');
        document.getElementById('userView').classList.remove('hidden');
        document.getElementById('btnAdminToggle').innerText = "⚙️ ADMIN CONTROL";
        renderUserShowroom();
    } else {
        if (isPinSecurityActive) {
            toggleModal('pinGate', true);
        } else {
            enterAdminUI();
        }
    }
};

function enterAdminUI() {
    isAdminMode = true;
    document.getElementById('userView').classList.add('hidden');
    document.getElementById('adminView').classList.remove('hidden');
    document.getElementById('btnAdminToggle').innerText = "🏠 SHOP CATALOG";
    renderAdminDashboard();
}

// Global Event Listeners
document.getElementById('userSearch').oninput = renderUserShowroom;
document.getElementById('userFilterCat').onchange = renderUserShowroom;
document.getElementById('userFilterBrand').onchange = renderUserShowroom;
document.getElementById('adminSearch').oninput = renderAdminDashboard;

document.getElementById('btnVerifyPin').onclick = executePinVerification;
document.getElementById('btnCompClear').onclick = clearCompare;
document.getElementById('btnOpenMatrix').onclick = runComparisonMatrix;

document.getElementById('btnCreateEntry').onclick = () => {
    resetFormState();
    document.getElementById('modalTitle').innerText = "NEW SYSTEM ENTRY";
    toggleModal('entryModal', true);
};

document.getElementById('btnAudioToggle').onclick = () => {
    isAudioEnabled = !isAudioEnabled;
    localStorage.setItem('keval_audio', isAudioEnabled ? 'ON' : 'OFF');
    document.getElementById('btnAudioToggle').innerText = `🔊 AUDIO: ${isAudioEnabled ? 'ON' : 'OFF'}`;
    if (isAudioEnabled) playInterfaceSound('success');
};

document.getElementById('btnPinSetup').onclick = () => {
    const newPin = prompt("SET 4-DIGIT SECURITY PIN:", masterAdminPin);
    if (newPin && newPin.length === 4) {
        masterAdminPin = newPin;
        localStorage.setItem('keval_admin_pin', newPin);
        const lock = confirm("ACTIVATE PIN PROTECTION FOR CONSOLE?");
        isPinSecurityActive = lock;
        localStorage.setItem('keval_pin_enabled', lock ? 'ON' : 'OFF');
        alert("SECURITY PROFILE UPDATED.");
    }
};

document.getElementById('btnExportPanel').onclick = () => {
    const list = document.getElementById('adminList');
    const opt = {
        margin: 0.5,
        filename: `Inventory_Audit_${new Date().toLocaleDateString()}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };
    html2pdf().set(opt).from(list).save();
};

/**
 * START ENGINE
 * ------------------------------------------------------------
 */
startLiveSync();
console.log("KEVAL MOBILE ZONE: MASTER ENGINE ONLINE.");
