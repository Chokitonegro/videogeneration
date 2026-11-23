/* ═══════════════════════════════════════════════════════════
   VideoLab AI — script.js
   Full application logic: video generation, history, settings
   ═══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ────────── CONSTANTS ──────────
  const STORAGE_KEYS = {
    history:   'videolab_history',
    apiKey:    'videolab_api_key',
    provider:  'videolab_provider',
    backendUrl:'videolab_backend_url',
  };

  const STYLE_LABELS = {
    realistic:    'Realista',
    cinematic:    'Cinematográfico',
    animation:    'Animação',
    '3d':         '3D',
    futuristic:   'Futurista',
  };

  const GEMINI_VEO_MODEL = 'veo-2.0-generate-001';

  // ────────── STATE ──────────
  let selectedFormat = '16:9';
  let isGenerating   = false;
  let currentVideoUrl = null;
  let currentVideoBlob = null;

  // ────────── DOM REFS ──────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const dom = {
    header:       $('#header'),
    nav:          $('#mainNav'),
    hamburger:    $('#hamburger'),

    prompt:       $('#prompt'),
    charCount:    $('#charCount'),
    style:        $('#style'),
    duration:     $('#duration'),
    quality:      $('#quality'),
    formatBtns:   $$('.format-btn'),

    generateBtn:  $('#generateBtn'),
    btnText:      $('.btn__text'),
    btnLoader:    $('.btn__loader'),

    modeBanner:   $('#modeBanner'),

    resultEmpty:   $('#resultEmpty'),
    resultLoading: $('#resultLoading'),
    resultSuccess: $('#resultSuccess'),
    resultError:   $('#resultError'),
    loadingMsg:    $('#loadingMessage'),
    progressFill:  $('#progressFill'),
    progressText:  $('#progressText'),
    videoElement:  $('#videoElement'),
    resultMeta:    $('#resultMeta'),
    errorMessage:  $('#errorMessage'),

    downloadBtn:   $('#downloadBtn'),
    newVideoBtn:   $('#newVideoBtn'),
    retryBtn:      $('#retryBtn'),

    historyGrid:     $('#historyGrid'),
    historyEmpty:    $('#historyEmpty'),
    clearHistoryBtn: $('#clearHistoryBtn'),

    apiKey:          $('#apiKey'),
    apiProvider:     $('#apiProvider'),
    backendUrl:      $('#backendUrl'),
    toggleApiKey:    $('#toggleApiKey'),
    saveSettingsBtn: $('#saveSettingsBtn'),
    testConnBtn:     $('#testConnectionBtn'),

    confirmModal:  $('#confirmModal'),
    modalTitle:    $('#modalTitle'),
    modalMessage:  $('#modalMessage'),
    modalCancel:   $('#modalCancel'),
    modalConfirm:  $('#modalConfirm'),

    toastContainer: $('#toastContainer'),
  };


  // ════════════════════════════════════════════════════════
  //  INITIALIZATION
  // ════════════════════════════════════════════════════════
  function init() {
    loadSettings();
    renderHistory();
    updateModeBanner();
    bindEvents();
    updateActiveNav();
  }


  // ════════════════════════════════════════════════════════
  //  EVENTS
  // ════════════════════════════════════════════════════════
  function bindEvents() {
    // Header scroll
    window.addEventListener('scroll', onScroll, { passive: true });

    // Hamburger
    dom.hamburger.addEventListener('click', toggleMobileNav);

    // Nav links
    dom.nav.querySelectorAll('.nav__link').forEach(link => {
      link.addEventListener('click', (e) => {
        closeMobileNav();
      });
    });

    // Scroll spy
    window.addEventListener('scroll', updateActiveNav, { passive: true });

    // Char counter
    dom.prompt.addEventListener('input', () => {
      dom.charCount.textContent = dom.prompt.value.length;
    });

    // Format buttons
    dom.formatBtns.forEach(btn => {
      btn.addEventListener('click', () => selectFormat(btn));
    });

    // Generate
    dom.generateBtn.addEventListener('click', handleGenerate);

    // Result buttons
    dom.downloadBtn.addEventListener('click', handleDownload);
    dom.newVideoBtn.addEventListener('click', resetGenerator);
    dom.retryBtn.addEventListener('click', handleGenerate);

    // History
    dom.clearHistoryBtn.addEventListener('click', () => {
      showConfirm(
        'Limpar histórico',
        'Tem certeza que deseja excluir todos os vídeos do histórico? Esta ação não pode ser desfeita.',
        clearHistory
      );
    });

    // Settings
    dom.toggleApiKey.addEventListener('click', toggleApiKeyVisibility);
    dom.saveSettingsBtn.addEventListener('click', saveSettings);
    dom.testConnBtn.addEventListener('click', testConnection);

    // Close mobile nav on resize
    window.addEventListener('resize', () => {
      if (window.innerWidth > 768) closeMobileNav();
    });
  }


  // ════════════════════════════════════════════════════════
  //  HEADER / NAV
  // ════════════════════════════════════════════════════════
  function onScroll() {
    dom.header.classList.toggle('header--scrolled', window.scrollY > 20);
  }

  function toggleMobileNav() {
    const open = dom.nav.classList.toggle('nav--open');
    dom.hamburger.classList.toggle('hamburger--open', open);
    dom.hamburger.setAttribute('aria-expanded', open);
  }

  function closeMobileNav() {
    dom.nav.classList.remove('nav--open');
    dom.hamburger.classList.remove('hamburger--open');
    dom.hamburger.setAttribute('aria-expanded', 'false');
  }

  function updateActiveNav() {
    const sections = ['hero', 'generator', 'history', 'settings'];
    const scrollY = window.scrollY + 150;

    let current = 'hero';
    for (const id of sections) {
      const el = document.getElementById(id);
      if (el && el.offsetTop <= scrollY) current = id;
    }

    dom.nav.querySelectorAll('.nav__link').forEach(link => {
      const target = link.getAttribute('data-nav');
      link.classList.toggle('nav__link--active', target === current);
    });
  }


  // ════════════════════════════════════════════════════════
  //  FORMAT SELECTION
  // ════════════════════════════════════════════════════════
  function selectFormat(btn) {
    dom.formatBtns.forEach(b => b.classList.remove('format-btn--active'));
    btn.classList.add('format-btn--active');
    selectedFormat = btn.dataset.format;
  }


  // ════════════════════════════════════════════════════════
  //  VIDEO GENERATION
  // ════════════════════════════════════════════════════════
  async function handleGenerate() {
    // Validate
    const prompt = dom.prompt.value.trim();
    if (!prompt) {
      toast('Por favor, descreva o vídeo que deseja gerar.', 'warning');
      dom.prompt.focus();
      return;
    }

    if (prompt.length < 10) {
      toast('O prompt deve ter pelo menos 10 caracteres.', 'warning');
      dom.prompt.focus();
      return;
    }

    if (isGenerating) return;

    const config = {
      prompt,
      style: dom.style.value,
      duration: parseInt(dom.duration.value),
      format: selectedFormat,
      quality: dom.quality.value,
    };

    isGenerating = true;
    showState('loading');
    setGenerateBtnLoading(true);

    try {
      const apiKey = getStoredValue(STORAGE_KEYS.apiKey);
      const backendUrl = getStoredValue(STORAGE_KEYS.backendUrl);

      if (backendUrl) {
        // Use backend proxy
        await generateViaBackend(backendUrl, config);
      } else if (apiKey) {
        // Direct API call (development only — not recommended for production)
        await generateViaGeminiAPI(apiKey, config);
      } else {
        // Demo mode
        showDemoModeError();
        return;
      }
    } catch (err) {
      showError(err.message || 'Ocorreu um erro inesperado durante a geração.');
    } finally {
      isGenerating = false;
      setGenerateBtnLoading(false);
    }
  }

  // ── Generate via Backend Proxy ──
  async function generateViaBackend(backendUrl, config) {
    updateLoadingMessage('Enviando requisição para o servidor...');
    simulateProgress(0);

    const aspectRatio = formatToAspectRatio(config.format);

    const body = {
      prompt: buildEnhancedPrompt(config),
      config: {
        numberOfVideos: 1,
        durationSeconds: config.duration,
        aspectRatio: aspectRatio,
        resolution: config.quality === '1080p' ? '1080p' : '720p',
      }
    };

    updateLoadingMessage('Aguardando o servidor processar...');
    simulateProgress(20);

    const resp = await fetch(backendUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      throw new Error(errData.error || `Erro do servidor: ${resp.status}`);
    }

    simulateProgress(80);
    updateLoadingMessage('Processando resultado...');

    const data = await resp.json();

    if (data.video) {
      simulateProgress(100);
      await handleVideoResult(data.video, config);
    } else if (data.videoData) {
      // base64 encoded video
      simulateProgress(100);
      const blob = base64ToBlob(data.videoData, 'video/mp4');
      const url = URL.createObjectURL(blob);
      currentVideoBlob = blob;
      await handleVideoResult(url, config, true);
    } else {
      throw new Error('Resposta do servidor não contém dados de vídeo.');
    }
  }

  // ── Generate via Gemini API (direct) ──
  async function generateViaGeminiAPI(apiKey, config) {
    updateLoadingMessage('Conectando à API do Google Gemini...');
    simulateProgress(5);

    const aspectRatio = formatToAspectRatio(config.format);
    const enhancedPrompt = buildEnhancedPrompt(config);

    // Step 1: Start generation
    const generateUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_VEO_MODEL}:predictLongRunning?key=${apiKey}`;

    const requestBody = {
      instances: [{
        prompt: enhancedPrompt
      }],
      parameters: {
        aspectRatio: aspectRatio,
        durationSeconds: config.duration,
        numberOfVideos: 1,
        personGeneration: 'allow_adult',
      }
    };

    updateLoadingMessage('Iniciando geração do vídeo...');
    simulateProgress(10);

    let resp;
    try {
      resp = await fetch(generateUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
    } catch (networkErr) {
      throw new Error(
        'Falha na conexão com a API. Verifique sua internet e se a chave de API está correta. ' +
        'Nota: chamadas diretas do navegador podem ser bloqueadas por CORS. ' +
        'Utilize um backend proxy para contornar isso.'
      );
    }

    if (!resp.ok) {
      const errBody = await resp.json().catch(() => ({}));
      const errMsg = errBody.error?.message || `Erro da API: ${resp.status}`;
      throw new Error(errMsg);
    }

    const operation = await resp.json();

    if (!operation.name) {
      throw new Error('Resposta inesperada da API — operação sem identificador.');
    }

    // Step 2: Poll for completion
    updateLoadingMessage('Gerando vídeo com IA... Isso pode levar alguns minutos.');
    simulateProgress(25);

    const result = await pollOperation(apiKey, operation.name);

    if (result.error) {
      throw new Error(result.error.message || 'Erro durante a geração.');
    }

    simulateProgress(90);
    updateLoadingMessage('Processando resultado...');

    // Extract video data
    const predictions = result.response?.predictions || result.predictions || [];
    if (predictions.length === 0) {
      throw new Error('A API não retornou vídeos. Tente com um prompt diferente.');
    }

    const videoData = predictions[0];
    if (videoData.bytesBase64Encoded) {
      const blob = base64ToBlob(videoData.bytesBase64Encoded, videoData.mimeType || 'video/mp4');
      const url = URL.createObjectURL(blob);
      currentVideoBlob = blob;
      simulateProgress(100);
      await handleVideoResult(url, config, true);
    } else if (videoData.uri) {
      simulateProgress(100);
      await handleVideoResult(videoData.uri, config);
    } else {
      throw new Error('Formato de resposta de vídeo não reconhecido.');
    }
  }

  // ── Poll long-running operation ──
  async function pollOperation(apiKey, operationName, maxAttempts = 60) {
    const pollUrl = `https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${apiKey}`;

    for (let i = 0; i < maxAttempts; i++) {
      await sleep(5000); // Poll every 5 seconds

      const progress = Math.min(25 + (i / maxAttempts) * 60, 85);
      simulateProgress(progress);
      updateLoadingMessage(`Gerando vídeo com IA... (${Math.round(progress)}%)`);

      try {
        const resp = await fetch(pollUrl);
        if (!resp.ok) {
          const errBody = await resp.json().catch(() => ({}));
          throw new Error(errBody.error?.message || `Erro ao verificar status: ${resp.status}`);
        }

        const data = await resp.json();

        if (data.done) {
          return data;
        }

        if (data.error) {
          throw new Error(data.error.message || 'Erro durante a geração.');
        }
      } catch (err) {
        if (i === maxAttempts - 1) throw err;
        // Retry on transient errors
      }
    }

    throw new Error('Tempo esgotado. A geração do vídeo demorou mais do que o esperado.');
  }

  // ── Handle successful result ──
  async function handleVideoResult(videoUrl, config, isBlob = false) {
    currentVideoUrl = videoUrl;
    dom.videoElement.src = videoUrl;

    dom.resultMeta.innerHTML = `
      <span class="tag">🎨 ${STYLE_LABELS[config.style] || config.style}</span>
      <span class="tag">⏱ ${config.duration}s</span>
      <span class="tag">📐 ${config.format}</span>
      <span class="tag">📺 ${config.quality}</span>
    `;

    showState('success');
    toast('Vídeo gerado com sucesso!', 'success');

    // Save to history
    const historyEntry = {
      id: generateId(),
      prompt: config.prompt,
      style: config.style,
      duration: config.duration,
      format: config.format,
      quality: config.quality,
      timestamp: Date.now(),
      hasVideo: true,
      isDemo: false,
    };

    // If blob, store as data URL (for small videos; otherwise just store metadata)
    if (isBlob && currentVideoBlob && currentVideoBlob.size < 10 * 1024 * 1024) {
      try {
        historyEntry.videoDataUrl = await blobToDataUrl(currentVideoBlob);
      } catch (_) {
        // Too large or error — just store metadata
      }
    } else if (!isBlob) {
      historyEntry.videoUrl = videoUrl;
    }

    addToHistory(historyEntry);
  }

  // ── Demo mode error ──
  function showDemoModeError() {
    isGenerating = false;
    setGenerateBtnLoading(false);
    showError(
      'Nenhuma API de geração de vídeo está configurada. ' +
      'Acesse as Configurações para inserir sua chave de API do Google Gemini ou ' +
      'a URL de um backend proxy. Nenhum vídeo fictício será gerado neste modo.'
    );
  }


  // ════════════════════════════════════════════════════════
  //  UI STATE MANAGEMENT
  // ════════════════════════════════════════════════════════
  function showState(state) {
    dom.resultEmpty.hidden   = state !== 'empty';
    dom.resultLoading.hidden = state !== 'loading';
    dom.resultSuccess.hidden = state !== 'success';
    dom.resultError.hidden   = state !== 'error';

    // Scroll to result on mobile
    if (state !== 'empty' && window.innerWidth <= 1024) {
      document.getElementById('resultCard')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function showError(message) {
    dom.errorMessage.textContent = message;
    showState('error');
    toast('Erro na geração do vídeo.', 'error');
  }

  function resetGenerator() {
    showState('empty');
    currentVideoUrl = null;
    currentVideoBlob = null;
    dom.videoElement.src = '';
    dom.prompt.value = '';
    dom.charCount.textContent = '0';
    dom.prompt.focus();
  }

  function setGenerateBtnLoading(loading) {
    dom.generateBtn.disabled = loading;
    const icon = dom.generateBtn.querySelector('.btn__icon');
    if (icon) icon.hidden = loading;
    dom.btnText.hidden = loading;
    dom.btnLoader.hidden = !loading;
  }

  function updateLoadingMessage(msg) {
    dom.loadingMsg.textContent = msg;
  }

  function simulateProgress(target) {
    dom.progressFill.style.width = target + '%';
    dom.progressText.textContent = Math.round(target) + '%';
  }

  function updateModeBanner() {
    const apiKey = getStoredValue(STORAGE_KEYS.apiKey);
    const backendUrl = getStoredValue(STORAGE_KEYS.backendUrl);
    const hasConfig = !!(apiKey || backendUrl);
    dom.modeBanner.classList.toggle('mode-banner--hidden', hasConfig);
  }


  // ════════════════════════════════════════════════════════
  //  DOWNLOAD
  // ════════════════════════════════════════════════════════
  function handleDownload() {
    if (!currentVideoUrl) {
      toast('Nenhum vídeo disponível para download.', 'warning');
      return;
    }

    const filename = `videolab-ai-${Date.now()}.mp4`;

    if (currentVideoBlob) {
      // Download from blob
      const a = document.createElement('a');
      a.href = URL.createObjectURL(currentVideoBlob);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast('Download iniciado!', 'success');
    } else {
      // Try to download from URL
      const a = document.createElement('a');
      a.href = currentVideoUrl;
      a.download = filename;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      toast('Download iniciado!', 'success');
    }
  }


  // ════════════════════════════════════════════════════════
  //  HISTORY
  // ════════════════════════════════════════════════════════
  function getHistory() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.history)) || [];
    } catch {
      return [];
    }
  }

  function saveHistoryData(data) {
    try {
      localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(data));
    } catch (e) {
      // Storage quota exceeded — remove old video data
      data.forEach(item => { delete item.videoDataUrl; });
      try {
        localStorage.setItem(STORAGE_KEYS.history, JSON.stringify(data));
      } catch (_) {
        toast('Não foi possível salvar no histórico (armazenamento cheio).', 'warning');
      }
    }
  }

  function addToHistory(entry) {
    const history = getHistory();
    history.unshift(entry);
    // Keep max 50 items
    if (history.length > 50) history.length = 50;
    saveHistoryData(history);
    renderHistory();
  }

  function deleteHistoryItem(id) {
    const history = getHistory().filter(item => item.id !== id);
    saveHistoryData(history);
    renderHistory();
    toast('Item removido do histórico.', 'info');
  }

  function clearHistory() {
    localStorage.removeItem(STORAGE_KEYS.history);
    renderHistory();
    toast('Histórico limpo com sucesso.', 'success');
  }

  function renderHistory() {
    const history = getHistory();
    const hasItems = history.length > 0;

    dom.historyEmpty.hidden = hasItems;
    dom.historyGrid.innerHTML = '';
    dom.clearHistoryBtn.hidden = !hasItems;

    history.forEach((item, index) => {
      const el = document.createElement('div');
      el.className = 'history-item';
      el.style.animationDelay = `${index * 50}ms`;

      const date = new Date(item.timestamp);
      const dateStr = date.toLocaleDateString('pt-BR', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });

      const previewHTML = item.videoDataUrl
        ? `<video src="${item.videoDataUrl}" muted preload="metadata" onmouseenter="this.play()" onmouseleave="this.pause();this.currentTime=0;"></video>`
        : item.videoUrl
          ? `<video src="${item.videoUrl}" muted preload="metadata" onmouseenter="this.play()" onmouseleave="this.pause();this.currentTime=0;"></video>`
          : `<div class="history-item__preview-placeholder">
               <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
               <span>${item.isDemo ? 'Demo' : 'Vídeo'}</span>
             </div>`;

      el.innerHTML = `
        <div class="history-item__preview">
          ${previewHTML}
          <span class="history-item__badge">${item.duration}s · ${item.format}</span>
        </div>
        <div class="history-item__body">
          <p class="history-item__prompt">${escapeHtml(item.prompt)}</p>
          <div class="history-item__meta">
            <span class="tag">${STYLE_LABELS[item.style] || item.style}</span>
            <span class="tag">${item.quality}</span>
          </div>
          <div class="history-item__actions">
            ${(item.videoDataUrl || item.videoUrl) ? `
              <button class="btn btn--outline btn--sm" data-action="play" data-id="${item.id}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                Assistir
              </button>
            ` : ''}
            <button class="btn btn--ghost btn--sm" data-action="reuse" data-id="${item.id}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
              Reusar
            </button>
            <button class="btn btn--ghost btn--sm" data-action="delete" data-id="${item.id}" aria-label="Excluir">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
          <div class="history-item__date">${dateStr}</div>
        </div>
      `;

      // Event delegation for history actions
      el.addEventListener('click', (e) => {
        const actionBtn = e.target.closest('[data-action]');
        if (!actionBtn) return;

        const action = actionBtn.dataset.action;
        const id = actionBtn.dataset.id;
        const historyItem = getHistory().find(h => h.id === id);
        if (!historyItem) return;

        switch (action) {
          case 'play':
            playHistoryVideo(historyItem);
            break;
          case 'reuse':
            reusePrompt(historyItem);
            break;
          case 'delete':
            showConfirm(
              'Excluir item',
              'Tem certeza que deseja remover este vídeo do histórico?',
              () => deleteHistoryItem(id)
            );
            break;
        }
      });

      dom.historyGrid.appendChild(el);
    });
  }

  function playHistoryVideo(item) {
    const videoSrc = item.videoDataUrl || item.videoUrl;
    if (!videoSrc) {
      toast('Vídeo não disponível.', 'warning');
      return;
    }

    // Scroll to generator and show video
    document.getElementById('generator').scrollIntoView({ behavior: 'smooth' });
    setTimeout(() => {
      dom.videoElement.src = videoSrc;
      currentVideoUrl = videoSrc;
      currentVideoBlob = null;

      dom.resultMeta.innerHTML = `
        <span class="tag">🎨 ${STYLE_LABELS[item.style] || item.style}</span>
        <span class="tag">⏱ ${item.duration}s</span>
        <span class="tag">📐 ${item.format}</span>
        <span class="tag">📺 ${item.quality}</span>
      `;

      showState('success');
    }, 500);
  }

  function reusePrompt(item) {
    dom.prompt.value = item.prompt;
    dom.charCount.textContent = item.prompt.length;
    dom.style.value = item.style;
    dom.duration.value = String(item.duration);
    dom.quality.value = item.quality;

    // Set format
    dom.formatBtns.forEach(btn => {
      btn.classList.toggle('format-btn--active', btn.dataset.format === item.format);
    });
    selectedFormat = item.format;

    // Scroll to generator
    document.getElementById('generator').scrollIntoView({ behavior: 'smooth' });
    toast('Configurações restauradas. Edite e gere novamente.', 'info');
  }


  // ════════════════════════════════════════════════════════
  //  SETTINGS
  // ════════════════════════════════════════════════════════
  function loadSettings() {
    dom.apiKey.value     = getStoredValue(STORAGE_KEYS.apiKey) || '';
    dom.apiProvider.value= getStoredValue(STORAGE_KEYS.provider) || 'gemini-veo';
    dom.backendUrl.value = getStoredValue(STORAGE_KEYS.backendUrl) || '';
  }

  function saveSettings() {
    const apiKey = dom.apiKey.value.trim();
    const provider = dom.apiProvider.value;
    const backendUrl = dom.backendUrl.value.trim();

    // Validate backend URL if provided
    if (backendUrl && !isValidUrl(backendUrl)) {
      toast('URL do backend inválida.', 'error');
      return;
    }

    setStoredValue(STORAGE_KEYS.apiKey, apiKey);
    setStoredValue(STORAGE_KEYS.provider, provider);
    setStoredValue(STORAGE_KEYS.backendUrl, backendUrl);

    updateModeBanner();
    toast('Configurações salvas com sucesso!', 'success');
  }

  function toggleApiKeyVisibility() {
    const isPassword = dom.apiKey.type === 'password';
    dom.apiKey.type = isPassword ? 'text' : 'password';
  }

  async function testConnection() {
    const apiKey = dom.apiKey.value.trim();
    const backendUrl = dom.backendUrl.value.trim();

    if (!apiKey && !backendUrl) {
      toast('Insira uma API key ou URL de backend para testar.', 'warning');
      return;
    }

    dom.testConnBtn.disabled = true;
    dom.testConnBtn.innerHTML = '<div class="spinner"></div> Testando...';

    try {
      if (backendUrl) {
        // Test backend
        const resp = await fetch(backendUrl, {
          method: 'OPTIONS',
        }).catch(() => null);

        if (resp) {
          toast('Conexão com o backend estabelecida!', 'success');
        } else {
          toast('Não foi possível conectar ao backend. Verifique a URL.', 'error');
        }
      } else {
        // Test Gemini API key with a simple models list call
        const resp = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
        );

        if (resp.ok) {
          const data = await resp.json();
          const veoModel = (data.models || []).find(m => m.name?.includes('veo'));
          if (veoModel) {
            toast(`Conexão OK! Modelo ${veoModel.displayName || 'Veo'} encontrado.`, 'success');
          } else {
            toast('Conexão OK, mas modelo Veo não foi encontrado. Verifique as permissões.', 'warning');
          }
        } else {
          const errBody = await resp.json().catch(() => ({}));
          toast(`Erro: ${errBody.error?.message || resp.statusText}`, 'error');
        }
      }
    } catch (err) {
      toast(`Erro de conexão: ${err.message}`, 'error');
    } finally {
      dom.testConnBtn.disabled = false;
      dom.testConnBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
        Testar Conexão
      `;
    }
  }


  // ════════════════════════════════════════════════════════
  //  CONFIRM MODAL
  // ════════════════════════════════════════════════════════
  let confirmCallback = null;

  function showConfirm(title, message, onConfirm) {
    dom.modalTitle.textContent = title;
    dom.modalMessage.textContent = message;
    confirmCallback = onConfirm;
    dom.confirmModal.hidden = false;
  }

  dom.modalCancel.addEventListener('click', () => {
    dom.confirmModal.hidden = true;
    confirmCallback = null;
  });

  dom.modalConfirm.addEventListener('click', () => {
    dom.confirmModal.hidden = true;
    if (confirmCallback) confirmCallback();
    confirmCallback = null;
  });

  dom.confirmModal.addEventListener('click', (e) => {
    if (e.target === dom.confirmModal) {
      dom.confirmModal.hidden = true;
      confirmCallback = null;
    }
  });


  // ════════════════════════════════════════════════════════
  //  TOAST NOTIFICATIONS
  // ════════════════════════════════════════════════════════
  function toast(message, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;

    const icons = {
      success: '✓',
      error:   '✕',
      warning: '⚠',
      info:    'ℹ',
    };

    el.innerHTML = `
      <span>${icons[type] || 'ℹ'}</span>
      <span>${escapeHtml(message)}</span>
      <button class="toast__close" aria-label="Fechar">&times;</button>
    `;

    const closeBtn = el.querySelector('.toast__close');
    closeBtn.addEventListener('click', () => removeToast(el));

    dom.toastContainer.appendChild(el);

    // Auto remove
    setTimeout(() => removeToast(el), 5000);
  }

  function removeToast(el) {
    if (!el.parentNode) return;
    el.classList.add('toast--out');
    setTimeout(() => el.remove(), 300);
  }


  // ════════════════════════════════════════════════════════
  //  UTILITIES
  // ════════════════════════════════════════════════════════
  function buildEnhancedPrompt(config) {
    const styleDescriptions = {
      realistic:   'photorealistic, natural lighting, high detail',
      cinematic:   'cinematic look, anamorphic lens, film grain, dramatic lighting, shallow depth of field',
      animation:   'animated, colorful, cartoon style, smooth motion',
      '3d':        '3D rendered, Pixar style, volumetric lighting, detailed textures',
      futuristic:  'futuristic, sci-fi, neon lights, holographic elements, cyberpunk aesthetics',
    };

    const styleHint = styleDescriptions[config.style] || '';
    return `${config.prompt}. Style: ${styleHint}. High quality, ${config.quality}.`;
  }

  function formatToAspectRatio(format) {
    switch (format) {
      case '16:9': return '16:9';
      case '9:16': return '9:16';
      case '1:1':  return '1:1';
      default:     return '16:9';
    }
  }

  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function isValidUrl(string) {
    try {
      new URL(string);
      return true;
    } catch {
      return false;
    }
  }

  function base64ToBlob(base64, mime) {
    const byteChars = atob(base64);
    const byteArrays = [];
    for (let offset = 0; offset < byteChars.length; offset += 512) {
      const slice = byteChars.slice(offset, offset + 512);
      const byteNumbers = new Array(slice.length);
      for (let i = 0; i < slice.length; i++) {
        byteNumbers[i] = slice.charCodeAt(i);
      }
      byteArrays.push(new Uint8Array(byteNumbers));
    }
    return new Blob(byteArrays, { type: mime });
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  function getStoredValue(key) {
    try {
      return localStorage.getItem(key) || '';
    } catch {
      return '';
    }
  }

  function setStoredValue(key, value) {
    try {
      if (value) {
        localStorage.setItem(key, value);
      } else {
        localStorage.removeItem(key);
      }
    } catch {
      // localStorage may be full or unavailable
    }
  }


  // ════════════════════════════════════════════════════════
  //  START
  // ════════════════════════════════════════════════════════
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
