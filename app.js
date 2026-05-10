// --- 1. CLOUD STORAGE INITIALIZATION ---
const firebaseConfig = {
  databaseURL: "https://keval-mobile-zone-default-rtdb.firebaseio.com/"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();


// --- 2. FORCED HIGH-AVAILABILITY PWA INSTALLATION ENGINE ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => console.error('[SW] Bypass fault:', err));
  });
}

let deferredPrompt;
const btnInstall = document.getElementById('btnInstall');

// Explicitly forces the app install button to display when conditions are met
window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event;
  btnInstall.classList.remove('hidden');
});

btnInstall.addEventListener('click', async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      btnInstall.classList.add('hidden');
    }
    deferredPrompt = null;
  } else {
    alert("PWA System Alert: Installation link cached. Check browser menus to trigger add-to-homescreen.");
  }
});


// --- 3. GOOGLE DRIVE LINK PARSING ALGORITHM ---
// Transforms default viewer URLs into raw direct direct rendering URLs
function getDirectDriveUrl(urlStr) {
  if (!urlStr) return "";
  const cleaned = urlStr.trim();
  const fileIdMatch = cleaned.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (fileIdMatch && fileIdMatch[1]) {
    return `https://drive.google.com/uc?export=view&id=${fileIdMatch[1]}`;
  }
  return cleaned; // Passes direct standard links untouched
}

// Automatic Logo & Background Loader
function applyCloudBranding() {
  const savedBg = localStorage.getItem('keval_drive_bg');
  const savedLogo = localStorage.getItem('keval_drive_logo');

  if (savedBg) {
    document.body.style.backgroundImage = `url('${savedBg}')`;
  } else {
    document.body.style.backgroundImage = "url('./background.jpg')";
  }

  // Inject logo securely next to title if configured
  const brandCont = document.querySelector('.hud-brand-container');
  const oldLogo = document.getElementById('appCustomLogo');
  if (oldLogo) oldLogo.remove();

  if (savedLogo) {
    const imgElem = document.createElement('img');
    imgObj = imgElem;
    imgObj.id = 'appCustomLogo';
    imgObj.src = savedLogo;
    imgObj.style.cssText = "height: 32px; width: 32px; object-fit: contain; margin-right: 8px;";
    brandCont.prepend(imgObj);
  }
}
applyCloudBranding();

// Connect Branding Inputs
document.getElementById('btnSaveBranding').addEventListener('click', () => {
  const logoLinkRaw = document.getElementById('driveLogoLink').value;
  const bgLinkRaw = document.getElementById('driveBgLink').value;

  if (logoLinkRaw) localStorage.setItem('keval_drive_logo', getDirectDriveUrl(logoLinkRaw));
  if (bgLinkRaw) localStorage.setItem('keval_drive_bg', getDirectDriveUrl(bgLinkRaw));
  
  applyCloudBranding();
  alert("Branding Linked successfully! Converted direct asset references to Drive.");
  document.getElementById('driveLogoLink').value = '';
  document.getElementById('driveBgLink').value = '';
});


// --- 4. TACTILE AUDIO GENERATION ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function triggerInterfaceSound(type) {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain); gain.connect(audioCtx.destination);
  const t = audioCtx.currentTime;

  if (type === 'click') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1400, t);
    osc.frequency.exponentialRampToValueAtTime(400, t + 0.04);
    gain.gain.setValueAtTime(0.25, t); gain.gain.linearRampToValueAtTime(0, t + 0.04);
    osc.start(t); osc.stop(t + 0.04);
  } else if (type === 'publish') {
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(587.33, t);
    osc.frequency.setValueAtTime(880, t + 0.08);
    gain.gain.setValueAtTime(0.2, t); gain.gain.linearRampToValueAtTime(0, t + 0.25);
    osc.start(t); osc.stop(t + 0.25);
  }
}

document.addEventListener('click', (event) => {
  const t = event.target;
  if (t.tagName === 'BUTTON' || t.classList.contains('variant-pill') || t.classList.contains('thumb-box')) {
    triggerInterfaceSound('click');
  }
});


// --- 5. DATA ENGINE & SHOPPING CORE LOGIC ---
let localProductBank = [];
let configuredVariants = [];
let capturedPrimaryPhotoBase64 = "";
let capturedSecondaryPhotosBank = [];
let currentAdminMode = false;

