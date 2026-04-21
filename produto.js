// =====================================================
// PRODUTO.JS — Dynamic Product Loader
// Loads product data from Supabase via Netlify Functions
// =====================================================

let currentProduct = null;
let productImages = [];
let selectedImage = 0;
let savedAddress = null;

// ====== DEVICE FINGERPRINT ======
function getDeviceFingerprint() {
  const data = [
    navigator.userAgent,
    screen.width + 'x' + screen.height,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    navigator.language
  ].join('|');
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = ((hash << 5) - hash) + data.charCodeAt(i);
    hash |= 0;
  }
  return 'fp_' + Math.abs(hash).toString(36);
}
const fingerprint = getDeviceFingerprint();

// ====== STATE ======
let cart = JSON.parse(localStorage.getItem('cart_' + fingerprint)) || [];
let favs = JSON.parse(localStorage.getItem('fav_' + fingerprint)) || [];

function saveState() {
  localStorage.setItem('cart_' + fingerprint, JSON.stringify(cart));
  localStorage.setItem('fav_' + fingerprint, JSON.stringify(favs));
  updateBadges();
  renderCartDrawer();
  renderFavDrawer();
}

// ====== LOAD PRODUCT FROM API ======
async function loadProduct() {
  const path = window.location.pathname.replace(/^\//, '').replace(/\/$/, '');
  const urlParams = new URLSearchParams(window.location.search);
  const slug = path && path !== 'produto.html' && path !== 'index.html' ? path : urlParams.get('slug');

  // If no slug, redirect to home
  if (!slug || slug === '' || slug === 'admin' || slug === 'admin.html' || slug === 'checkout.html') {
    window.location.href = '/';
    return;
  }

  try {
    const res = await fetch('/.netlify/functions/products?slug=' + encodeURIComponent(slug));
    if (!res.ok) throw new Error('Produto não encontrado');
    const data = await res.json();
    
    currentProduct = data;
    productImages = data.images || data.images_json || [];
    
    // Update page title
    document.title = data.name + ' | Mercado Livre';

    // Update breadcrumb
    var breadcrumb = document.getElementById('breadcrumbName');
    if (breadcrumb) breadcrumb.textContent = data.name;

    // Update product title(s)
    var titleEl = document.getElementById('productTitle');
    if (titleEl) titleEl.textContent = data.name;

    // Update price
    var price = parseFloat(data.price);
    var intPart = Math.floor(price);
    var centsPart = (price % 1).toFixed(2).split('.')[1];
    
    var priceInt = document.getElementById('priceInteger');
    var priceCents = document.getElementById('priceCents');
    if (priceInt) priceInt.textContent = 'R$ ' + intPart.toLocaleString('pt-BR') + ',';
    if (priceCents) priceCents.textContent = centsPart;

    // Old price
    var oldPriceEl = document.getElementById('oldPrice');
    if (oldPriceEl && data.old_price && parseFloat(data.old_price) > 0) {
      oldPriceEl.style.display = 'block';
      oldPriceEl.textContent = 'R$ ' + parseFloat(data.old_price).toLocaleString('pt-BR', {minimumFractionDigits: 2});
    }

    // Installments
    var installEl = document.getElementById('installmentText');
    if (installEl) {
      var installValue = (price / 12).toFixed(2).replace('.', ',');
      installEl.textContent = '12x R$ ' + installValue;
    }

    // Stock
    var stockEl = document.getElementById('stockInfo');
    if (stockEl && data.stock) stockEl.textContent = '(+' + data.stock + ' disponíveis)';

    // Description
    var descEl = document.getElementById('productDescription');
    if (descEl && data.description) descEl.textContent = data.description;

    // Features / Characteristics
    var features = data.features || data.features_json;
    if (features && typeof features === 'object') {
      var mainSpecs = document.getElementById('mainSpecs');
      var charModalBody = document.getElementById('charModalBody');
      var recordSpecs = document.getElementById('recordSpecs');
      
      var entries = Object.entries(features);
      var mainHtml = '';
      var recordHtml = '';
      
      entries.forEach(function(entry, i) {
        var row = '<tr><td>' + entry[0] + '</td><td>' + entry[1] + '</td></tr>';
        if (i < 4) mainHtml += row;
        else recordHtml += row;
      });

      if (mainSpecs) mainSpecs.innerHTML = mainHtml;
      if (recordSpecs) recordSpecs.innerHTML = recordHtml || '<tr><td colspan="2" style="color:#999;text-align:center">Sem registros adicionais</td></tr>';
      
      // Full table in modal
      if (charModalBody) {
        var fullHtml = '<h4 style="margin-bottom:16px;font-weight:600">Características principais</h4>';
        fullHtml += '<table class="specs-table">' + mainHtml + '</table>';
        if (recordHtml) {
          fullHtml += '<h4 style="margin:24px 0 16px;font-weight:600">Registros de produtos</h4>';
          fullHtml += '<table class="specs-table">' + recordHtml + '</table>';
        }
        charModalBody.innerHTML = fullHtml;
      }
    }

    // INJECT NATIVE SECTIONS FROM SOURCE_HTML
    if (data.source_html) {
      try {
        var parser = new DOMParser();
        var doc = parser.parseFromString(data.source_html, 'text/html');
        
        // Extrai todo CSS original para manter design igual
        var stylesheets = Array.from(doc.querySelectorAll('link[rel="stylesheet"], style')).map(function(el){return el.outerHTML}).join('\n');
        doc.querySelectorAll('script').forEach(function(s){s.remove()}); // Remove scripts
        
        var createShadowContainer = function(htmlContent) {
           var div = document.createElement('div');
           div.className = 'card mt-16';
           div.style.padding = '0';
           div.style.overflow = 'hidden';
           div.style.marginTop = '16px';
           var shadow = div.attachShadow({mode: 'open'});
           // Force load lazy imags
           htmlContent = htmlContent.replace(/data-src=/g, 'src=');
           shadow.innerHTML = stylesheets + '<div style="background:#fff;padding:24px;font-family:\'Proxima Nova\',sans-serif">' + htmlContent + '</div>';
           return div;
        };

        // 1. Detalhes (Descrição com Imagens)
        var descNode = doc.querySelector('.ui-pdp-description');
        if (descNode) {
           var oldDesc = document.getElementById('descriptionCard');
           if (oldDesc) {
               oldDesc.style.display = 'none';
               oldDesc.parentNode.insertBefore(createShadowContainer('<h2 style="font-size:24px;margin-bottom:24px;font-weight:400;color:#333;">Descrição</h2>' + descNode.innerHTML), oldDesc);
           }
        }

        // 2. Características Principais
        var specsNode = doc.querySelector('.ui-pdp-specs') || doc.querySelector('.ui-pdp-container--pdp-specs');
        if (specsNode) {
           var oldSpecs = document.getElementById('mainSpecs').parentElement;
           if (oldSpecs) {
               oldSpecs.style.display = 'none';
               oldSpecs.parentNode.insertBefore(createShadowContainer(specsNode.innerHTML), oldSpecs);
           }
        }

        // 3. Opiniões do Produto (Feedbacks/Reviews)
        var reviewsNode = doc.querySelector('.ui-pdp-reviews') || doc.querySelector('#reviews-capability') || doc.querySelector('.ui-review-capability');
        if (reviewsNode) {
           var detailsSection = document.querySelector('.details-section');
           if (detailsSection) {
               detailsSection.appendChild(createShadowContainer(reviewsNode.outerHTML));
           }
        }
      } catch(e) { console.error('Error parsing source_html:', e); }
    }

    // Product Code
    var codeEl = document.getElementById('productCode');
    if (codeEl && data.id) {
      codeEl.textContent = 'Anúncio #' + data.id.substring(0, 8).toUpperCase();
    }

    // Seller info - Oficial ML
    var sellerEl = document.getElementById('sellerName');
    var sellerTitle = document.getElementById('sellerTitle');
    var logoImg = '<img src="https://contconjunto.com.br/ws/media-library/90a30ac091fa078916abe9c51c1db7c8/mercado-livre-icon-logo-vector.svg-.png" style="height:18px;vertical-align:middle;margin-top:-3px;margin-right:4px;" alt="">';
    var verifiedSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="#3483FA" style="vertical-align:middle;margin:-2px 0 0 4px"><circle cx="12" cy="12" r="10" fill="#3483FA"/><path d="M9.5 16.5l-4-4 1.5-1.5 2.5 2.5 6.5-6.5 1.5 1.5-8 8z" fill="#fff"/></svg>';
    if (sellerEl) sellerEl.innerHTML = logoImg + 'Mercado Livre ' + verifiedSvg;
    if (sellerTitle) sellerTitle.innerHTML = 'Vendido por &nbsp;' + logoImg + 'Mercado Livre ' + verifiedSvg;

    // Init gallery
    initGallery();
    
    // Check Fav Status
    if (favs.some(f => f.id === currentProduct.id)) {
      document.getElementById('galleryFavBtn').classList.add('active');
    }

    updateBadges();
    renderCartDrawer();
    renderFavDrawer();

    // Show page
    document.body.style.opacity = '1';

  } catch (err) {
    console.error('Product load error:', err);
    document.body.innerHTML = '<div style="padding:80px 24px;text-align:center;min-height:60vh;display:flex;flex-direction:column;align-items:center;justify-content:center">' +
      '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#ddd" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>' +
      '<h1 style="font-size:24px;font-weight:400;color:#666;margin:24px 0 8px">Produto não encontrado</h1>' +
      '<p style="color:#999;margin-bottom:24px">O produto que você procura não existe ou foi removido.</p>' +
      '<a href="/" style="display:inline-block;padding:12px 32px;background:#3483FA;color:#fff;border-radius:6px;text-decoration:none;font-weight:500">Voltar para a Home</a></div>';
    document.body.style.opacity = '1';
  }
}

// ====== GALLERY ======
function initGallery() {
  var thumbsEl = document.getElementById('thumbnails');
  var dotsEl = document.getElementById('mobileDots');
  if (!thumbsEl || !productImages.length) return;

  thumbsEl.innerHTML = '';
  if (dotsEl) dotsEl.innerHTML = '';

  productImages.forEach(function(img, i) {
    // Thumbnails (desktop)
    var btn = document.createElement('button');
    btn.className = 'thumb-btn' + (i === 0 ? ' active' : '');
    btn.onclick = function() { selectImage(i); };
    btn.innerHTML = '<img src="' + img + '" alt="Thumb ' + (i+1) + '">';
    thumbsEl.appendChild(btn);

    // Dots (mobile)
    if (dotsEl) {
      var dot = document.createElement('button');
      dot.className = 'dot' + (i === 0 ? ' active' : '');
      dot.onclick = function() { selectImage(i); };
      dotsEl.appendChild(dot);
    }
  });
  updateMainImage();
}

function selectImage(idx) {
  selectedImage = idx;
  updateMainImage();
  var thumbs = document.querySelectorAll('.thumb-btn');
  var dots = document.querySelectorAll('.dot');
  thumbs.forEach(function(t, i) { t.className = 'thumb-btn' + (i === idx ? ' active' : ''); });
  dots.forEach(function(d, i) { d.className = 'dot' + (i === idx ? ' active' : ''); });
}

function nextImage() { selectImage((selectedImage + 1) % productImages.length); }
function prevImage() { selectImage((selectedImage - 1 + productImages.length) % productImages.length); }

function updateMainImage() {
  var mainImg = document.getElementById('mainImage');
  var counter = document.getElementById('imageCounter');
  if (mainImg && productImages[selectedImage]) mainImg.src = productImages[selectedImage];
  if (counter) counter.textContent = (selectedImage + 1) + '/' + productImages.length;
}

// ====== MODALS ======
function openModal(id) {
  var el = document.getElementById(id);
  if (el) { el.classList.add('open'); document.body.style.overflow = 'hidden'; }
}
function closeModal(id) {
  var el = document.getElementById(id);
  if (el) { el.classList.remove('open'); document.body.style.overflow = ''; }
}
function closeModalOverlay(e) {
  if (e.target === e.currentTarget) {
    e.target.classList.remove('open');
    document.body.style.overflow = '';
  }
}

// ====== DRAWERS (CART & FAV) ======
function toggleDrawer(id) {
  closeDrawers();
  document.getElementById('drawerOverlay').classList.add('active');
  document.getElementById(id).classList.add('active');
}
function closeDrawers() {
  document.getElementById('drawerOverlay').classList.remove('active');
  document.getElementById('cartDrawer').classList.remove('active');
  document.getElementById('favDrawer').classList.remove('active');
}

function updateBadges() {
  const cBadge = document.getElementById('cartBadge');
  const fBadge = document.getElementById('favBadge');
  if(cBadge) {
    if(cart.length > 0) { cBadge.style.display = 'block'; cBadge.textContent = cart.length; } else cBadge.style.display = 'none';
  }
  if(fBadge) {
    if(favs.length > 0) { fBadge.style.display = 'block'; fBadge.textContent = favs.length; } else fBadge.style.display = 'none';
  }
}

function renderCartDrawer() {
  const body = document.getElementById('cartBody');
  const totalEl = document.getElementById('cartTotal');
  if(!body) return;
  if(cart.length === 0) {
    body.innerHTML = '<div class="drawer-empty">Seu carrinho está vazio</div>';
    if(totalEl) totalEl.textContent = 'R$ 0,00';
    return;
  }
  let html = '', total = 0;
  cart.forEach(item => {
    total += item.price;
    html += `
      <div class="drawer-item">
        <img class="drawer-item-img" src="${item.image}" alt="">
        <div class="drawer-item-info">
          <div class="drawer-item-name">${item.name}</div>
          <div class="drawer-item-price">R$ ${item.price.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
          <button class="drawer-item-remove" onclick="removeFromCart('${item.id}')">Remover</button>
        </div>
      </div>
    `;
  });
  body.innerHTML = html;
  if(totalEl) totalEl.textContent = 'R$ ' + total.toLocaleString('pt-BR',{minimumFractionDigits:2});
}

function renderFavDrawer() {
  const body = document.getElementById('favBody');
  if(!body) return;
  if(favs.length === 0) {
    body.innerHTML = '<div class="drawer-empty">Nenhum favorito adicionado</div>';
    return;
  }
  let html = '';
  favs.forEach(item => {
    html += `
      <div class="drawer-item">
        <img class="drawer-item-img" src="${item.image}" alt="">
        <div class="drawer-item-info">
          <a href="/${item.slug}" style="text-decoration:none">
            <div class="drawer-item-name">${item.name}</div>
            <div class="drawer-item-price">R$ ${item.price.toLocaleString('pt-BR',{minimumFractionDigits:2})}</div>
          </a>
          <button class="drawer-item-remove" onclick="removeFromFavs('${item.id}')">Remover favorito</button>
        </div>
      </div>
    `;
  });
  body.innerHTML = html;
}

function addToCartProduct() {
  if(!currentProduct) return;
  const id = currentProduct.id;
  if(!cart.find(i => i.id === id)) {
    cart.push({ id: currentProduct.id, slug: currentProduct.slug, name: currentProduct.name, price: parseFloat(currentProduct.price), image: productImages[0] });
    saveState();
  }
  toggleDrawer('cartDrawer');
}

function removeFromCart(id) {
  cart = cart.filter(i => i.id !== id);
  saveState();
}

function toggleFavProduct() {
  if(!currentProduct) return;
  const id = currentProduct.id;
  const idx = favs.findIndex(i => i.id === id);
  const btn = document.getElementById('galleryFavBtn');
  
  if(idx > -1) {
    favs.splice(idx, 1);
    if(btn) btn.classList.remove('active');
  } else {
    favs.push({ id: currentProduct.id, slug: currentProduct.slug, name: currentProduct.name, price: parseFloat(currentProduct.price), image: productImages[0] });
    if(btn) btn.classList.add('active');
  }
  saveState();
}

function removeFromFavs(id) {
  favs = favs.filter(i => i.id !== id);
  if(currentProduct && currentProduct.id === id) {
    var btn = document.getElementById('galleryFavBtn');
    if(btn) btn.classList.remove('active');
  }
  saveState();
}

function checkoutCart() {
  if(cart.length === 0) return alert('Carrinho vazio!');
  localStorage.setItem('selectedProduct', JSON.stringify(cart[0]));
  window.location.href = '/checkout?token=' + Math.random().toString(36).substr(2, 12).toUpperCase();
}


// ====== BUY NOW ======
function handleBuyNow() {
  if (!currentProduct) return;
  
  localStorage.setItem('selectedProduct', JSON.stringify({
    id: currentProduct.id,
    name: currentProduct.name,
    price: currentProduct.price,
    image: productImages.length ? productImages[0] : null
  }));

  if (savedAddress && savedAddress.numero) {
    window.location.href = '/checkout?token=' + Math.random().toString(36).substr(2, 12).toUpperCase();
  } else {
    localStorage.setItem('returnToCheckout', 'true');
    openModal('addressModal');
  }
}

// ====== CEP / ADDRESS ======
function handleCepInput(input) {
  var val = input.value.replace(/\D/g, '').slice(0, 8);
  input.value = val;
  if (val.length === 8) fetchAddress(val);
}

async function fetchAddress(cep) {
  var loading = document.getElementById('cepLoading');
  var error = document.getElementById('cepError');
  var fields = document.getElementById('addressFields');
  var saveBtn = document.getElementById('saveAddressBtn');

  loading.style.display = 'block';
  error.style.display = 'none';
  fields.style.display = 'none';

  try {
    var res = await fetch('https://viacep.com.br/ws/' + cep + '/json/');
    var data = await res.json();
    loading.style.display = 'none';

    if (data.erro) {
      error.textContent = 'CEP não encontrado.';
      error.style.display = 'block';
      return;
    }

    document.getElementById('ruaInput').value = data.logradouro || '';
    document.getElementById('bairroInput').value = data.bairro || '';
    document.getElementById('cidadeInput').value = data.localidade || '';
    document.getElementById('ufInput').value = data.uf || '';
    fields.style.display = 'block';

    document.getElementById('numeroInput').oninput = function() {
      saveBtn.disabled = !this.value.trim();
    };
  } catch(e) {
    loading.style.display = 'none';
    error.textContent = 'Erro ao buscar endereço.';
    error.style.display = 'block';
  }
}

function saveAddress() {
  savedAddress = {
    logradouro: document.getElementById('ruaInput').value,
    numero: document.getElementById('numeroInput').value,
    complemento: document.getElementById('complementoInput').value,
    bairro: document.getElementById('bairroInput').value,
    localidade: document.getElementById('cidadeInput').value,
    uf: document.getElementById('ufInput').value,
    cep: document.getElementById('cepInput').value
  };
  localStorage.setItem('checkoutAddress', JSON.stringify(savedAddress));
  closeModal('addressModal');
  
  if (localStorage.getItem('returnToCheckout')) {
    localStorage.removeItem('returnToCheckout');
    window.location.href = '/checkout?token=' + Math.random().toString(36).substr(2, 12).toUpperCase();
  }
}

// ====== Q&A ======
function sendQuestion() {
  closeModal('questionModal');
  openModal('questionSuccessModal');
}

// ====== INIT ======
document.addEventListener('DOMContentLoaded', function() {
  loadProduct();
  var stored = localStorage.getItem('checkoutAddress');
  if (stored) {
    try { savedAddress = JSON.parse(stored); } catch(e) {}
  }
});
