(function(){
  const $ = id => document.getElementById(id);
  const fmtRp = n => 'Rp ' + Math.round(n).toLocaleString('id-ID');
  const fmtGram = n => n.toLocaleString('id-ID',{minimumFractionDigits:3, maximumFractionDigits:3});
  const todayISO = () => new Date().toISOString().slice(0,10);

  function parseRupiah(str){
    if(!str) return 0;
    const digits = String(str).replace(/[^0-9]/g, '');
    return digits ? parseInt(digits, 10) : 0;
  }
  function getRupiahValue(id){
    return parseRupiah($(id).value);
  }
  function setRupiahValue(id, num){
    $(id).value = num ? Math.round(num).toLocaleString('id-ID') : '';
  }
  function attachRupiahFormatting(id){
    const el = $(id);
    el.addEventListener('input', ()=>{
      const cursorFromEnd = el.value.length - el.selectionStart;
      const raw = parseRupiah(el.value);
      el.value = raw ? raw.toLocaleString('id-ID') : '';
      const newPos = Math.max(el.value.length - cursorFromEnd, 0);
      el.setSelectionRange(newPos, newPos);
    });
  }

  $('txDate').value = todayISO();
  $('certId').textContent = 'NO. REK — ' + Math.floor(1000+Math.random()*9000);

  /* ---------- Sidebar / navigation ---------- */
  const menuLabels = {dashboard:'Dashboard', riwayat:'Transaksi', harga:'Harga Emas', zakat:'Zakat & Pajak', pengaturan:'Pengaturan'};
  const sidebar = $('sidebar');
  const backdrop = $('backdrop');

  function openSidebar(){ sidebar.classList.add('open'); backdrop.classList.add('open'); }
  function closeSidebar(){ sidebar.classList.remove('open'); backdrop.classList.remove('open'); }

  $('btnHamburger').addEventListener('click', ()=>{
    sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
  });
  backdrop.addEventListener('click', closeSidebar);

  /* ---------- Add-transaction modal ---------- */
  const txModal = $('txModal');
  const txModalBackdrop = $('txModalBackdrop');
  let editingId = null;

  function openTxModal(){
    txModal.classList.add('open');
    txModalBackdrop.classList.add('open');
  }
  function closeTxModal(){
    txModal.classList.remove('open');
    txModalBackdrop.classList.remove('open');
    resetTxModalToAddMode();
  }
  function resetTxModalToAddMode(){
    editingId = null;
    $('txModalTitle').textContent = 'Tambah Transaksi';
    $('btnAdd').textContent = 'Simpan Transaksi';
  }
  function openTxModalForEdit(t){
    editingId = t.id;
    $('txModalTitle').textContent = 'Edit Transaksi';
    $('btnAdd').textContent = 'Simpan Perubahan';

    document.querySelectorAll('#segType button').forEach(b=> b.classList.toggle('active', b.dataset.val===t.type));
    txType = t.type;

    $('txDate').value = t.date;

    const brandVal = t.brand && t.brand !== 'manual' ? t.brand : 'manual';
    $('txBrandSelect').value = [...$('txBrandSelect').options].some(o=> o.value===brandVal) ? brandVal : 'manual';
    selectedTxBrand = $('txBrandSelect').value;
    updateGramFieldMode();

    if(selectedTxBrand !== 'manual'){
      const weights = [...$('gramSelect').options].map(o=> parseFloat(o.value));
      if(weights.includes(t.gram)) $('gramSelect').value = t.gram;
    } else {
      $('gramInput').value = t.gram;
    }

    setRupiahValue('hargaPerGram', t.hargaPerGram);
    showTxHargaNote('');
    showTxTotalPreview();

    const hasTax = t.taxAmount > 0;
    $('applyTax').checked = hasTax;
    $('taxOptions').style.display = hasTax ? 'block' : 'none';
    if(hasTax){
      const npwpVal = t.taxRate === 0.0025 ? 'ya' : 'tidak';
      document.querySelectorAll('#segNpwp button').forEach(b=> b.classList.toggle('active', b.dataset.val===npwpVal));
      npwp = npwpVal;
    }

    showFormMsg('');
    openTxModal();
  }
  txModalBackdrop.addEventListener('click', closeTxModal);
  $('btnCloseModal').addEventListener('click', closeTxModal);
  function resetTxFormFields(){
    document.querySelectorAll('#segType button').forEach(b=> b.classList.toggle('active', b.dataset.val==='beli'));
    txType = 'beli';
    $('txDate').value = todayISO();
    $('txBrandSelect').value = 'manual';
    selectedTxBrand = 'manual';
    updateGramFieldMode();
    $('gramInput').value = '';
    setRupiahValue('hargaPerGram', 0);
    showTxHargaNote('');
    showTxTotalPreview();
    $('applyTax').checked = false;
    $('taxOptions').style.display = 'none';
    showFormMsg('');
  }

  $('btnOpenAddModal').addEventListener('click', ()=>{
    resetTxModalToAddMode();
    resetTxFormFields();
    openTxModal();
  });

  function switchView(view){
    document.querySelectorAll('.view').forEach(v=> v.classList.toggle('active', v.dataset.view===view));
    document.querySelectorAll('.menu-item').forEach(m=> m.classList.toggle('active', m.dataset.view===view));
    $('topbarTitle').textContent = menuLabels[view] || 'Dashboard';
    closeSidebar();
    window.scrollTo(0,0);
    if(view === 'dashboard') renderCharts();
  }
  document.querySelectorAll('.menu-item').forEach(item=>{
    item.addEventListener('click', ()=> switchView(item.dataset.view));
  });

  /* ---------- Storage (safe) ---------- */
  const STORAGE_KEY = 'emasTransactions_v1';
  let storageOK = true;

  function loadState(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    }catch(e){
      storageOK = false;
      return [];
    }
  }

  let state = loadState();
  let txType = 'beli';
  let npwp = 'ya';
  let taxCalcNpwp = 'ya';

  function save(){
    try{
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }catch(e){
      storageOK = false;
    }
    render();
    syncPush();
  }

  /* ---------- Live world gold price (auto, via internet) ---------- */
  const GRAM_PER_TROY_OZ = 31.1034768;
  let liveGold = null;      // {xauUsd, usdIdr, idrPerGram, updatedAt}
  let liveFetching = false;

  function renderLiveGold(errMsg){
    const valEl = $('liveSpotIdr');
    const metaEl = $('liveSpotMeta');
    const errEl = $('liveSpotError');
    if(!valEl) return; // view not in DOM yet, ignore

    if(liveGold){
      valEl.textContent = fmtRp(liveGold.idrPerGram);
      metaEl.textContent = 'Diperbarui ' + new Date(liveGold.updatedAt).toLocaleString('id-ID',{dateStyle:'medium', timeStyle:'short'}) + ' · kurs 1 USD ≈ ' + fmtRp(liveGold.usdIdr);
    } else {
      valEl.textContent = '—';
      metaEl.textContent = liveFetching ? 'Menarik data dari internet…' : 'Belum ditarik';
    }

    if(errMsg){
      errEl.textContent = errMsg;
      errEl.style.display = 'block';
    } else {
      errEl.style.display = 'none';
    }
  }

  async function fetchLiveGold(onDone){
    if(liveFetching) return;
    liveFetching = true;
    renderLiveGold();

    let xauUsd, usdIdr;
    let goldError = null, fxError = null;

    const controller = new AbortController();
    const timeout = setTimeout(()=> controller.abort(), 10000);

    try{
      const goldRes = await fetch('https://api.gold-api.com/price/XAU', {signal: controller.signal});
      if(!goldRes.ok) throw new Error('status ' + goldRes.status);
      const goldData = await goldRes.json();
      xauUsd = goldData?.price;
      if(!xauUsd) throw new Error('format tidak dikenali');
    }catch(e){
      goldError = e;
    }

    try{
      const fxRes = await fetch('https://open.er-api.com/v6/latest/USD', {signal: controller.signal});
      if(!fxRes.ok) throw new Error('status ' + fxRes.status);
      const fxData = await fxRes.json();
      usdIdr = fxData?.rates?.IDR;
      if(!usdIdr) throw new Error('format tidak dikenali');
    }catch(e){
      fxError = e;
    }

    clearTimeout(timeout);
    liveFetching = false;

    if(xauUsd && usdIdr){
      liveGold = {
        xauUsd, usdIdr,
        idrPerGram: (xauUsd / GRAM_PER_TROY_OZ) * usdIdr,
        updatedAt: new Date().toISOString()
      };
      renderLiveGold();
    } else {
      const parts = [];
      if(goldError) parts.push('harga emas (gold-api.com)');
      if(fxError) parts.push('kurs USD→IDR (open.er-api.com)');
      let msg = 'Gagal menarik ' + parts.join(' dan ') + '. ';
      if(controller.signal.aborted){
        msg = 'Waktu tunggu habis — cek koneksi internet kamu lalu tap "Tarik Ulang". ';
      } else {
        msg += 'Kemungkinan browser/koneksi kamu memblokir permintaan ke server ini (coba buka DevTools → tab Console/Network untuk detail error), atau server sedang bermasalah. ';
      }
      msg += 'Kamu tetap bisa isi harga manual di papan di bawah.';
      renderLiveGold(msg);
    }
    if(onDone) onDone();
  }

  /* ---------- Dashboard valuation reference (brand + weight from Galeri24 board) ---------- */
  const DASHBOARD_REF_KEY = 'emasDashboardRef_v1';

  function loadDashboardRef(){
    try{
      const raw = localStorage.getItem(DASHBOARD_REF_KEY);
      if(raw) return JSON.parse(raw);
    }catch(e){}
    return { brand: 'GALERI 24', weight: 1 };
  }
  let dashboardRef = loadDashboardRef();

  /* ---------- Google Sheets sync ---------- */
  const SYNC_CONFIG_KEY = 'emasSyncConfig_v1';

  // ⚠️ GANTI DUA NILAI INI dengan Web App URL & kode rahasia dari Apps Script kamu sendiri.
  // Karena file ini di-hosting publik, siapa pun yang buka "View Page Source" bisa melihat nilai ini.
  const DEFAULT_SYNC_URL = 'https://script.google.com/macros/s/AKfycbwAxYnalS_DEkYCgayKP1vU_7KX9GPCjea1NWnXQCe9XVvmASoe9Zz8qskYWTY4xcrWQg/exec';
  const DEFAULT_SYNC_TOKEN = 'Tabungan-Emas16';

  function loadSyncConfig(){
    try{
      const raw = localStorage.getItem(SYNC_CONFIG_KEY);
      if(raw) return JSON.parse(raw);
    }catch(e){}
    const hasDefaults = DEFAULT_SYNC_URL.startsWith('http') && DEFAULT_SYNC_TOKEN && DEFAULT_SYNC_TOKEN !== 'TEMPEL_KODE_RAHASIA_KAMU_DI_SINI';
    return {
      url: hasDefaults ? DEFAULT_SYNC_URL : '',
      token: hasDefaults ? DEFAULT_SYNC_TOKEN : '',
      autoSync: true,
      lastSync: null
    };
  }
  let syncConfig = loadSyncConfig();
  let syncing = false;

  function saveSyncConfigLocal(){
    try{ localStorage.setItem(SYNC_CONFIG_KEY, JSON.stringify(syncConfig)); }catch(e){}
  }

  function showSyncStatus(msg, isError){
    const el = $('syncStatus');
    if(!el) return;
    el.textContent = msg;
    el.style.color = isError ? 'var(--rust)' : 'var(--muted)';
  }

  function isSyncConfigured(){
    return !!(syncConfig.url && syncConfig.token);
  }

  async function syncPush(){
    if(!isSyncConfigured() || !syncConfig.autoSync || syncing) return;
    try{
      const res = await fetch(syncConfig.url, {
        method:'POST',
        headers:{'Content-Type':'text/plain;charset=utf-8'},
        body: JSON.stringify({
          token: syncConfig.token,
          action: 'sync',
          transactions: state,
          preferences: { dashboardRefBrand: dashboardRef.brand, dashboardRefWeight: dashboardRef.weight }
        })
      });
      const json = await res.json();
      if(json.success){
        syncConfig.lastSync = new Date().toISOString();
        saveSyncConfigLocal();
        showSyncStatus('Tersinkron ' + new Date(syncConfig.lastSync).toLocaleString('id-ID',{dateStyle:'medium', timeStyle:'short'}));
      } else {
        showSyncStatus('Gagal sinkron: ' + (json.error || 'tidak diketahui'), true);
      }
    }catch(e){
      showSyncStatus('Gagal terhubung ke Google Sheets. Cek URL dan koneksi internet.', true);
    }
  }

  async function fetchRemoteData(){
    const url = syncConfig.url + '?token=' + encodeURIComponent(syncConfig.token);
    const res = await fetch(url);
    return await res.json();
  }

  function applyRemoteData(json){
    if(Array.isArray(json.transactions)){
      state = json.transactions.map(t=>({
        id: Number(t.id) || Date.now() + Math.random(),
        date: t.date, type: t.type, gram: Number(t.gram),
        hargaPerGram: Number(t.hargaPerGram), nominal: Number(t.nominal),
        taxRate: Number(t.taxRate) || 0, taxAmount: Number(t.taxAmount) || 0,
        brand: t.brand || 'manual'
      }));
      state.sort((a,b)=> new Date(a.date) - new Date(b.date));
      try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }catch(e){}
    }
    if(json.preferences){
      const brand = json.preferences.dashboardRefBrand;
      const weight = parseFloat(json.preferences.dashboardRefWeight);
      if(brand && weight){
        dashboardRef = { brand, weight };
        try{ localStorage.setItem(DASHBOARD_REF_KEY, JSON.stringify(dashboardRef)); }catch(e){}
      }
    }
  }

  // Dipakai untuk sinkron rutin (mis. saat aplikasi dibuka) — Google Sheets dianggap sumber kebenaran,
  // karena skenario ini biasanya berjalan SETELAH koneksi pertama sudah aman disiapkan lewat connectSync().
  async function syncPull(){
    if(!isSyncConfigured()) return false;
    syncing = true;
    showSyncStatus('Menarik data dari Google Sheets…');
    try{
      const json = await fetchRemoteData();
      if(json.success){
        applyRemoteData(json);
        syncConfig.lastSync = new Date().toISOString();
        saveSyncConfigLocal();
        showSyncStatus('Tersinkron ' + new Date(syncConfig.lastSync).toLocaleString('id-ID',{dateStyle:'medium', timeStyle:'short'}));
        syncing = false;
        return true;
      } else {
        showSyncStatus('Gagal menarik data: ' + (json.error || 'tidak diketahui'), true);
      }
    }catch(e){
      showSyncStatus('Gagal terhubung ke Google Sheets. Cek URL dan koneksi internet.', true);
    }
    syncing = false;
    return false;
  }

  // Dipakai KHUSUS saat menyambungkan koneksi (tombol Simpan & Sinkronkan Sekarang).
  // Aman untuk kondisi pertama kali: tidak akan menimpa data lokal dengan Sheets yang masih kosong.
  async function connectSync(){
    syncing = true;
    showSyncStatus('Menyambungkan…');
    try{
      const json = await fetchRemoteData();
      if(!json.success){
        showSyncStatus('Gagal terhubung: ' + (json.error || 'tidak diketahui'), true);
        syncing = false;
        return;
      }
      const remoteTxCount = Array.isArray(json.transactions) ? json.transactions.length : 0;
      const remoteHasPrefs = json.preferences && Object.keys(json.preferences).length > 0;
      const remoteHasData = remoteTxCount > 0 || remoteHasPrefs;
      const localHasData = state.length > 0;

      if(remoteHasData){
        // Google Sheets sudah berisi data (mis. dari device lain) — device ini ikut memakainya.
        applyRemoteData(json);
        render(); renderTxList();
        syncConfig.lastSync = new Date().toISOString();
        saveSyncConfigLocal();
        showSyncStatus('Terhubung. Data ditarik dari Google Sheets (' + remoteTxCount + ' transaksi).');
      } else if(localHasData){
        // Sheets masih kosong, tapi device ini sudah punya data lokal — unggah sebagai data awal.
        syncing = false;
        await syncPush();
        showSyncStatus('Terhubung. ' + state.length + ' transaksi lokal berhasil diunggah sebagai data awal ke Google Sheets.');
      } else {
        syncConfig.lastSync = new Date().toISOString();
        saveSyncConfigLocal();
        showSyncStatus('Terhubung ke Google Sheets. Belum ada data di keduanya.');
      }
    }catch(e){
      showSyncStatus('Gagal terhubung ke Google Sheets. Cek URL dan koneksi internet.', true);
    }
    syncing = false;
  }

  function populateSyncFields(){
    if($('syncUrl')) $('syncUrl').value = syncConfig.url || '';
    if($('syncToken')) $('syncToken').value = syncConfig.token || '';
    if($('syncAutoEnabled')) $('syncAutoEnabled').checked = syncConfig.autoSync !== false;
    if(syncConfig.lastSync){
      showSyncStatus('Terakhir tersinkron ' + new Date(syncConfig.lastSync).toLocaleString('id-ID',{dateStyle:'medium', timeStyle:'short'}));
    } else if(isSyncConfigured()){
      showSyncStatus('Tersimpan, belum pernah sinkron.');
    }
    const shareCard = $('cardShareConnection');
    if(shareCard) shareCard.style.display = isSyncConfigured() ? 'block' : 'none';
  }

  const btnSyncSave = $('btnSyncSave');
  if(btnSyncSave){
    btnSyncSave.addEventListener('click', async ()=>{
      syncConfig.url = $('syncUrl').value.trim();
      syncConfig.token = $('syncToken').value.trim();
      syncConfig.autoSync = $('syncAutoEnabled').checked;
      saveSyncConfigLocal();
      if(!isSyncConfigured()){
        showSyncStatus('Isi URL dan kode rahasia dulu ya.', true);
        return;
      }
      await connectSync();
      populateSyncFields();
    });
  }

  const btnGenShareLink = $('btnGenShareLink');
  if(btnGenShareLink){
    btnGenShareLink.addEventListener('click', ()=>{
      const link = location.origin + location.pathname +
        '?sync_url=' + encodeURIComponent(syncConfig.url) +
        '&sync_token=' + encodeURIComponent(syncConfig.token);
      $('shareLinkOutput').value = link;
      $('shareLinkBox').style.display = 'block';

      const qrBox = $('shareQrBox');
      qrBox.innerHTML = '';
      if(typeof QRCode !== 'undefined'){
        new QRCode(qrBox, { text: link, width: 180, height: 180, colorDark:'#14110B', colorLight:'#ffffff' });
      } else {
        qrBox.innerHTML = '<span style="color:#14110B; font-size:12px;">QR tidak tersedia (gagal memuat library). Pakai link di atas saja.</span>';
      }
    });
  }

  const btnCopyShareLink = $('btnCopyShareLink');
  if(btnCopyShareLink){
    btnCopyShareLink.addEventListener('click', async ()=>{
      const input = $('shareLinkOutput');
      try{
        await navigator.clipboard.writeText(input.value);
      }catch(e){
        input.removeAttribute('readonly');
        input.select();
        try{ document.execCommand('copy'); }catch(e2){}
        input.setAttribute('readonly', 'readonly');
      }
      const original = btnCopyShareLink.textContent;
      btnCopyShareLink.textContent = 'Tersalin!';
      setTimeout(()=>{ btnCopyShareLink.textContent = original; }, 1800);
    });
  }

  const btnSyncDisconnect = $('btnSyncDisconnect');
  if(btnSyncDisconnect){
    btnSyncDisconnect.addEventListener('click', ()=>{
      syncConfig = { url:'', token:'', autoSync:true, lastSync:null };
      saveSyncConfigLocal();
      populateSyncFields();
      showSyncStatus('Sinkronisasi diputuskan. Data lokal tetap aman.');
    });
  }

  function setDashboardRef(brand, weight){
    dashboardRef = { brand, weight };
    try{ localStorage.setItem(DASHBOARD_REF_KEY, JSON.stringify(dashboardRef)); }catch(e){}
    syncPush();
  }

  function getReferenceGaleriPrice(){
    if(!galeriLive || !galeriLive.brands) return null;

    const tryBrand = (brandName, weight)=>{
      const data = galeriLive.brands[brandName];
      if(!data) return null;
      const row = data.find(r=> r.weight === weight && r.buyback > 0);
      return row ? row : null;
    };

    let row = tryBrand(dashboardRef.brand, dashboardRef.weight);
    let brandUsed = dashboardRef.brand, weightUsed = dashboardRef.weight;

    // fallback: same brand, any weight with buyback available
    if(!row && galeriLive.brands[dashboardRef.brand]){
      const withStock = galeriLive.brands[dashboardRef.brand].filter(r=> r.buyback>0);
      if(withStock.length){ row = withStock[0]; weightUsed = row.weight; }
    }
    // fallback: default GALERI 24 @1g
    if(!row){
      row = tryBrand('GALERI 24', 1);
      if(row){ brandUsed = 'GALERI 24'; weightUsed = 1; }
    }
    // fallback: any brand/weight with buyback available at all
    if(!row){
      for(const [name, data] of Object.entries(galeriLive.brands)){
        const withStock = data.filter(r=> r.buyback>0);
        if(withStock.length){ row = withStock[0]; brandUsed = name; weightUsed = row.weight; break; }
      }
    }
    if(!row) return null;
    return {
      perGram: row.buyback / weightUsed,
      brand: brandUsed,
      weight: weightUsed,
      recordedDate: galeriLive.recordedDate
    };
  }

  /* ---------- Galeri24 live price board (per denomination) ---------- */
  const GALERI_CACHE_KEY = 'emasGaleriLive_v2';
  const GALERI_BRAND_ORDER = ['GALERI 24','ANTAM','UBS','ANTAM MULIA RETRO','ANTAM NON PEGADAIAN','LOTUS ARCHI','DINAR G24'];

  function loadGaleriCache(){
    try{
      const raw = localStorage.getItem(GALERI_CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    }catch(e){ return null; }
  }
  function saveGaleriCache(){
    try{ localStorage.setItem(GALERI_CACHE_KEY, JSON.stringify(galeriLive)); }catch(e){}
  }

  let galeriLive = loadGaleriCache();
  let galeriFetching = false;
  let selectedGaleriBrand = null;

  function sortBrandNames(names){
    return names.sort((a,b)=>{
      const ia = GALERI_BRAND_ORDER.indexOf(a);
      const ib = GALERI_BRAND_ORDER.indexOf(b);
      if(ia===-1 && ib===-1) return a.localeCompare(b);
      if(ia===-1) return 1;
      if(ib===-1) return -1;
      return ia-ib;
    });
  }

  function populateGaleriBrandSelect(){
    const sel = $('galeriBrandSelect');
    if(!galeriLive || !galeriLive.brands){ sel.innerHTML = '<option>—</option>'; return; }
    const names = sortBrandNames(Object.keys(galeriLive.brands));
    if(!selectedGaleriBrand || !names.includes(selectedGaleriBrand)){
      selectedGaleriBrand = names[0];
    }
    sel.innerHTML = names.map(n=> `<option value="${n}" ${n===selectedGaleriBrand?'selected':''}>${n}</option>`).join('');
  }

  function renderGaleriTable(){
    const box = $('galeriTable');
    const metaEl = $('galeriMeta');

    if(!galeriLive || !galeriLive.brands){
      box.innerHTML = '<div class="empty">Menunggu data live pertama…</div>';
      metaEl.textContent = galeriFetching ? 'Menarik data dari internet…' : 'Belum ditarik';
      return;
    }

    metaEl.textContent = 'Data per ' + galeriLive.recordedDate + ' · ditarik ' +
      new Date(galeriLive.fetchedAt).toLocaleString('id-ID',{dateStyle:'medium', timeStyle:'short'});

    const rows = (galeriLive.brands[selectedGaleriBrand] || []).filter(r=> r.sell>0 || r.buyback>0);
    if(rows.length===0){
      box.innerHTML = '<div class="empty">Tidak ada data denominasi untuk merek ini saat ini.</div>';
      return;
    }

    box.innerHTML = rows.map(r=>{
      const canUse = r.buyback>0;
      const isActive = dashboardRef.brand === selectedGaleriBrand && dashboardRef.weight === r.weight;
      return `
        <div class="denom-row">
          <div class="denom-weight">${r.weight} g</div>
          <div class="denom-prices">
            ${r.sell>0 ? `<div class="denom-jual">${fmtRp(r.sell)}</div>` : `<div class="denom-out">Stok kosong</div>`}
            ${r.buyback>0 ? `<div class="denom-buyback">Buyback ${fmtRp(r.buyback)}</div>` : ''}
          </div>
          ${canUse ? `<button class="denom-use" data-weight="${r.weight}">${isActive ? '✓ Acuan Cadangan' : 'Jadikan Acuan Cadangan'}</button>` : ''}
        </div>
      `;
    }).join('');

    box.querySelectorAll('.denom-use').forEach(useBtn=>{
      useBtn.addEventListener('click', ()=>{
        const w = parseFloat(useBtn.dataset.weight);
        const row = (galeriLive.brands[selectedGaleriBrand] || []).find(r=> r.weight === w);
        if(!row || !row.buyback) return;
        setDashboardRef(selectedGaleriBrand, w);
        renderGaleriTable();
        render();
        switchView('dashboard');
      });
    });
  }

  const GALERI_TARGET_URL = 'https://logam-mulia-api.iamutaki.workers.dev/api/prices/galeri24';
  const CORS_PROXIES = [
    (url)=> 'https://api.allorigins.win/raw?url=' + encodeURIComponent(url),
    (url)=> 'https://api.codetabs.com/v1/proxy/?quest=' + encodeURIComponent(url)
  ];

  async function fetchJsonViaProxies(targetUrl, signal){
    let lastErr;
    for(const buildUrl of CORS_PROXIES){
      try{
        const res = await fetch(buildUrl(targetUrl), {signal});
        if(!res.ok) throw new Error('status ' + res.status);
        return await res.json();
      }catch(e){
        lastErr = e;
      }
    }
    throw lastErr || new Error('Semua proxy gagal');
  }

  async function fetchGaleriLive(){
    if(galeriFetching) return;
    galeriFetching = true;
    renderGaleriTable();

    const errEl = $('galeriError');
    try{
      const controller = new AbortController();
      const timeout = setTimeout(()=> controller.abort(), 15000);
      const json = await fetchJsonViaProxies(GALERI_TARGET_URL, controller.signal);
      clearTimeout(timeout);
      if(!json.success || !Array.isArray(json.data)) throw new Error('format tidak dikenali');

      const brands = {};
      let recordedDate = '';
      json.data.forEach(item=>{
        const name = item.materialType;
        if(!brands[name]) brands[name] = [];
        brands[name].push({weight: item.weight, sell: item.sellPrice, buyback: item.buybackPrice});
        recordedDate = item.recordedDate || recordedDate;
      });
      Object.keys(brands).forEach(k=> brands[k].sort((a,b)=> a.weight-b.weight));

      galeriLive = {brands, recordedDate, fetchedAt: new Date().toISOString()};
      saveGaleriCache();
      errEl.style.display = 'none';
    }catch(e){
      const msg = e.name === 'AbortError'
        ? 'Waktu tunggu habis — cek koneksi internet, lalu tap "Tarik Ulang" lagi.'
        : 'Server sumber data atau proxy-nya sedang sibuk/dibatasi. ' + (galeriLive ? 'Menampilkan data tersimpan terakhir — coba "Tarik Ulang" beberapa saat lagi.' : 'Coba lagi dalam beberapa menit, atau isi manual di kartu bawah.');
      errEl.textContent = msg;
      errEl.style.display = 'block';
    }

    galeriFetching = false;
    populateGaleriBrandSelect();
    populateTxBrandSelect();
    renderGaleriTable();
    render();
  }

  $('galeriBrandSelect').addEventListener('change', (e)=>{
    selectedGaleriBrand = e.target.value;
    renderGaleriTable();
  });

  function seg(id, onChange){
    const el = $(id);
    el.querySelectorAll('button').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        el.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        onChange(btn.dataset.val);
      });
    });
  }
  seg('segType', v=>{ txType = v; updateTxHargaFromBrand(); });
  seg('segNpwp', v=> npwp = v);
  seg('segTaxCalc', v=>{ taxCalcNpwp = v; renderTaxCalc(); });
  seg('segZakatPajakTab', v=>{
    $('tabZakat').style.display = v==='zakat' ? 'block' : 'none';
    $('tabPajak').style.display = v==='pajak' ? 'block' : 'none';
  });

  $('applyTax').addEventListener('change', e=>{
    $('taxOptions').style.display = e.target.checked ? 'block':'none';
  });

  /* ---------- Auto-fill harga/gram in modal from brand + date ---------- */
  let selectedTxBrand = 'manual';
  const txHistoryCache = {};

  function populateTxBrandSelect(){
    const sel = $('txBrandSelect');
    const current = sel.value || 'manual';
    let options = '<option value="manual">Manual (isi sendiri)</option>';
    if(galeriLive && galeriLive.brands){
      const names = sortBrandNames(Object.keys(galeriLive.brands));
      options += names.map(n=> `<option value="${n}">${n}</option>`).join('');
    }
    sel.innerHTML = options;
    sel.value = [...sel.options].some(o=> o.value===current) ? current : 'manual';
    selectedTxBrand = sel.value;
    updateGramFieldMode();
  }

  function updateGramFieldMode(){
    const gramInput = $('gramInput');
    const gramSelect = $('gramSelect');
    const label = $('gramLabel');

    if(selectedTxBrand === 'manual'){
      gramInput.style.display = 'block';
      gramSelect.style.display = 'none';
      label.textContent = 'Jumlah (gram)';
      return;
    }

    label.textContent = 'Denominasi (gram)';
    gramInput.style.display = 'none';
    gramSelect.style.display = 'block';

    const brandData = galeriLive.brands[selectedTxBrand] || [];
    const weights = [...new Set(brandData.map(r=> r.weight))].sort((a,b)=> a-b);
    const currentVal = parseFloat(gramSelect.value);
    gramSelect.innerHTML = weights.map(w=> `<option value="${w}">${w} g</option>`).join('');
    if(weights.includes(currentVal)) gramSelect.value = currentVal;
    else {
      const withStock = brandData.filter(r=> r.sell>0).map(r=> r.weight);
      gramSelect.value = withStock.includes(1) ? 1 : (withStock[0] ?? weights[0]);
    }
  }

  function pickReferenceWeight(brandData, preferredWeight){
    const withStock = brandData.filter(r=> r.sell>0);
    if(preferredWeight && withStock.some(r=> r.weight===preferredWeight)) return preferredWeight;
    const one = withStock.find(r=> r.weight===1);
    if(one) return 1;
    if(withStock.length) return withStock[0].weight;
    return brandData.length ? brandData[0].weight : 1;
  }

  function showTxHargaNote(msg){
    const el = $('txHargaNote');
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
  }

  function showTxTotalPreview(){
    const el = $('txTotalPreview');
    const gram = getCurrentGram();
    const harga = getRupiahValue('hargaPerGram');
    if(gram && harga){
      el.textContent = 'Estimasi total: ' + fmtRp(gram * harga);
      el.style.display = 'block';
    } else {
      el.style.display = 'none';
    }
  }

  async function updateTxHargaFromBrand(){
    if(selectedTxBrand === 'manual' || !galeriLive || !galeriLive.brands){
      showTxHargaNote('');
      showTxTotalPreview();
      return;
    }
    const brandData = galeriLive.brands[selectedTxBrand] || [];
    if(brandData.length === 0){ showTxHargaNote(''); return; }

    const date = $('txDate').value || todayISO();
    const refWeight = parseFloat($('gramSelect').value) || pickReferenceWeight(brandData, null);
    const priceField = txType === 'jual' ? 'buyback' : 'sell';
    const priceFieldHistory = txType === 'jual' ? 'buybackPrice' : 'sellPrice';
    const priceLabel = txType === 'jual' ? 'buyback' : 'jual';

    showTxHargaNote('Mengambil harga ' + selectedTxBrand + '…');

    let price = null, recordedDateUsed = null;

    if(date === todayISO()){
      const row = brandData.find(r=> r.weight === refWeight);
      if(row && row[priceField] > 0){ price = row[priceField]; recordedDateUsed = galeriLive.recordedDate; }
    }

    if(!price){
      const cacheKey = selectedTxBrand + '|' + refWeight;
      try{
        let history = txHistoryCache[cacheKey];
        if(!history){
          const target = 'https://logam-mulia-api.iamutaki.workers.dev/api/prices/galeri24/history?materialType=' +
            encodeURIComponent(selectedTxBrand) + '&weight=' + refWeight + '&length=1000';
          const json = await fetchJsonViaProxies(target);
          history = (json.success && Array.isArray(json.data)) ? json.data : [];
          txHistoryCache[cacheKey] = history;
        }
        const sorted = history.filter(r=> r[priceFieldHistory] > 0)
          .slice()
          .sort((a,b)=> new Date(b.recordedDate) - new Date(a.recordedDate));
        let match = sorted.find(r=> r.recordedDate === date);
        if(!match) match = sorted.find(r=> new Date(r.recordedDate) <= new Date(date));
        if(match){ price = match[priceFieldHistory]; recordedDateUsed = match.recordedDate; }
      }catch(e){ /* fall through to "no data" message below */ }
    }

    if(price){
      const perGram = Math.round(price / refWeight);
      setRupiahValue('hargaPerGram', perGram);
      const dateNote = (recordedDateUsed && recordedDateUsed !== date)
        ? ' · data tanggal tepat tidak tersedia, pakai data terdekat ' + recordedDateUsed
        : '';
      showTxHargaNote('Harga ' + priceLabel + ' otomatis dari ' + selectedTxBrand + ' (' + refWeight + ' g)' + dateNote + '. Masih bisa diubah manual.');
    } else {
      showTxHargaNote('Tidak ada data harga ' + priceLabel + ' ' + selectedTxBrand + ' untuk tanggal ini — isi manual.');
    }
    showTxTotalPreview();
  }

  $('txBrandSelect').addEventListener('change', (e)=>{
    selectedTxBrand = e.target.value;
    updateGramFieldMode();
    updateTxHargaFromBrand();
  });
  $('txDate').addEventListener('change', updateTxHargaFromBrand);
  $('gramSelect').addEventListener('change', updateTxHargaFromBrand);
  $('gramInput').addEventListener('input', showTxTotalPreview);
  $('hargaPerGram').addEventListener('input', showTxTotalPreview);

  function showFormMsg(msg){
    const el = $('formMsg');
    el.textContent = msg;
    el.style.display = msg ? 'block' : 'none';
  }

  function getCurrentGram(){
    if(selectedTxBrand !== 'manual') return parseFloat($('gramSelect').value);
    return parseFloat($('gramInput').value);
  }

  $('btnAdd').addEventListener('click', ()=>{
    showFormMsg('');
    const date = $('txDate').value || todayISO();

    const gram = getCurrentGram();
    const hargaPerGram = getRupiahValue('hargaPerGram');
    if(!gram || !hargaPerGram){ showFormMsg('Pilih/isi jumlah gram dan harga per gram dulu ya.'); return; }
    const nominal = gram * hargaPerGram;

    let taxAmount = 0, taxRate = 0;
    if($('applyTax').checked && txType==='beli'){
      taxRate = npwp==='ya' ? 0.0025 : 0.0045;
      taxAmount = nominal * taxRate;
    }

    if(editingId){
      const idx = state.findIndex(t=> t.id === editingId);
      if(idx !== -1){
        state[idx] = {
          ...state[idx],
          date, type: txType, gram, hargaPerGram, nominal,
          taxRate, taxAmount, brand: selectedTxBrand
        };
      }
    } else {
      state.push({
        id: Date.now(),
        date, type: txType, gram, hargaPerGram, nominal,
        taxRate, taxAmount, brand: selectedTxBrand
      });
    }
    state.sort((a,b)=> new Date(a.date) - new Date(b.date));
    save();

    closeTxModal();
    switchView('riwayat');
  });

  let resetArmed = false;
  const btnReset = $('btnReset');
  btnReset.addEventListener('click', ()=>{
    if(!resetArmed){
      resetArmed = true;
      btnReset.textContent = 'Yakin? Tap sekali lagi untuk hapus';
      btnReset.style.color = 'var(--rust)';
      btnReset.style.borderColor = 'var(--rust)';
      setTimeout(()=>{
        resetArmed = false;
        btnReset.textContent = 'Hapus Semua Data';
        btnReset.style.color = '';
        btnReset.style.borderColor = '';
      }, 3000);
      return;
    }
    resetArmed = false;
    btnReset.textContent = 'Hapus Semua Data';
    btnReset.style.color = '';
    btnReset.style.borderColor = '';
    state = [];
    save();
  });

  function computeTotals(){
    let totalGram=0, totalModal=0, totalNilaiSekarang=0;
    state.forEach(t=>{
      const price = getBrandCurrentPricePerGram(t.brand);
      if(t.type==='beli'){
        totalGram += t.gram;
        totalModal += t.nominal + t.taxAmount;
        totalNilaiSekarang += t.gram * price;
      } else {
        totalGram -= t.gram;
        totalModal -= t.nominal;
        totalNilaiSekarang -= t.gram * price;
      }
    });
    return {
      totalGram: Math.max(totalGram,0),
      totalModal: Math.max(totalModal,0),
      totalNilaiSekarang: Math.max(totalNilaiSekarang,0)
    };
  }

  function renderTaxCalc(){
    const nominal = getRupiahValue('taxCalcNominal');
    const rate = taxCalcNpwp==='ya' ? 0.0025 : 0.0045;
    $('taxCalcResult').textContent = fmtRp(nominal * rate);
  }
  $('taxCalcNominal').addEventListener('input', renderTaxCalc);

  function render(){
    const {totalGram, totalModal, totalNilaiSekarang} = computeTotals();
    const nilaiSekarang = totalNilaiSekarang;
    const untungRugi = nilaiSekarang - totalModal;
    const persen = totalModal>0 ? (untungRugi/totalModal*100) : 0;

    $('totalGram').innerHTML = fmtGram(totalGram) + ' <span>gram</span>';
    $('totalModal').textContent = fmtRp(totalModal);
    $('totalNilai').textContent = fmtRp(nilaiSekarang);
    $('nilaiSekarangSource').textContent = state.length > 0
      ? 'Harga buyback live per merek masing-masing transaksi'
      : 'Menunggu data live… buka menu Harga Emas';
    const urEl = $('untungRugi'); const pEl = $('persenUR');
    urEl.textContent = (untungRugi>=0?'+':'') + fmtRp(untungRugi);
    pEl.textContent = (persen>=0?'+':'') + persen.toFixed(2) + '%';
    [urEl,pEl].forEach(el=>{
      el.classList.remove('pos','neg');
      el.classList.add(untungRugi>=0 ? 'pos':'neg');
    });

    // Zakat
    const nisabGram = 85;
    const pct = Math.min(totalGram/nisabGram*100, 100);
    $('nisabFill').style.width = pct+'%';
    $('nisabCurrent').textContent = fmtGram(totalGram)+' g';

    const statusEl = $('zakatStatus'); const textEl = $('zakatText');
    const isPerhiasan = $('perhiasanDipakai').checked;

    if(state.length===0){
      statusEl.className='zakat-status wait';
      textEl.innerHTML = 'Belum ada data transaksi.';
    } else {
      const firstDate = new Date(state.find(t=>t.type==='beli')?.date || state[0].date);
      const days = Math.floor((new Date() - firstDate) / 86400000);
      const haulDone = days >= 354;

      if(isPerhiasan){
        statusEl.className='zakat-status wait';
        textEl.innerHTML = 'Ditandai sebagai perhiasan yang dipakai. Sebagian ulama tidak mewajibkan zakat untuk perhiasan yang dipakai wajar sehari-hari — namun ini termasuk masalah khilafiyah. Disarankan konsultasi ke ustadz/lembaga amil zakat terpercaya.';
      } else if(totalGram >= nisabGram && haulDone){
        const zakatAmount = nilaiSekarang * 0.025;
        statusEl.className='zakat-status due';
        textEl.innerHTML = 'Sudah mencapai nisab &amp; haul (' + days + ' hari sejak simpanan pertama). Estimasi zakat wajib (2,5%):<div class="zakat-amount">' + fmtRp(zakatAmount) + '</div>';
      } else if(totalGram >= nisabGram){
        statusEl.className='zakat-status wait';
        textEl.innerHTML = 'Sudah mencapai nisab (85 gram), tapi haul (1 tahun kepemilikan) belum genap. Baru ' + days + ' dari ~354 hari.';
      } else {
        statusEl.className='zakat-status wait';
        textEl.innerHTML = 'Belum mencapai nisab 85 gram. Kurang ' + fmtGram(nisabGram-totalGram) + ' gram lagi.';
      }
    }

    // History (tab Beli/Jual + filter merek, dengan ringkasan modal & nilai sekarang)
    renderTxList();
    renderCharts();
  }

  /* ---------- Dashboard charts (Chart.js) ---------- */
  let growthChartInstance = null;
  let brandChartInstance = null;
  const CHART_PALETTE = ['#C9A227','#7A9B7E','#C06B4D','#8B98C4','#E8C468','#B08D57','#4E7B8C','#B27B8E'];

  function renderCharts(){
    if(typeof Chart === 'undefined') return; // CDN gagal dimuat (mis. offline) — biarkan dashboard tetap jalan tanpa chart

    // --- Pertumbuhan Modal (line chart) ---
    const growthCanvas = $('chartGrowth');
    const growthEmpty = $('growthChartEmpty');
    if(growthCanvas){
      const sorted = [...state].sort((a,b)=> new Date(a.date) - new Date(b.date));
      if(sorted.length === 0){
        if(growthChartInstance){ growthChartInstance.destroy(); growthChartInstance = null; }
        growthCanvas.style.display = 'none';
        growthEmpty.style.display = 'block';
      } else {
        growthCanvas.style.display = 'block';
        growthEmpty.style.display = 'none';
        let cumModal = 0;
        const labels = [], modalData = [];
        sorted.forEach(t=>{
          cumModal += t.type==='beli' ? (t.nominal + (t.taxAmount||0)) : -t.nominal;
          labels.push(new Date(t.date).toLocaleDateString('id-ID',{day:'2-digit',month:'short'}));
          modalData.push(Math.round(cumModal));
        });

        if(growthChartInstance) growthChartInstance.destroy();
        growthChartInstance = new Chart(growthCanvas, {
          type:'line',
          data:{
            labels,
            datasets:[{
              label:'Modal Ditanam',
              data: modalData,
              borderColor:'#C9A227',
              backgroundColor:'rgba(201,162,39,0.15)',
              fill:true, tension:0.35, borderWidth:2,
              pointRadius:3, pointBackgroundColor:'#E8C468', pointBorderColor:'#14110B'
            }]
          },
          options:{
            responsive:true, maintainAspectRatio:false,
            plugins:{
              legend:{display:false},
              tooltip:{
                backgroundColor:'#1D1810', titleColor:'#EFE7D6', bodyColor:'#E8C468',
                borderColor:'#3A3120', borderWidth:1, padding:10, displayColors:false,
                callbacks:{ label: (ctx)=> fmtRp(ctx.parsed.y) }
              }
            },
            scales:{
              x:{ ticks:{color:'#A89B7E', font:{family:'IBM Plex Mono', size:10}}, grid:{color:'#2A2417'} },
              y:{
                ticks:{
                  color:'#A89B7E', font:{family:'IBM Plex Mono', size:10},
                  callback:(v)=> (v/1000000).toLocaleString('id-ID',{maximumFractionDigits:1}) + 'jt'
                },
                grid:{color:'#2A2417'}
              }
            }
          }
        });
      }
    }

    // --- Distribusi Merek (donut chart) ---
    const brandCanvas = $('chartBrand');
    const brandEmpty = $('brandChartEmpty');
    const legendEl = $('brandLegend');
    if(brandCanvas){
      const map = {};
      state.forEach(t=>{
        const b = (t.brand && t.brand !== 'manual') ? t.brand : 'Manual';
        map[b] = (map[b] || 0) + (t.type==='beli' ? t.gram : -t.gram);
      });
      const entries = Object.entries(map).filter(([,v])=> v > 0.0005);

      if(entries.length === 0){
        if(brandChartInstance){ brandChartInstance.destroy(); brandChartInstance = null; }
        brandCanvas.style.display = 'none';
        brandEmpty.style.display = 'block';
        legendEl.innerHTML = '';
      } else {
        brandCanvas.style.display = 'block';
        brandEmpty.style.display = 'none';

        if(brandChartInstance) brandChartInstance.destroy();
        brandChartInstance = new Chart(brandCanvas, {
          type:'doughnut',
          data:{
            labels: entries.map(e=> e[0]),
            datasets:[{
              data: entries.map(e=> +e[1].toFixed(4)),
              backgroundColor: entries.map((_,i)=> CHART_PALETTE[i % CHART_PALETTE.length]),
              borderColor:'#14110B', borderWidth:2
            }]
          },
          options:{
            responsive:true, maintainAspectRatio:false, cutout:'68%',
            plugins:{
              legend:{display:false},
              tooltip:{
                backgroundColor:'#1D1810', titleColor:'#EFE7D6', bodyColor:'#E8C468',
                borderColor:'#3A3120', borderWidth:1, padding:10, displayColors:false,
                callbacks:{
                  label: (ctx)=>{
                    const gram = ctx.parsed;
                    const brandKey = ctx.label === 'Manual' ? 'manual' : ctx.label;
                    const nilai = gram * getBrandCurrentPricePerGram(brandKey);
                    return [ctx.label + ': ' + fmtGram(gram) + ' g', 'Nilai sekarang: ' + fmtRp(nilai)];
                  }
                }
              }
            }
          }
        });

        legendEl.innerHTML = entries.map((e,i)=> `
          <div class="chart-legend-item">
            <span class="chart-legend-dot" style="background:${CHART_PALETTE[i % CHART_PALETTE.length]}"></span>
            ${e[0]} · ${fmtGram(e[1])} g
          </div>
        `).join('');
      }
    }
  }

  let txTabFilter = 'beli';
  let txBrandFilterVal = 'semua';

  function getFilteredTx(){
    return state.filter(t=> t.type === txTabFilter && (txBrandFilterVal === 'semua' || (t.brand || 'manual') === txBrandFilterVal));
  }

  function populateTxBrandFilter(){
    const sel = $('txBrandFilter');
    const current = sel.value || 'semua';
    const brandsInTab = [...new Set(state.filter(t=> t.type===txTabFilter).map(t=> t.brand || 'manual'))];
    const namedBrands = sortBrandNames(brandsInTab.filter(b=> b!=='manual'));
    let options = '<option value="semua">Semua Merek</option>';
    if(brandsInTab.includes('manual')) options += '<option value="manual">Manual</option>';
    options += namedBrands.map(b=> `<option value="${b}">${b}</option>`).join('');
    sel.innerHTML = options;
    sel.value = [...sel.options].some(o=> o.value===current) ? current : 'semua';
    txBrandFilterVal = sel.value;
  }

  function getBrandCurrentPricePerGram(brand){
    if(brand && brand !== 'manual' && galeriLive && galeriLive.brands && galeriLive.brands[brand]){
      const withStock = galeriLive.brands[brand].filter(r=> r.buyback>0);
      if(withStock.length){
        const row = withStock.find(r=> r.weight===1) || withStock[0];
        return row.buyback / row.weight;
      }
    }
    const ref = getReferenceGaleriPrice();
    return ref ? ref.perGram : 0;
  }

  function renderTxList(){
    populateTxBrandFilter();
    const filtered = getFilteredTx();

    let totalGram = 0, totalNominal = 0, totalNilai = 0;
    filtered.forEach(t=>{
      totalGram += t.gram;
      totalNominal += t.nominal + (t.taxAmount || 0);
      totalNilai += t.gram * getBrandCurrentPricePerGram(t.brand);
    });

    $('txSummaryLabel1').textContent = txTabFilter === 'beli' ? 'Modal Ditanam' : 'Total Diterima';
    $('txSummaryModal').textContent = fmtRp(totalNominal);
    $('txSummaryNilai').textContent = fmtRp(totalNilai);
    $('txSummarySource').textContent = totalGram > 0
      ? 'Estimasi dari ' + fmtGram(totalGram) + ' g, harga live per merek'
      : '';

    const listEl = $('txList');
    if(filtered.length === 0){
      listEl.innerHTML = '<div class="empty">Belum ada transaksi ' + (txTabFilter==='beli' ? 'beli' : 'jual') + ' untuk filter ini.</div>';
      return;
    }

    listEl.innerHTML = [...filtered].reverse().map(t=>{
      const brandLabel = (t.brand && t.brand !== 'manual') ? t.brand : 'Manual';
      return `
        <div class="tx">
          <div class="tx-left">
            <span class="tx-type ${t.type}">${t.type==='beli'?'Beli':'Jual'} · ${brandLabel}</span>
            <span class="tx-date">${new Date(t.date).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'})} · ${fmtRp(t.nominal)}${t.taxAmount>0?' · pajak '+fmtRp(t.taxAmount):''}</span>
          </div>
          <div class="tx-right">
            <span class="tx-gram">${fmtGram(t.gram)} g</span>
            <button class="tx-edit" data-id="${t.id}" aria-label="Edit transaksi">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            </button>
            <button class="tx-del" data-id="${t.id}" aria-label="Hapus transaksi">
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 3a1 1 0 00-1 1v1H4.5a1 1 0 000 2H5l1.1 12.1A2 2 0 008.09 21h7.82a2 2 0 002-1.9L19 7h.5a1 1 0 000-2H16V4a1 1 0 00-1-1H9zm1 2h4v1h-4V5zM9.5 10a1 1 0 012 0v7a1 1 0 01-2 0v-7zm5 0a1 1 0 012 0v7a1 1 0 01-2 0v-7z"/></svg>
            </button>
          </div>
        </div>
      `;
    }).join('');

    listEl.querySelectorAll('.tx-del').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        state = state.filter(t=> t.id !== parseInt(btn.dataset.id));
        save();
      });
    });
    listEl.querySelectorAll('.tx-edit').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const t = state.find(x=> x.id === parseInt(btn.dataset.id));
        if(t) openTxModalForEdit(t);
      });
    });
  }

  seg('segTxTab', v=>{ txTabFilter = v; renderTxList(); });
  $('txBrandFilter').addEventListener('change', (e)=>{
    txBrandFilterVal = e.target.value;
    renderTxList();
  });

  $('perhiasanDipakai').addEventListener('change', render);

  attachRupiahFormatting('hargaPerGram');
  attachRupiahFormatting('taxCalcNominal');

  render();
  renderTaxCalc();
  renderLiveGold();
  fetchLiveGold();
  populateGaleriBrandSelect();
  populateTxBrandSelect();
  renderGaleriTable();
  fetchGaleriLive();

  // Info icon toggles (deskripsi kartu Harga Emas Dunia & Papan Harga Galeri 24)
  function bindInfoToggle(btnId, panelId){
    const btn = $(btnId), panel = $(panelId);
    if(!btn || !panel) return;
    btn.addEventListener('click', ()=>{
      const showing = panel.style.display !== 'none';
      panel.style.display = showing ? 'none' : 'block';
      btn.classList.toggle('active', !showing);
    });
  }
  bindInfoToggle('btnInfoLiveSpot', 'infoLiveSpot');
  bindInfoToggle('btnInfoGaleri', 'infoGaleri');

  // Auto-refresh harga live setiap 10 menit (tanpa perlu tombol manual)
  const AUTO_REFRESH_MS = 10 * 60 * 1000;
  setInterval(()=>{ fetchLiveGold(); fetchGaleriLive(); }, AUTO_REFRESH_MS);

  // Deteksi link setup dari device lain (?sync_url=...&sync_token=...)
  (function applyShareLinkParamsIfAny(){
    const params = new URLSearchParams(location.search);
    const linkUrl = params.get('sync_url');
    const linkToken = params.get('sync_token');
    if(linkUrl && linkToken){
      syncConfig.url = linkUrl;
      syncConfig.token = linkToken;
      syncConfig.autoSync = true;
      saveSyncConfigLocal();
      history.replaceState(null, '', location.pathname); // buang query string dari address bar
    }
  })();

  populateSyncFields();
  if(isSyncConfigured()){
    connectSync().then(()=>{ populateSyncFields(); });
  }

  if(!storageOK){
    $('storageWarning').style.display = 'block';
  }

  try{
    if(window.navigator.standalone){ $('installTip').style.display='none'; }
  }catch(e){}
})();