// Component Selectors
const btnToggleView = document.getElementById('btnToggleView');
const userView = document.getElementById('userView');
const adminView = document.getElementById('adminView');
const entryPopup = document.getElementById('entryPopup');
const btnOpenPopup = document.getElementById('btnOpenPopup');
const btnClosePopup = document.getElementById('btnClosePopup');
const variantSelect = document.getElementById('variantSelect');
const customVariant = document.getElementById('customVariant');

const shoppingDetailModal = document.getElementById('shoppingDetailModal');
const btnCloseDetail = document.getElementById('btnCloseDetail');

// Active Listener Hooks
db.ref('priceListProducts').on('value', (snapshot) => {
  const payload = snapshot.val();
  localProductBank = [];
  
  if (payload) {
    Object.keys(payload).forEach(key => {
      const item = payload[key];
      if (item) {
        localProductBank.push({
          id: item.id || key,
          dist: item.dist || '',
          brand: item.brand || '',
          series: item.series || '',
          model: item.model || '',
          colours: item.colours || '',
          variants: item.variants || [],
          specs: item.specs || [],
          photoPrimary: item.photoPrimary || item.photo || '', // Backup handling for old photos
          photosDetail: item.photosDetail || []
        });
      }
    });
  }
  
  buildDynamicFilters();
  if (currentAdminMode) renderAdminConsole();
  else renderUserCatalog();
});

function buildDynamicFilters() {
  const brandSelect = document.getElementById('sortBrand');
  const seriesSelect = document.getElementById('sortSeries');
  const currentBrandVal = brandSelect.value;
  const currentSeriesVal = seriesSelect.value;

  const uniqueBrands = [...new Set(localProductBank.map(item => item.brand.toUpperCase()))].filter(Boolean);
  const uniqueSeries = [...new Set(localProductBank.map(item => item.series.toUpperCase()))].filter(Boolean);

  brandSelect.innerHTML = '<option value="">ALL BRANDS</option>' + uniqueBrands.map(b => `<option value="${b}">${b}</option>`).join('');
  seriesSelect.innerHTML = '<option value="">ALL SERIES</option>' + uniqueSeries.map(s => `<option value="${s}">${s}</option>`).join('');

  if (uniqueBrands.includes(currentBrandVal)) brandSelect.value = currentBrandVal;
  if (uniqueSeries.includes(currentSeriesVal)) seriesSelect.value = currentSeriesVal;
}

// Side Admin Button Action
btnToggleView.addEventListener('click', () => {
  currentAdminMode = !currentAdminMode;
  if (currentAdminMode) {
    userView.classList.add('hidden');
    adminView.classList.remove('hidden');
    btnToggleView.style.borderColor = "var(--hud-green)";
    renderAdminConsole();
  } else {
    adminView.classList.add('hidden');
    userView.classList.remove('hidden');
    btnToggleView.style.borderColor = "transparent";
    renderUserCatalog();
  }
});

btnOpenPopup.addEventListener('click', () => {
  clearEngineForm();
  document.getElementById('modalTitle').innerText = "CREATE DATABASE ENTRY";
  entryPopup.classList.remove('hidden');
});

btnClosePopup.addEventListener('click', () => entryPopup.classList.add('hidden'));
btnCloseDetail.addEventListener('click', () => shoppingDetailModal.classList.add('hidden'));

variantSelect.addEventListener('change', (event) => {
  if (event.target.value === 'OTHER') customVariant.classList.remove('hidden');
  else customVariant.classList.add('hidden');
});

// Image Base64 Data Processors
document.getElementById('pPhotoPrimary').addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      capturedPrimaryPhotoBase64 = e.target.result;
      document.getElementById('photoPreviewPrimary').innerHTML = `<img src="${capturedPrimaryPhotoBase64}" style="max-height:100px; border-radius:4px; border:1px solid var(--hud-cyan);">`;
    };
    reader.readAsDataURL(file);
  }
});

document.getElementById('pPhotoSecondary').addEventListener('change', (event) => {
  const files = Array.from(event.target.files).slice(0, 4); // Capped at 4 uploads
  capturedSecondaryPhotosBank = [];
  const previewDeck = document.getElementById('photoPreviewSecondary');
  previewDeck.innerHTML = '';

  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => {
      capturedSecondaryPhotosBank.push(e.target.result);
      previewDeck.innerHTML += `<img src="${e.target.result}" style="max-height:60px; width:60px; object-fit:cover; border-radius:4px; border:1px solid var(--hud-border);">`;
    };
    reader.readAsDataURL(file);
  });
});

