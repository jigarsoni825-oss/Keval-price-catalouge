// ============================================================================
// 1. DATABASE BRIDGE INITIALIZATION
// ============================================================================
const firebaseConfig = {
  databaseURL: "https://keval-mobile-zone-default-rtdb.firebaseio.com/"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.database();

// ============================================================================
// 2. TACTILE AUDIO SYNTHESIS ENGINE
// ============================================================================
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

// ============================================================================
// 3. PWA INSTALLATION HOOKS
// ============================================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => console.error('[SW] Registry Fault:', err));
  });
}

let deferredPrompt;
const btnInstall = document.getElementById('btnInstall');

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredPrompt = event;
  btnInstall.classList.remove('hidden');
});

btnInstall.addEventListener('click', async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') btnInstall.classList.add('hidden');
    deferredPrompt = null;
  }
});

// ============================================================================
// 4. CLOUD BRANDING ALGORITHM
// ============================================================================
function getDirectDriveUrl(urlStr) {
  if (!urlStr) return "";
  const cleaned = urlStr.trim();
  const fileIdMatch = cleaned.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (fileIdMatch && fileIdMatch[1]) {
    return `https://drive.google.com/uc?export=view&id=${fileIdMatch[1]}`;
  }
  return cleaned;
}

function applyCloudBranding() {
  const savedBgBase64 = localStorage.getItem('keval_local_bg');
  const savedLogo = localStorage.getItem('keval_drive_logo');

  if (savedBgBase64) {
    document.body.style.backgroundImage = `url('${savedBgBase64}')`;
  } else {
    document.body.style.backgroundImage = "url('./background.jpg')";
  }

  const brandCont = document.querySelector('.hud-brand-container');
  const oldLogo = document.getElementById('appCustomLogo');
  if (oldLogo) oldLogo.remove();

  if (savedLogo) {
    const imgElem = document.createElement('img');
    imgElem.id = 'appCustomLogo';
    imgElem.src = savedLogo;
    imgElem.style.cssText = "height: 32px; width: 32px; object-fit: contain; margin-right: 8px;";
    brandCont.prepend(imgElem);
  }
}
applyCloudBranding();

document.getElementById('btnSaveLogo').addEventListener('click', () => {
  const logoLinkRaw = document.getElementById('driveLogoLink').value;
  if (logoLinkRaw) {
    localStorage.setItem('keval_drive_logo', getDirectDriveUrl(logoLinkRaw));
    applyCloudBranding();
    alert("Logo linked successfully via direct stream.");
    document.getElementById('driveLogoLink').value = '';
  }
});

document.getElementById('appBgFileInput').addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      localStorage.removeItem('keval_drive_bg');
      localStorage.setItem('keval_local_bg', e.target.result);
      applyCloudBranding();
      alert("Success! App Background locked permanently into device storage.");
    };
    reader.readAsDataURL(file);
  }
});

document.getElementById('btnResetBg').addEventListener('click', () => {
  localStorage.removeItem('keval_local_bg');
  applyCloudBranding();
  alert("Custom Background storage wiped. Executing default aesthetic fallback.");
});

// ============================================================================
// 5. DATA ENGINE, AUTHENTICATION & CORE STATE
// ============================================================================
let localProductBank = [];
let configuredVariants = [];
let configuredColorsBank = [];
let compareQueueBank = [];
let currentAdminMode = false;
let authorizedDealerCodeReveal = false;

// Authenticated Access Configuration
let defaultPin = localStorage.getItem('keval_admin_pin') || "1234";
let pinEnabledStatus = localStorage.getItem('keval_pin_enabled') || "ENABLED";

// UI Components
const btnToggleView = document.getElementById('btnToggleView');
const userView = document.getElementById('userView');
const adminView = document.getElementById('adminView');
const entryPopup = document.getElementById('entryPopup');
const btnOpenPopup = document.getElementById('btnOpenPopup');
const btnClosePopup = document.getElementById('btnClosePopup');
const pinModal = document.getElementById('pinModal');
const pinConfigModal = document.getElementById('pinConfigModal');

// Subscribing to Live Synchronization Connection
db.ref('priceListProducts').on('value', (snapshot) => {
  const payload = snapshot.val();
  localProductBank = [];
  
  if (payload) {
    Object.keys(payload).forEach(key => {
      const item = payload[key];
      if (item) {
        localProductBank.push({
          id: item.id || key,
          category: item.category || 'MOBILE 📱',
          brand: item.brand || '',
          series: item.series || '',
          model: item.model || '',
          dist: item.dist || 'TIER-A',
          variants: item.variants || [],
          specs: item.specs || [],
          colorsBank: item.colorsBank || [],
          ledger: item.ledger || []
        });
      }
    });
  }
  
  buildDynamicFilters();
  refreshCompareQueueUI();
  if (currentAdminMode) renderAdminConsole();
  else renderUserCatalog();
});

// Filter Setup Engine
function buildDynamicFilters() {
  const catSelect = document.getElementById('sortCategory');
  const brandSelect = document.getElementById('sortBrand');
  
  const curCat = catSelect.value;
  const curBrand = brandSelect.value;

  const uniqueCats = [...new Set(localProductBank.map(i => i.category.toUpperCase()))].filter(Boolean);
  const uniqueBrands = [...new Set(localProductBank.map(i => i.brand.toUpperCase()))].filter(Boolean);

  catSelect.innerHTML = '<option value="">ALL CATEGORIES</option>' + uniqueCats.map(c => `<option value="${c}">${c}</option>`).join('');
  brandSelect.innerHTML = '<option value="">ALL BRANDS</option>' + uniqueBrands.map(b => `<option value="${b}">${b}</option>`).join('');

  if (uniqueCats.includes(curCat)) catSelect.value = curCat;
  if (uniqueBrands.includes(curBrand)) brandSelect.value = curBrand;
}

// PIN Authorization Paths
btnToggleView.addEventListener('click', () => {
  if (!currentAdminMode) {
    if (pinEnabledStatus === "ENABLED") {
      document.getElementById('adminPinInput').value = '';
      pinModal.classList.remove('hidden');
    } else {
      executeSwitchToAdmin();
    }
  } else {
    executeSwitchToUser();
  }
});