// RAM/ROM Configurator Input Tracking
document.getElementById('btnAddVariant').addEventListener('click', () => {
  const label = variantSelect.value === 'OTHER' ? customVariant.value.trim() : variantSelect.value;
  const cost = document.getElementById('variantPrice').value;
  const initStock = document.getElementById('variantStock').value || 0;

  if (!label || !cost) return alert('Please enter valid size parameters and pricing.');

  const existingSlot = configuredVariants.findIndex(v => v.name === label);
  if (existingSlot > -1) {
    configuredVariants[existingSlot].price = parseInt(cost, 10);
    configuredVariants[existingSlot].stock = parseInt(initStock, 10);
  } else {
    configuredVariants.push({ name: label, price: parseInt(cost, 10), stock: parseInt(initStock, 10) });
  }

  customVariant.value = ''; document.getElementById('variantPrice').value = '';
  refreshPillsLayout();
});

function refreshPillsLayout() {
  const deck = document.getElementById('variantPillsContainer');
  deck.innerHTML = configuredVariants.map((item, index) => `
    <span class="variant-pill active" onclick="deleteConfiguredVariant(${index})">
      ${item.name} - ₹${item.price.toLocaleString('en-IN')} (Qty: ${item.stock})  ✕
    </span>
  `).join('');
}

window.deleteConfiguredVariant = function(slotIndex) {
  configuredVariants.splice(slotIndex, 1);
  refreshPillsLayout();
};

document.getElementById('btnAddSpec').addEventListener('click', () => {
  const rowsDeck = document.getElementById('specsContainer');
  const count = rowsDeck.children.length + 1;
  const newRow = document.createElement('input');
  newRow.type = 'text'; newRow.className = 'hud-input spec-input-row';
  newRow.placeholder = `SPECIFICATION LINE ${count}...`;
  rowsDeck.appendChild(newRow);
});


// --- 6. DATABASE SAVING ROUTINES ---
document.getElementById('productForm').addEventListener('submit', (event) => {
  event.preventDefault();
  triggerInterfaceSound('publish');

  const recordIdField = document.getElementById('editProductId').value;
  const activeSpecInputs = document.querySelectorAll('#specsContainer .spec-input-row');
  const compiledSpecs = Array.from(activeSpecInputs).map(f => f.value.trim()).filter(v => v !== "");

  if (configuredVariants.length === 0) return alert("CRITICAL: You must include at least one price variant configuration.");

  const payloadKey = recordIdField || "ITEM_" + Date.now().toString();

  const completeProductDocument = {
    id: payloadKey,
    dist: document.getElementById('pDist').value.trim(),
    brand: document.getElementById('pBrand').value.trim(),
    series: document.getElementById('pSeries').value.trim(),
    model: document.getElementById('pModel').value.trim(),
    colours: document.getElementById('pColours').value.trim(),
    variants: configuredVariants,
    specs: compiledSpecs,
    photoPrimary: capturedPrimaryPhotoBase64,
    photosDetail: capturedSecondaryPhotosBank
  };

  db.ref('priceListProducts/' + payloadKey).set(completeProductDocument)
    .catch(error => alert("Upload fault: Check connection."));

  entryPopup.classList.add('hidden');
  clearEngineForm();
});

function clearEngineForm() {
  document.getElementById('productForm').reset();
  document.getElementById('editProductId').value = '';
  document.getElementById('photoPreviewPrimary').innerHTML = '';
  document.getElementById('photoPreviewSecondary').innerHTML = '';
  document.getElementById('specsContainer').innerHTML = '<input type="text" class="hud-input spec-input-row" placeholder="SPECIFICATION LINE 1...">';
  configuredVariants = []; capturedPrimaryPhotoBase64 = ""; capturedSecondaryPhotosBank = [];
  refreshPillsLayout(); customVariant.classList.add('hidden');
}


// --- 7. CATALOG ENGINE & FULL SCREEN DETAILS ---
function renderUserCatalog() {
  const catalogGrid = document.getElementById('productGrid');
  const queryStr = document.getElementById('searchUser').value.toLowerCase();
  const selectedBrand = document.getElementById('sortBrand').value;
  const selectedSeries = document.getElementById('sortSeries').value;

  catalogGrid.innerHTML = '';

  localProductBank.filter(entry => {
    const stringMatches = entry.brand.toLowerCase().includes(queryStr) || 
                          entry.model.toLowerCase().includes(queryStr) ||
                          entry.series.toLowerCase().includes(queryStr) ||
                          (entry.specs && entry.specs.some(s => s.toLowerCase().includes(queryStr)));
    const brandMatches = selectedBrand ? entry.brand.toUpperCase() === selectedBrand : true;
    const seriesMatches = selectedSeries ? entry.series.toUpperCase() === selectedSeries : true;
    return stringMatches && brandMatches && seriesMatches;
  }).forEach(entry => {
    const cardElement = document.createElement('div');
    cardElement.className = 'hud-card';
    
    // Binding deep inspection overlay trigger
    cardElement.onclick = (e) => {
      // Prevents modal triggers when tapping child configuration elements
      if (e.target.tagName !== 'SPAN' && e.target.tagName !== 'BUTTON') {
        openShoppingSiteDetailView(entry.id);
      }
    };

    const initialVar = entry.variants && entry.variants[0] ? entry.variants[0] : { name: 'N/A', price: 0, stock: 0 };
    const stockBadgeHtml = initialVar.stock > 3 
      ? `<span class="stock-badge">In Stock (${initialVar.stock})</span>` 
      : `<span class="stock-badge low">Limited (${initialVar.stock || 0})</span>`;

    const photoFrame = entry.photoPrimary 
      ? `<div class="card-img-deck"><img src="${entry.photoPrimary}" class="card-img" alt="Cover"></div>` 
      : `<div class="card-img-deck" style="color: var(--hud-text-muted); font-size: 0.8rem;">[NO PHOTO LOADED]</div>`;
    
    const renderedPillsDeck = entry.variants ? entry.variants.map((v, idx) => `
      <span class="variant-pill ${idx === 0 ? 'active' : ''}" 
            onclick="updateDashboardPriceDisplay(this, '${entry.id}', ${v.price}, ${v.stock})">
        ${v.name}
      </span>
    `).join('') : '';

    cardElement.innerHTML = `
      <div>
        ${photoFrame}
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div class="meta-brand">${entry.brand.toUpperCase()} • ${entry.series.toUpperCase()}</div>
          <div id="stock_badge_${entry.id}">${stockBadgeHtml}</div>
        </div>
        <h3 class="meta-model">${entry.model}</h3>
        <div class="meta-colours">Colours: ${entry.colours || 'Standard'}</div>
        
        <div id="cost_hud_${entry.id}" class="price-live-box">₹${initialVar.price.toLocaleString('en-IN')}</div>
        <div class="pills-deck">${renderedPillsDeck}</div>
      </div>
      <div class="meta-footer" style="display:flex; justify-content:space-between; align-items:center;">
        <span>🔍 Tap card to see deep details</span>
        <span>DIST: ${entry.dist.toUpperCase()}</span>
      </div>
    `;
    catalogGrid.appendChild(cardElement);
  });
}

window.updateDashboardPriceDisplay = function(elementNode, itemRefId, updatedPriceVal, stockVal) {
  const containerDeck = elementNode.parentElement;
  containerDeck.querySelectorAll('.variant-pill').forEach(pill => pill.classList.remove('active'));
  elementNode.classList.add('active');
  
  document.getElementById(`cost_hud_${itemRefId}`).innerText = `₹${updatedPriceVal.toLocaleString('en-IN')}`;
  
  const badgeCont = document.getElementById(`stock_badge_${itemRefId}`);
  if (badgeCont) {
    badgeCont.innerHTML = stockVal > 3 
      ? `<span class="stock-badge">In Stock (${stockVal})</span>` 
      : `<span class="stock-badge low">Limited (${stockVal || 0})</span>`;
  }
};