document.getElementById('btnCancelPin').addEventListener('click', () => pinModal.classList.add('hidden'));

document.getElementById('btnVerifyPin').addEventListener('click', () => {
  const entered = document.getElementById('adminPinInput').value;
  if (entered === defaultPin) {
    pinModal.classList.add('hidden');
    executeSwitchToAdmin();
  } else {
    alert("CRITICAL SECURITY FAULT: PIN validation failed.");
    document.getElementById('adminPinInput').value = '';
  }
});

function executeSwitchToAdmin() {
  currentAdminMode = true;
  userView.classList.add('hidden');
  adminView.classList.remove('hidden');
  btnToggleView.style.background = "var(--hud-cyan)";
  btnToggleView.style.color = "#000";
  btnToggleView.innerText = "SWITCH TO CATALOG";
  renderAdminConsole();
}

function executeSwitchToUser() {
  currentAdminMode = false;
  adminView.classList.add('hidden');
  userView.classList.remove('hidden');
  btnToggleView.style.background = "rgba(0, 240, 255, 0.1)";
  btnToggleView.style.color = "var(--hud-cyan)";
  btnToggleView.innerText = "⚙️ ADMIN";
  renderUserCatalog();
}

// Security Configuration Setup
document.getElementById('btnOpenPinConfig').addEventListener('click', () => {
  document.getElementById('newAdminPin').value = defaultPin;
  document.getElementById('pinToggleStatus').value = pinEnabledStatus;
  pinConfigModal.classList.remove('hidden');
});

document.getElementById('btnClosePinConfig').addEventListener('click', () => pinConfigModal.classList.add('hidden'));

document.getElementById('btnSavePinConfig').addEventListener('click', () => {
  const newP = document.getElementById('newAdminPin').value.trim();
  const toggleS = document.getElementById('pinToggleStatus').value;
  
  if (newP.length !== 4 || isNaN(newP)) return alert("Security setup requires a numeric 4-digit code.");
  
  defaultPin = newP;
  pinEnabledStatus = toggleS;
  localStorage.setItem('keval_admin_pin', defaultPin);
  localStorage.setItem('keval_pin_enabled', pinEnabledStatus);
  
  pinConfigModal.classList.add('hidden');
  alert("Security settings stored successfully!");
});


// ============================================================================
// 6. MODAL CREATION ENGINE & DYNAMIC CONFIGURATORS
// ============================================================================
const pCategorySelect = document.getElementById('pCategory');
const pCategoryCustom = document.getElementById('pCategoryCustom');
const pBrandSelect = document.getElementById('pBrand');
const pBrandCustom = document.getElementById('pBrandCustom');
const variantSelect = document.getElementById('variantSelect');
const customVariantInput = document.getElementById('customVariant');

btnOpenPopup.addEventListener('click', () => {
  clearEngineForm();
  document.getElementById('modalTitle').innerText = "CREATE DATABASE ENTRY";
  entryPopup.classList.remove('hidden');
});

btnClosePopup.addEventListener('click', () => entryPopup.classList.add('hidden'));

// Dynamic Fields Handlers
pCategorySelect.addEventListener('change', (event) => {
  const val = event.target.value;
  const vDeckLabel = document.getElementById('variantDeckLabel');
  
  if (val === 'OTHER') pCategoryCustom.classList.remove('hidden');
  else pCategoryCustom.classList.add('hidden');

  // Change input helper metrics dynamically based on active Category
  if (val.includes('TV')) {
    vDeckLabel.innerText = "TV SIZE (INCHES), PRICE & STOCK CONFIGURATOR";
    customVariantInput.placeholder = "ENTER SIZE (e.g. 32 Inch, 55 Inch)";
  } else if (val.includes('FRIDGE')) {
    vDeckLabel.innerText = "FRIDGE STORAGE CAPACITY (LTRS), PRICE & STOCK CONFIGURATOR";
    customVariantInput.placeholder = "ENTER CAPACITY (e.g. 190 Ltr, 250 Ltr)";
  } else {
    vDeckLabel.innerText = "RAM / ROM (GB), PRICE & INITIAL STOCK CONFIGURATOR";
    customVariantInput.placeholder = "ENTER CUSTOM SIZE (e.g. 8GB / 256GB)";
  }
});

pBrandSelect.addEventListener('change', (e) => {
  if (e.target.value === 'OTHER') pBrandCustom.classList.remove('hidden');
  else pBrandCustom.classList.add('hidden');
});

variantSelect.addEventListener('change', (e) => {
  if (e.target.value === 'OTHER') customVariantInput.classList.remove('hidden');
  else customVariantInput.classList.add('hidden');
});

// Dynamic Multi-Color Visual Bank Allocation
document.getElementById('btnAddColorSlot').addEventListener('click', () => addColorUploadSlot('', ''));

function addColorUploadSlot(colorNameVal, existingBase64) {
  const deck = document.getElementById('colorUploadsDeck');
  const slotId = 'color_slot_' + Date.now() + '_' + Math.floor(Math.random()*1000);
  
  const row = document.createElement('div');
  row.className = 'color-slot-row full-width';
  row.id = slotId;

  let imgTag = existingBase64 ? `<img src="${existingBase64}" style="max-height:40px; width:40px; object-fit:cover; border-radius:4px;">` : '';

  row.innerHTML = `
    <input type="text" placeholder="TYPE COLOUR NAME (e.g. Sci-Fi Cyan)" value="${colorNameVal}" class="hud-input color-label-input" style="flex:2; min-width:140px;">
    <input type="file" accept="image/*" class="hud-file-input color-file-input" style="flex:2; padding:6px; font-size:0.75rem;">
    <div class="color-preview-box" style="display:flex; align-items:center; justify-content:center; width:45px; height:45px;">${imgTag}</div>
    <button type="button" class="btn-delete small-btn" onclick="document.getElementById('${slotId}').remove()">✕</button>
  `;

  // Bind Base64 encoding stream onto local file input
  const fileInput = row.querySelector('.color-file-input');
  fileInput.addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (f) {
      const r = new FileReader();
      r.onload = (evt) => {
        row.querySelector('.color-preview-box').innerHTML = `<img src="${evt.target.result}" style="max-height:40px; width:40px; object-fit:cover; border-radius:4px;" data-base64="${evt.target.result}">`;
      };
      r.readAsDataURL(f);
    }
  });

  deck.appendChild(row);
}