// --- 8. SHOPPING SITE OVERLAY ENGINE ---
function openShoppingSiteDetailView(targetId) {
  const item = localProductBank.find(prod => prod.id === targetId);
  if (!item) return;

  document.getElementById('detailMetaBrand').innerText = `${item.brand.toUpperCase()} • ${item.series.toUpperCase()}`;
  document.getElementById('detailTitle').innerText = item.model;
  document.getElementById('detailColours').innerText = `Available Paint Schemes: ${item.colours || 'Standard Output'}`;
  document.getElementById('detailDistCode').innerText = item.dist.toUpperCase();

  // Populate Visual Assets (Primary + Additional Detail Shots)
  const mainImgElem = document.getElementById('detailMainImg');
  const thumbsDeck = document.getElementById('detailThumbnails');
  thumbsDeck.innerHTML = '';

  const fallbackPic = 'https://placehold.co/400x400/070a14/00f0ff?text=No+Visual+Uploaded';
  mainImgElem.src = item.photoPrimary || fallbackPic;

  let completeVisualBank = [];
  if (item.photoPrimary) completeVisualBank.push(item.photoPrimary);
  if (item.photosDetail && item.photosDetail.length > 0) {
    completeVisualBank = completeVisualBank.concat(item.photosDetail);
  }

  if (completeVisualBank.length > 1) {
    completeVisualBank.forEach((imgUrl, i) => {
      thumbsDeck.innerHTML += `
        <div class="thumb-box ${i === 0 ? 'active' : ''}" onclick="switchDetailMainImage(this, '${imgUrl}')">
          <img src="${imgUrl}" alt="Thumbnail view">
        </div>
      `;
    });
  }

  // Populate Configured Prices & Stock
  const variantsDeck = document.getElementById('detailVariantsDeck');
  variantsDeck.innerHTML = '';
  
  const initVar = item.variants && item.variants[0] ? item.variants[0] : { name: 'N/A', price: 0, stock: 0 };
  document.getElementById('detailPriceDisplay').innerText = `₹${initVar.price.toLocaleString('en-IN')}`;
  document.getElementById('detailStockDisplay').innerText = `${initVar.stock || 0} Units Locked`;

  if (item.variants) {
    item.variants.forEach((v, idx) => {
      variantsDeck.innerHTML += `
        <span class="variant-pill ${idx === 0 ? 'active' : ''}" style="font-size:1rem; padding:10px 18px;" 
              onclick="updateDetailOverlayPrice(this, ${v.price}, ${v.stock})">
          ${v.name}
        </span>
      `;
    });
  }

  // Render Specifications List
  const specsDeck = document.getElementById('detailSpecsList');
  specsDeck.innerHTML = '';
  if (item.specs && item.specs.length > 0) {
    item.specs.forEach(sLine => {
      specsDeck.innerHTML += `<li style="margin-bottom:8px; font-size:0.95rem;">${sLine}</li>`;
    });
  } else {
    specsDeck.innerHTML = '<li style="color:var(--hud-text-muted);">No specific deep specifications configured.</li>';
  }

  shoppingDetailModal.classList.remove('hidden');
}

window.switchDetailMainImage = function(elemNode, rawUrl) {
  const container = elemNode.parentElement;
  container.querySelectorAll('.thumb-box').forEach(b => b.classList.remove('active'));
  elemNode.classList.add('active');
  document.getElementById('detailMainImg').src = rawUrl;
};

window.updateDetailOverlayPrice = function(elemNode, newCost, newStock) {
  const container = elemNode.parentElement;
  container.querySelectorAll('.variant-pill').forEach(p => p.classList.remove('active'));
  elemNode.classList.add('active');

  document.getElementById('detailPriceDisplay').innerText = `₹${newCost.toLocaleString('en-IN')}`;
  document.getElementById('detailStockDisplay').innerText = `${newStock || 0} Units Locked`;
};


// --- 9. ADMIN CONSOLE WITH DIRECT LIVE QUANTITY BUTTONS ---
function renderAdminConsole() {
  const tableDeck = document.getElementById('adminProductList');
  const adminFilterStr = document.getElementById('searchAdmin').value.toLowerCase();
  
  tableDeck.innerHTML = '';
  
  localProductBank.filter(entry => 
    entry.model.toLowerCase().includes(adminFilterStr) || 
    entry.brand.toLowerCase().includes(adminFilterStr) ||
    entry.series.toLowerCase().includes(adminFilterStr)
  ).forEach(entry => {
    const listRow = document.createElement('div');
    listRow.className = 'admin-list-row';

    // Generate individual stock control pills per variant
    const variantsStockPills = entry.variants ? entry.variants.map((v, idx) => `
      <div class="stock-control-box">
        <span style="color:var(--hud-cyan); font-size:0.8rem; font-weight:bold;">${v.name}:</span>
        <button class="btn-stock-qty" onclick="modifyStockLive('${entry.id}', ${idx}, -1)">-</button>
        <span style="color:#fff; font-size:0.85rem; padding:0 4px;">${v.stock || 0}</span>
        <button class="btn-stock-qty" onclick="modifyStockLive('${entry.id}', ${idx}, 1)">+</button>
      </div>
    `).join('') : '';

    listRow.innerHTML = `
      <div style="flex:1;">
        <strong style="font-size:1.1rem; color: #fff;">${entry.brand} ${entry.model}</strong> <span style="color:var(--hud-cyan);">(${entry.series})</span>
        <div style="display:flex; flex-wrap:wrap; gap:10px; margin-top:8px; align-items:center;">
          <span style="font-size:0.75rem; color:var(--hud-text-muted);">LIVE STOCK BALANCING:</span>
          ${variantsStockPills}
        </div>
      </div>
      <div class="admin-row-buttons" style="margin-top:10px;">
        <button class="btn-action" style="padding: 8px 14px; font-size:0.8rem;" onclick="triggerProductEditor('${entry.id}')">✏️ EDIT</button>
        <button class="btn-delete" style="padding: 8px 14px; font-size:0.8rem;" onclick="deleteProductRecord('${entry.id}', '${entry.brand} ${entry.model}')">🗑️ DELETE</button>
      </div>
    `;
    tableDeck.appendChild(listRow);
  });
}

// Executes real-time stock modifications directly onto the Firebase database
window.modifyStockLive = function(targetId, vIndex, offset) {
  const item = localProductBank.find(p => p.id === targetId);
  if (!item || !item.variants || !item.variants[vIndex]) return;

  let currentCount = item.variants[vIndex].stock || 0;
  let newCount = currentCount + offset;
  if (newCount < 0) newCount = 0;

  item.variants[vIndex].stock = newCount;

  db.ref(`priceListProducts/${targetId}/variants/${vIndex}/stock`).set(newCount)
    .catch(err => alert("Link fault updating stock dynamically."));
};

window.deleteProductRecord = function(recordId, modelTitle) {
  if (confirm(`CRITICAL DELETION CONFIRMATION: Remove "${modelTitle}" from live cloud storage?`)) {
    db.ref('priceListProducts/' + recordId).remove()
      .catch(error => alert("Fault executing payload: " + error));
  }
};

window.triggerProductEditor = function(targetId) {
  const targetObj = localProductBank.find(item => item.id === targetId);
  if (!targetObj) return;

  clearEngineForm();
  document.getElementById('modalTitle').innerText = `EDITING: ${targetObj.brand.toUpperCase()} ${targetObj.model.toUpperCase()}`;
  document.getElementById('editProductId').value = targetObj.id;
  document.getElementById('pDist').value = targetObj.dist || '';
  document.getElementById('pBrand').value = targetObj.brand || '';
  document.getElementById('pSeries').value = targetObj.series || '';
  document.getElementById('pModel').value = targetObj.model || '';
  document.getElementById('pColours').value = targetObj.colours || '';

  configuredVariants = targetObj.variants ? [...targetObj.variants] : [];
  refreshPillsLayout();

  if (targetObj.photoPrimary) {
    capturedPrimaryPhotoBase64 = targetObj.photoPrimary;
    document.getElementById('photoPreviewPrimary').innerHTML = `<img src="${targetObj.photoPrimary}" style="max-height:100px; border-radius:4px; border:1px solid var(--hud-cyan);">`;
  }

  const specsRowsDeck = document.getElementById('specsContainer');
  specsRowsDeck.innerHTML = '';
  if (targetObj.specs) {
    targetObj.specs.forEach(sLine => {
      const lineInput = document.createElement('input');
      lineInput.type = 'text'; lineInput.className = 'hud-input spec-input-row';
      lineInput.value = sLine;
      specsRowsDeck.appendChild(lineInput);
    });
  }

  entryPopup.classList.remove('hidden');
};

document.getElementById('searchUser').addEventListener('input', renderUserCatalog);
document.getElementById('sortBrand').addEventListener('change', renderUserCatalog);
document.getElementById('sortSeries').addEventListener('change', renderUserCatalog);
document.getElementById('searchAdmin').addEventListener('input', renderAdminConsole);