// RAM/ROM Variant Building Engine
document.getElementById('btnAddVariant').addEventListener('click', () => {
  const label = variantSelect.value === 'OTHER' ? customVariantInput.value.trim() : variantSelect.value;
  const cost = document.getElementById('variantPrice').value;
  const initStock = document.getElementById('variantStock').value || 0;

  if (!label || !cost) return alert('Input processing fault: Assign valid size mapping parameters and cost details.');

  const existingSlot = configuredVariants.findIndex(v => v.name === label);
  if (existingSlot > -1) {
    configuredVariants[existingSlot].price = parseInt(cost, 10);
    configuredVariants[existingSlot].stock = parseInt(initStock, 10);
  } else {
    configuredVariants.push({ name: label, price: parseInt(cost, 10), stock: parseInt(initStock, 10) });
  }

  customVariantInput.value = ''; document.getElementById('variantPrice').value = '';
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


// ============================================================================
// 7. FIREBASE SUBMISSION & PARSING ALGORITHM
// ============================================================================
document.getElementById('productForm').addEventListener('submit', (event) => {
  event.preventDefault();
  
  const submitBtn = document.getElementById('btnSaveProductSubmit');
  submitBtn.querySelector('.save-text').classList.add('hidden');
  submitBtn.querySelector('.save-spinner').classList.remove('hidden');
  submitBtn.disabled = true;

  setTimeout(() => {
    executeFormCommitProcessing();
    submitBtn.querySelector('.save-text').classList.remove('hidden');
    submitBtn.querySelector('.save-spinner').classList.add('hidden');
    submitBtn.disabled = false;
  }, 400); // Guarantees smooth UI loading simulation
});

function executeFormCommitProcessing() {
  triggerInterfaceSound('publish');

  const editId = document.getElementById('editProductId').value;
  
  // Resolve assigned categories and brands
  const catVal = pCategorySelect.value === 'OTHER' ? pCategoryCustom.value.trim() : pCategorySelect.value;
  const brandVal = pBrandSelect.value === 'OTHER' ? pBrandCustom.value.trim() : pBrandSelect.value;
  
  // Parse Copy-Paste Specifications multi-line input
  const rawSpecsText = document.getElementById('pSpecsArea').value;
  const parsedSpecsArray = rawSpecsText.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  if (configuredVariants.length === 0) {
    alert("CRITICAL SECURITY LOCK: Item entries require at least one configured pricing and size slot.");
    return;
  }

  // Aggregate uploaded colors bank data
  configuredColorsBank = [];
  const activeColorRows = document.querySelectorAll('#colorUploadsDeck .color-slot-row');
  activeColorRows.forEach(row => {
    const lbl = row.querySelector('.color-label-input').value.trim();
    const imgNode = row.querySelector('.color-preview-box img');
    const b64 = imgNode ? (imgNode.getAttribute('data-base64') || imgNode.src) : '';
    
    if (lbl && b64) {
      configuredColorsBank.push({ colorName: lbl, base64: b64 });
    }
  });

  const payloadKey = editId || "ITEM_" + Date.now().toString();

  // Create initial ledger line item for brand new entries
  let initialLedger = [];
  if (!editId) {
    configuredVariants.forEach(v => {
      if (v.stock > 0) {
        initialLedger.push({
          date: new Date().toLocaleDateString('en-IN'),
          type: 'PURCHASE',
          variant: v.name,
          qty: v.stock,
          note: 'Initial System Entry configuration'
        });
      }
    });
  } else {
    // Retain historical ledger data on edits
    const existingObj = localProductBank.find(p => p.id === editId);
    if (existingObj && existingObj.ledger) initialLedger = [...existingObj.ledger];
  }

  const completeProductDocument = {
    id: payloadKey,
    category: catVal,
    brand: brandVal,
    series: document.getElementById('pSeries').value.trim(),
    model: document.getElementById('pModel').value.trim(),
    dist: document.getElementById('pDist').value.trim(),
    variants: configuredVariants,
    specs: parsedSpecsArray,
    colorsBank: configuredColorsBank,
    ledger: initialLedger
  };

  db.ref('priceListProducts/' + payloadKey).set(completeProductDocument)
    .catch(error => alert("Upload Socket failure: Confirm internet availability."));

  entryPopup.classList.add('hidden');
  clearEngineForm();
}

function clearEngineForm() {
  document.getElementById('productForm').reset();
  document.getElementById('editProductId').value = '';
  document.getElementById('colorUploadsDeck').innerHTML = '';
  document.getElementById('pSpecsArea').value = '';
  pCategoryCustom.classList.add('hidden');
  pBrandCustom.classList.add('hidden');
  customVariantInput.classList.add('hidden');
  configuredVariants = []; configuredColorsBank = [];
  refreshPillsLayout();
}


// ============================================================================
// 8. USER CATALOG RENDERING ENGINE & DETAILED PREVIEW OVERLAYS
// ============================================================================
function renderUserCatalog() {
  const catalogGrid = document.getElementById('productGrid');
  const queryStr = document.getElementById('searchUser').value.toLowerCase();
  const selectedCat = document.getElementById('sortCategory').value;
  const selectedBrand = document.getElementById('sortBrand').value;

  catalogGrid.innerHTML = '';

  localProductBank.filter(entry => {
    const stringMatches = entry.brand.toLowerCase().includes(queryStr) || 
                          entry.model.toLowerCase().includes(queryStr) ||
                          entry.series.toLowerCase().includes(queryStr) ||
                          entry.category.toLowerCase().includes(queryStr) ||
                          (entry.specs && entry.specs.some(s => s.toLowerCase().includes(queryStr)));
    const catMatches = selectedCat ? entry.category.toUpperCase() === selectedCat : true;
    const brandMatches = selectedBrand ? entry.brand.toUpperCase() === selectedBrand : true;
    return stringMatches && catMatches && brandMatches;
  }).forEach(entry => {
    const cardElement = document.createElement('div');
    cardElement.className = 'hud-card';
    
    // Binding deep inspection overlay trigger
    cardElement.onclick = (e) => {
      if (e.target.tagName !== 'SPAN' && e.target.tagName !== 'BUTTON') {
        openShoppingSiteDetailView(entry.id);
      }
    };

    const initialVar = entry.variants && entry.variants[0] ? entry.variants[0] : { name: 'N/A', price: 0, stock: 0 };
    const stockBadgeHtml = initialVar.stock > 0 
      ? `<span class="stock-badge">In Stock (${initialVar.stock})</span>` 
      : `<span class="stock-badge low">Out of Stock (0)</span>`;

    // Retrieve visual fallback image
    let primaryPic = 'https://placehold.co/400x400/050811/00f0ff?text=No+Visual+Uploaded';
    if (entry.colorsBank && entry.colorsBank.length > 0) {
      primaryPic = entry.colorsBank[0].base64;
    }

    // Extract color names summary
    const colorsListStr = entry.colorsBank && entry.colorsBank.length > 0 
      ? entry.colorsBank.map(c => c.colorName).join(', ') 
      : 'Standard Option';
    
    const renderedPillsDeck = entry.variants ? entry.variants.map((v, idx) => `
      <span class="variant-pill ${idx === 0 ? 'active' : ''}" 
            onclick="updateDashboardPriceDisplay(this, '${entry.id}', ${v.price}, ${v.stock})">
        ${v.name}
      </span>
    `).join('') : '';

    // Verify comparison status
    const isInCompare = compareQueueBank.some(p => p.id === entry.id);
    const compareBtnText = isInCompare ? "✓ IN DECK" : "⚖️ COMPARE";
    const compareBtnStyle = isInCompare ? "background:var(--hud-green); color:#000;" : "background:rgba(0,240,255,0.1); color:var(--hud-cyan);";

    cardElement.innerHTML = `
      <div>
        <div class="card-img-deck"><img src="${primaryPic}" class="card-img" alt="Cover"></div>
        <div class="flex-row-between">
          <div class="meta-brand">${entry.brand.toUpperCase()} • ${entry.series.toUpperCase()}</div>
          <div id="stock_badge_${entry.id}">${stockBadgeHtml}</div>
        </div>
        <h3 class="meta-model">${entry.model}</h3>
        <div style="font-size:0.75rem; color:var(--hud-cyan); margin-bottom:4px;">${entry.category}</div>
        <div class="meta-colours">Colours: ${colorsListStr}</div>
        
        <div id="cost_hud_${entry.id}" class="price-live-box">₹${initialVar.price.toLocaleString('en-IN')}</div>
        <div class="pills-deck">${renderedPillsDeck}</div>
      </div>
      
      <div class="meta-footer flex-row-between" style="align-items:center;">
        <span style="color:var(--hud-text-muted);">🔍 Tap card for deep specs</span>
        <button type="button" class="small-btn" style="border-radius:20px; border:1px solid var(--hud-cyan); ${compareBtnStyle}" onclick="toggleCompareItemQueue('${entry.id}')">${compareBtnText}</button>
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
    badgeCont.innerHTML = stockVal > 0 
      ? `<span class="stock-badge">In Stock (${stockVal})</span>` 
      : `<span class="stock-badge low">Out of Stock (0)</span>`;
  }
};

// ============================================================================
// 9. DETAILED SHOPPING PREVIEW ENGINE & DEALER MASKING
// ============================================================================
const shoppingDetailModal = document.getElementById('shoppingDetailModal');
const btnCloseDetail = document.getElementById('btnCloseDetail');
btnCloseDetail.addEventListener('click', () => shoppingDetailModal.classList.add('hidden'));

function openShoppingSiteDetailView(targetId) {
  const item = localProductBank.find(prod => prod.id === targetId);
  if (!item) return;

  authorizedDealerCodeReveal = false; // Reset visual auth lock
  document.getElementById('detailMetaBrand').innerText = `${item.brand.toUpperCase()} • ${item.series.toUpperCase()}`;
  document.getElementById('detailTitle').innerText = item.model;
  document.getElementById('detailCategoryBadge').innerText = item.category.toUpperCase();
  
  // Set masked tier output by default
  const dealerSpan = document.getElementById('detailDistCode');
  dealerSpan.innerText = "••••••";
  dealerSpan.setAttribute('data-raw', item.dist.toUpperCase());
  document.getElementById('btnRevealDealerCode').innerText = "🔒 AUTH REVEAL";

  // Build HD Visual Matrix & Mapped Color Selection Deck
  const mainImgElem = document.getElementById('detailMainImg');
  const thumbsDeck = document.getElementById('detailThumbnails');
  thumbsDeck.innerHTML = '';

  let fallbackPic = 'https://placehold.co/400x400/050811/00f0ff?text=No+Visual+Uploaded';
  if (item.colorsBank && item.colorsBank.length > 0) fallbackPic = item.colorsBank[0].base64;
  mainImgElem.src = fallbackPic;

  // Bind zoom triggers
  document.getElementById('detailImgViewerBox').onclick = () => openFullscreenHdViewer(mainImgElem.src);

  if (item.colorsBank && item.colorsBank.length > 0) {
    item.colorsBank.forEach((colorObj, idx) => {
      thumbsDeck.innerHTML += `
        <div class="thumb-box ${idx === 0 ? 'active' : ''}" title="View ${colorObj.colorName}" onclick="switchDetailMainColorVisual(this, '${colorObj.base64}')">
          <img src="${colorObj.base64}" alt="${colorObj.colorName}">
          <div style="position:absolute; bottom:0; background:rgba(0,0,0,0.8); width:100%; text-align:center; font-size:0.6rem; color:var(--hud-cyan); padding:1px;">${colorObj.colorName.substring(0,6)}</div>
        </div>
      `;
    });
  }

  // Populate Variant Deck Options
  const variantsDeck = document.getElementById('detailVariantsDeck');
  variantsDeck.innerHTML = '';
  
  const initVar = item.variants && item.variants[0] ? item.variants[0] : { name: 'N/A', price: 0, stock: 0 };
  document.getElementById('detailPriceDisplay').innerText = `₹${initVar.price.toLocaleString('en-IN')}`;
  document.getElementById('detailStockDisplay').innerText = `${initVar.stock || 0} Units Available`;

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

  // Render Spec Array
  const specsDeck = document.getElementById('detailSpecsList');
  specsDeck.innerHTML = '';
  if (item.specs && item.specs.length > 0) {
    item.specs.forEach(sLine => {
      specsDeck.innerHTML += `<li style="margin-bottom:8px; font-size:0.95rem;">${sLine}</li>`;
    });
  } else {
    specsDeck.innerHTML = '<li style="color:var(--hud-text-muted);">No deep specification text parsed for this entry.</li>';
  }

  shoppingDetailModal.classList.remove('hidden');
}

window.switchDetailMainColorVisual = function(elemNode, b64Url) {
  const container = elemNode.parentElement;
  container.querySelectorAll('.thumb-box').forEach(b => b.classList.remove('active'));
  elemNode.classList.add('active');
  document.getElementById('detailMainImg').src = b64Url;
};

window.updateDetailOverlayPrice = function(elemNode, newCost, newStock) {
  const container = elemNode.parentElement;
  container.querySelectorAll('.variant-pill').forEach(p => p.classList.remove('active'));
  elemNode.classList.add('active');

  document.getElementById('detailPriceDisplay').innerText = `₹${newCost.toLocaleString('en-IN')}`;
  document.getElementById('detailStockDisplay').innerText = `${newStock || 0} Units Available`;
};

// Masked Dealer Code Reveal Execution
document.getElementById('btnRevealDealerCode').addEventListener('click', () => {
  const dealerSpan = document.getElementById('detailDistCode');
  const btn = document.getElementById('btnRevealDealerCode');
  
  if (!authorizedDealerCodeReveal) {
    const inputPin = prompt("SECURE OVERRIDE REQUIRED: Enter Admin PIN to reveal wholesale dealer margins.");
    if (inputPin === defaultPin) {
      authorizedDealerCodeReveal = true;
      dealerSpan.innerText = dealerSpan.getAttribute('data-raw');
      btn.innerText = "🔓 HIDE CODE";
      btn.style.background = "var(--hud-red)";
      btn.style.color = "#fff";
    } else {
      alert("Authorization failed.");
    }
  } else {
    authorizedDealerCodeReveal = false;
    dealerSpan.innerText = "••••••";
    btn.innerText = "🔒 AUTH REVEAL";
    btn.style.background = "rgba(0,240,255,0.1)";
    btn.style.color = "var(--hud-cyan)";
  }
});

// HD Fullscreen Lightbox triggers
const hdViewerModal = document.getElementById('hdViewerModal');
const hdViewerImg = document.getElementById('hdViewerImg');
document.getElementById('btnCloseHdViewer').onclick = () => hdViewerModal.classList.add('hidden');

function openFullscreenHdViewer(imgSrc) {
  hdViewerImg.src = imgSrc;
  hdViewerModal.classList.remove('hidden');
}


// ============================================================================
// 10. ADVANCED FIVE-PRODUCT MATRIX COMPARISON ENGINE
// ============================================================================
const compareDock = document.getElementById('compareDock');
const compareDockItems = document.getElementById('compareDockItems');
const compareMatrixModal = document.getElementById('compareMatrixModal');
document.getElementById('btnCloseCompareMatrix').onclick = () => compareMatrixModal.classList.add('hidden');

window.toggleCompareItemQueue = function(itemId) {
  const existingIdx = compareQueueBank.findIndex(p => p.id === itemId);
  if (existingIdx > -1) {
    compareQueueBank.splice(existingIdx, 1);
  } else {
    if (compareQueueBank.length >= 5) {
      alert("COMPARISON LIMIT ALERT: Matrix processing capped at 5 simultaneous items.");
      return;
    }
    const item = localProductBank.find(p => p.id === itemId);
    if (item) compareQueueBank.push(item);
  }
  refreshCompareQueueUI();
  if (!currentAdminMode) renderUserCatalog();
};

function refreshCompareQueueUI() {
  document.getElementById('compareCount').innerText = compareQueueBank.length;
  compareDockItems.innerHTML = '';
  
  if (compareQueueBank.length > 0) {
    compareDock.classList.remove('hidden');
    compareQueueBank.forEach(prod => {
      compareDockItems.innerHTML += `
        <div class="compare-item-pill">
          <span>${prod.brand} ${prod.model.substring(0,8)}</span>
          <span style="cursor:pointer; color:var(--hud-red); font-weight:bold;" onclick="toggleCompareItemQueue('${prod.id}')">✕</span>
        </div>
      `;
    });
  } else {
    compareDock.classList.add('hidden');
  }
}

document.getElementById('btnClearCompare').onclick = () => {
  compareQueueBank = [];
  refreshCompareQueueUI();
  if (!currentAdminMode) renderUserCatalog();
};

document.getElementById('btnRunCompare').onclick = () => {
  if (compareQueueBank.length < 2) {
    alert("Please assign at least 2 distinct inventory items into the dock to run side-by-side matrices.");
    return;
  }
  buildExecuteComparisonMatrix();
};

function buildExecuteComparisonMatrix() {
  const tableContainer = document.getElementById('matrixTableDeck');
  
  let headerCells = '<th>FEATURES / METRICS</th>';
  let categoryCells = '<tr><td><strong>PRODUCT CATEGORY</strong></td>';
  let brandCells = '<tr><td><strong>BRAND • SERIES</strong></td>';
  let modelCells = '<tr><td><strong>MODEL NAME</strong></td>';
  let priceCells = '<tr><td><strong>INITIAL BASE PRICE</strong></td>';
  let variantCells = '<tr><td><strong>AVAILABLE VARIANTS</strong></td>';
  let colorCells = '<tr><td><strong>AVAILABLE COLOURS</strong></td>';
  let specCells = '<tr><td><strong>DEEP SYSTEM SPECS</strong></td>';

  compareQueueBank.forEach(prod => {
    // Determine visuals fallback
    let pic = 'https://placehold.co/100x100/050811/00f0ff?text=No+Pic';
    if (prod.colorsBank && prod.colorsBank.length > 0) pic = prod.colorsBank[0].base64;

    headerCells += `
      <th style="text-align:center;">
        <img src="${pic}" style="max-height:80px; object-fit:contain; margin-bottom:10px;"><br>
        <span style="color:#fff;">${prod.model}</span>
      </th>
    `;
    categoryCells += `<td><span style="color:var(--hud-cyan); font-weight:bold;">${prod.category}</span></td>`;
    brandCells += `<td>${prod.brand.toUpperCase()} • ${prod.series}</td>`;
    modelCells += `<td><strong style="font-size:1.1rem; color:#fff;">${prod.model}</strong></td>`;
    
    const baseP = prod.variants && prod.variants[0] ? prod.variants[0].price : 0;
    priceCells += `<td><span style="color:var(--hud-green); font-size:1.3rem; font-weight:bold;">₹${baseP.toLocaleString('en-IN')}</span></td>`;

    const mappedVars = prod.variants ? prod.variants.map(v => `• ${v.name} (₹${v.price.toLocaleString('en-IN')})`).join('<br>') : 'N/A';
    variantCells += `<td>${mappedVars}</td>`;

    const mappedCols = prod.colorsBank && prod.colorsBank.length > 0 ? prod.colorsBank.map(c => c.colorName).join('<br>') : 'Standard Option';
    colorCells += `<td>${mappedCols}</td>`;

    const mappedSpecs = prod.specs && prod.specs.length > 0 ? prod.specs.map(s => `• ${s}`).join('<br><br>') : '<span style="color:var(--hud-text-muted);">No deep parsing details loaded.</span>';
    specCells += `<td style="font-size:0.85rem;">${mappedSpecs}</td>`;
  });

  categoryCells += '</tr>'; brandCells += '</tr>'; modelCells += '</tr>'; priceCells += '</tr>'; variantCells += '</tr>'; colorCells += '</tr>'; specCells += '</tr>';

  tableContainer.innerHTML = `
    <table class="matrix-table">
      <thead><tr>${headerCells}</tr></thead>
      <tbody>
        ${categoryCells}
        ${brandCells}
        ${modelCells}
        ${priceCells}
        ${variantCells}
        ${colorCells}
        ${specCells}
      </tbody>
    </table>
  `;

  compareMatrixModal.classList.remove('hidden');
}


// ============================================================================
// 11. ADMIN CONSOLE & REALTIME STOCK AUDIT LEDGER
// ============================================================================
const stockLedgerModal = document.getElementById('stockLedgerModal');
let activeLedgerProductId = null;
document.getElementById('btnCloseLedger').onclick = () => stockLedgerModal.classList.add('hidden');

function renderAdminConsole() {
  const tableDeck = document.getElementById('adminProductList');
  const adminFilterStr = document.getElementById('searchAdmin').value.toLowerCase();
  
  tableDeck.innerHTML = '';
  
  localProductBank.filter(entry => 
    entry.model.toLowerCase().includes(adminFilterStr) || 
    entry.brand.toLowerCase().includes(adminFilterStr) ||
    entry.series.toLowerCase().includes(adminFilterStr) ||
    entry.category.toLowerCase().includes(adminFilterStr)
  ).forEach(entry => {
    const listRow = document.createElement('div');
    listRow.className = 'admin-list-row';

    // Sum overall stock across all mapped variants
    let totalStockCount = 0;
    if (entry.variants) {
      entry.variants.forEach(v => totalStockCount += (v.stock || 0));
    }

    const stockColor = totalStockCount > 0 ? 'var(--hud-green)' : 'var(--hud-red)';
    const ledgerLinesCount = entry.ledger ? entry.ledger.length : 0;

    listRow.innerHTML = `
      <div style="flex:2; min-width:250px;">
        <strong style="font-size:1.2rem; color: #fff;">${entry.brand} ${entry.model}</strong> <span style="color:var(--hud-cyan);">(${entry.series})</span>
        <div style="font-size:0.8rem; color:var(--hud-cyan); margin-top:4px; font-weight:bold;">${entry.category}</div>
        <div style="display:flex; gap:15px; margin-top:10px; font-size:0.85rem;">
          <span>TOTAL PHYSICAL STOCK: <strong style="color:${stockColor};">${totalStockCount} Units</strong></span>
          <span>AUDIT LEDGER ENTRIES: <strong style="color:var(--hud-cyan);">${ledgerLinesCount} Records</strong></span>
        </div>
      </div>
      <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
        <button class="btn-action small-btn" style="background:#00e676;" onclick="triggerStockAuditLedgerModal('${entry.id}')">📦 OPEN LEDGER</button>
        <button class="btn-action small-btn" onclick="triggerProductEditor('${entry.id}')">✏️ EDIT SPEC</button>
        <button class="btn-delete small-btn" onclick="deleteProductRecord('${entry.id}', '${entry.brand} ${entry.model}')">🗑️ DELETE</button>
      </div>
    `;
    tableDeck.appendChild(listRow);
  });
}

// Trigger Audit Ledger Overlay
window.triggerStockAuditLedgerModal = function(targetId) {
  const item = localProductBank.find(p => p.id === targetId);
  if (!item) return;

  activeLedgerProductId = targetId;
  document.getElementById('ledgerModalTitle').innerText = `📦 AUDIT LEDGER: ${item.brand} ${item.model}`;
  
  // Populate variants target selector
  const varSelect = document.getElementById('ledgerVariantSelect');
  varSelect.innerHTML = '';
  if (item.variants && item.variants.length > 0) {
    item.variants.forEach((v, idx) => {
      varSelect.innerHTML += `<option value="${idx}">${v.name} (Cur: ${v.stock || 0})</option>`;
    });
  } else {
    varSelect.innerHTML = '<option value="">No valid variant slots loaded</option>';
  }

  document.getElementById('ledgerQty').value = 1;
  document.getElementById('ledgerNote').value = '';

  refreshLedgerHistoricalTable(item);
  stockLedgerModal.classList.remove('hidden');
};

function refreshLedgerHistoricalTable(productObj) {
  const container = document.getElementById('ledgerHistoryContainer');
  container.innerHTML = '';

  if (productObj.ledger && productObj.ledger.length > 0) {
    // Reverse sorting places freshest entries at the top
    const sortedLines = [...productObj.ledger].reverse();
    
    sortedLines.forEach(row => {
      const isSale = row.type === 'SALE';
      const typeBadge = isSale ? '<span style="color:var(--hud-red); font-weight:bold;">📤 SALE</span>' : '<span style="color:var(--hud-green); font-weight:bold;">📥 PURCHASE</span>';
      const qtySign = isSale ? '-' : '+';
      
      container.innerHTML += `
        <div class="ledger-row ${isSale ? 'sale' : ''}">
          <div style="flex:2; min-width:150px;">
            <div><strong>${row.variant}</strong></div>
            <div style="font-size:0.75rem; color:var(--hud-text-muted); margin-top:2px;">${row.date} • Note: ${row.note || 'None'}</div>
          </div>
          <div style="display:flex; gap:15px; align-items:center;">
            ${typeBadge}
            <strong style="font-size:1rem; color:${isSale ? 'var(--hud-red)' : 'var(--hud-green)'};">${qtySign}${row.qty} Units</strong>
          </div>
        </div>
      `;
    });
  } else {
    container.innerHTML = '<div style="padding:15px; text-align:center; color:var(--hud-text-muted);">No transactional history recorded yet. Add records above.</div>';
  }
}

// Execution processing onto Firebase linking ledger transactions dynamically
document.getElementById('btnCommitTransaction').addEventListener('click', () => {
  if (!activeLedgerProductId) return;
  
  const item = localProductBank.find(p => p.id === activeLedgerProductId);
  if (!item || !item.variants) return;

  const vIdx = document.getElementById('ledgerVariantSelect').value;
  const tType = document.getElementById('ledgerTypeSelect').value;
  const qtyInput = parseInt(document.getElementById('ledgerQty').value, 10);
  const noteInput = document.getElementById('ledgerNote').value.trim();

  if (isNaN(qtyInput) || qtyInput <= 0) return alert("Please assign a valid transaction quantity integer.");
  if (vIdx === "") return alert("Fault: Missing targeted variant assignment slot.");

  let curStock = item.variants[vIdx].stock || 0;
  let newStock = tType === 'SALE' ? curStock - qtyInput : curStock + qtyInput;
  if (newStock < 0) newStock = 0; // Prevent absolute negative floor breaks

  // Modify stock instantly
  item.variants[vIdx].stock = newStock;

  // Append new historical ledger record
  const newRecordLine = {
    date: new Date().toLocaleDateString('en-IN') + ' ' + new Date().toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit'}),
    type: tType,
    variant: item.variants[vIdx].name,
    qty: qtyInput,
    note: noteInput || (tType === 'SALE' ? 'Standard point-of-sale withdrawal' : 'Standard wholesale restock')
  };

  if (!item.ledger) item.ledger = [];
  item.ledger.push(newRecordLine);

  // Commit transaction payloads cleanly
  db.ref(`priceListProducts/${activeLedgerProductId}/variants/${vIdx}/stock`).set(newStock);
  db.ref(`priceListProducts/${activeLedgerProductId}/ledger`).set(item.ledger)
    .then(() => {
      triggerInterfaceSound('click');
      document.getElementById('ledgerQty').value = 1;
      document.getElementById('ledgerNote').value = '';
      
      // Update targeted var select label to reflect live stock state
      const targetOpt = document.querySelector(`#ledgerVariantSelect option[value="${vIdx}"]`);
      if (targetOpt) targetOpt.innerText = `${item.variants[vIdx].name} (Cur: ${newStock})`;

      refreshLedgerHistoricalTable(item);
      renderAdminConsole();
    })
    .catch(err => alert("Link transmission fault logging audit record."));
});

window.deleteProductRecord = function(recordId, modelTitle) {
  if (confirm(`CRITICAL SECURITY LOCK OVERRIDE: Permanently remove "${modelTitle}" and complete associated ledger records from the cloud database?`)) {
    db.ref('priceListProducts/' + recordId).remove()
      .catch(error => alert("Fault executing removal payload: " + error));
  }
};

window.triggerProductEditor = function(targetId) {
  const targetObj = localProductBank.find(item => item.id === targetId);
  if (!targetObj) return;

  clearEngineForm();
  document.getElementById('modalTitle').innerText = `EDITING SPEC: ${targetObj.brand.toUpperCase()} ${targetObj.model.toUpperCase()}`;
  document.getElementById('editProductId').value = targetObj.id;
  
  // Apply mappings safely
  pCategorySelect.value = targetObj.category;
  if (!pCategorySelect.value) {
    pCategorySelect.value = 'OTHER';
    pCategoryCustom.value = targetObj.category;
    pCategoryCustom.classList.remove('hidden');
  }

  pBrandSelect.value = targetObj.brand;
  if (!pBrandSelect.value) {
    pBrandSelect.value = 'OTHER';
    pBrandCustom.value = targetObj.brand;
    pBrandCustom.classList.remove('hidden');
  }

  document.getElementById('pSeries').value = targetObj.series || '';
  document.getElementById('pModel').value = targetObj.model || '';
  document.getElementById('pDist').value = targetObj.dist || '';

  // Hydrate Variants Array
  configuredVariants = targetObj.variants ? [...targetObj.variants] : [];
  refreshPillsLayout();

  // Hydrate Multi-Color Image Mappings
  if (targetObj.colorsBank && targetObj.colorsBank.length > 0) {
    targetObj.colorsBank.forEach(c => addColorUploadSlot(c.colorName, c.base64));
  }

  // Hydrate Spec lines back into parsed textarea
  if (targetObj.specs && targetObj.specs.length > 0) {
    document.getElementById('pSpecsArea').value = targetObj.specs.join('\n');
  }

  entryPopup.classList.remove('hidden');
};

// Bind Core Reactive DOM Processing Events
document.getElementById('searchUser').addEventListener('input', renderUserCatalog);
document.getElementById('sortCategory').addEventListener('change', renderUserCatalog);
document.getElementById('sortBrand').addEventListener('change', renderUserCatalog);
document.getElementById('searchAdmin').addEventListener('input', renderAdminConsole);


// ============================================================================
// 12. HIGH-PERFORMANCE NATIVE DATA DOWNLOAD & PDF EXPORT ENGINE
// ============================================================================
const exportDataModal = document.getElementById('exportDataModal');
const pdfRenderCanvas = document.getElementById('pdfRenderCanvas');

document.getElementById('btnOpenExportPanel').onclick = () => exportDataModal.classList.remove('hidden');
document.getElementById('btnCloseExport').onclick = () => exportDataModal.classList.add('hidden');

// Export JSON File Package directly
document.getElementById('btnExportJSON').onclick = () => {
  const scopeVal = document.getElementById('exportScope').value;
  let datasetTarget = localProductBank;

  if (scopeVal === 'FILTERED') {
    const q = document.getElementById('searchAdmin').value.toLowerCase();
    datasetTarget = localProductBank.filter(p => 
      p.model.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
    );
  }

  // Optimize data structure completely out of massive image payloads
  const cleanedPayload = datasetTarget.map(item => {
    return {
      id: item.id,
      category: item.category,
      brand: item.brand,
      series: item.series,
      model: item.model,
      dealerTierCode: item.dist,
      variants: item.variants,
      specifications: item.specs,
      availableColorNames: item.colorsBank ? item.colorsBank.map(c => c.colorName) : [],
      historicalStockLedgerCount: item.ledger ? item.ledger.length : 0
    };
  });

  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(cleanedPayload, null, 2));
  const dlAnchor = document.createElement('a');
  dlAnchor.setAttribute("href", dataStr);
  dlAnchor.setAttribute("download", `keval_inventory_optimized_${scopeVal.toLowerCase()}_${Date.now()}.json`);
  document.body.appendChild(dlAnchor);
  dlAnchor.click();
  dlAnchor.remove();
};

// Generate Native Visual Inventory PDF Sheets procedurally
document.getElementById('btnExportPDF').onclick = () => {
  const scopeVal = document.getElementById('exportScope').value;
  let datasetTarget = localProductBank;

  if (scopeVal === 'FILTERED') {
    const q = document.getElementById('searchAdmin').value.toLowerCase();
    datasetTarget = localProductBank.filter(p => 
      p.model.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
    );
  }

  if (datasetTarget.length === 0) {
    alert("Zero matching records captured in scope to print PDF.");
    return;
  }

  // Build Procedural Canvas Output
  pdfRenderCanvas.innerHTML = `
    <div style="border-bottom:3px solid #000; padding-bottom:15px; margin-bottom:20px;">
      <h1 style="font-size:2rem; color:#000; margin:0;">KEVAL MOBILE ZONE</h1>
      <div style="font-size:0.9rem; color:#444; margin-top:4px;">OPTIMIZED WAREHOUSE INVENTORY AUDIT REPORT</div>
      <div style="font-size:0.8rem; color:#666; margin-top:2px;">Generated: ${new Date().toLocaleString('en-IN')} • Scope: ${scopeVal} LIST</div>
    </div>
  `;

  let itemsTableRows = '';
  datasetTarget.forEach((p, idx) => {
    // Sum total physical physical stock quantities
    let tStock = 0;
    if (p.variants) p.variants.forEach(v => tStock += (v.stock || 0));

    const vStr = p.variants ? p.variants.map(v => `<strong>${v.name}</strong>: ₹${v.price.toLocaleString('en-IN')} (Qty:${v.stock})`).join('<br>') : 'N/A';
    const cStr = p.colorsBank && p.colorsBank.length > 0 ? p.colorsBank.map(c => c.colorName).join(', ') : 'Standard Option';

    itemsTableRows += `
      <tr style="border-bottom:1px solid #ddd;">
        <td style="padding:10px; vertical-align:top;"><strong>${idx+1}</strong></td>
        <td style="padding:10px; vertical-align:top;">
          <div style="font-size:1.1rem; color:#000; font-weight:bold;">${p.brand} ${p.model}</div>
          <div style="font-size:0.8rem; color:#666;">Category: ${p.category} • Series: ${p.series}</div>
          <div style="font-size:0.8rem; color:#444; margin-top:4px;">Colours: ${cStr}</div>
        </td>
        <td style="padding:10px; vertical-align:top; font-size:0.9rem;">${vStr}</td>
        <td style="padding:10px; vertical-align:top; text-align:center;">
          <strong style="font-size:1.1rem; color:${tStock > 0 ? 'green' : 'red'};">${tStock} Units</strong>
        </td>
      </tr>
    `;
  });

  pdfRenderCanvas.innerHTML += `
    <table style="width:100%; border-collapse:collapse; text-align:left; font-size:0.95rem;">
      <thead>
        <tr style="background:#eee; border-bottom:2px solid #ccc;">
          <th style="padding:10px; width:5%;">#</th>
          <th style="padding:10px; width:45%;">PRODUCT DIRECTORY DETAILS</th>
          <th style="padding:10px; width:35%;">CONFIGURED VARIANT COSTS & LOTS</th>
          <th style="padding:10px; width:15%; text-align:center;">TOTAL LOT</th>
        </tr>
      </thead>
      <tbody>${itemsTableRows}</tbody>
    </table>
    <div style="margin-top:30px; text-align:center; font-size:0.75rem; color:#888;">
      CONFIDENTIAL WAREHOUSE REPORTING • KEVAL MOBILE ZONE INTERNAL ACCESS SYSTEM ONLY
    </div>
  `;

  pdfRenderCanvas.classList.remove('hidden');
  
  triggerInterfaceSound('publish');
  const pdfOptParams = {
    margin:       0.5,
    filename:     `keval_inventory_audit_report_${Date.now()}.pdf`,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2 },
    jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
  };

  // Run the conversion pipeline
  html2pdf().set(pdfOptParams).from(pdfRenderCanvas).save().then(() => {
    pdfRenderCanvas.classList.add('hidden');
    exportDataModal.classList.add('hidden');
  });
};

// Force initial loading sequence
renderUserCatalog();
