// ============================================
// Init
// ============================================

// Reconciliação dos ajustes (garante Caixinha Turbo na carteira de investimentos e
// no mês a mês em R$ 450,00, MEI pago, Cabelo Gabriel pago).
const reconciliarDadosRecentes = () => {
  if (!allData || typeof allData !== 'object') return false;
  if (!allData.__app || typeof allData.__app !== 'object') allData.__app = {};

  const mesesComDados = Object.keys(allData)
    .filter((k) => /^\d{4}-\d{2}$/.test(k) && Array.isArray(allData[k]) && allData[k].length > 0)
    .sort();

  // Só reconcilia quando os dados reais do usuário já estiverem carregados
  if (!mesesComDados.length && !(Array.isArray(allData.__app.investimentos) && allData.__app.investimentos.length)) {
    return false;
  }

  let houveMudanca = false;
  const mesAtualKey = getMonthKey(currentDate);
  const mesAlvo = allData[mesAtualKey]?.length
    ? mesAtualKey
    : (mesesComDados[mesesComDados.length - 1] || mesAtualKey);

  // 1. Marcar MEI e Cabelo Gabriel como "pago" no mês ativo/recente se estiverem "nao_pago"
  const mesesParaVerificar = Array.from(new Set([mesAlvo, mesAtualKey, '2026-10', '2026-11'])).filter((m) => Array.isArray(allData[m]));
  mesesParaVerificar.forEach((mes) => {
    const listaOriginal = allData[mes];
    let alterouMes = false;
    const novaLista = listaOriginal.map((item) => {
      if (!item || typeof item !== 'object') return item;
      const desc = String(item.description || '').trim();
      const person = String(item.person || '').toLowerCase();
      const ehMei =
        /^(mei|mei\s+gabriel|das\s*mei|imposto\s*mei|microempreendedor)$/i.test(desc) ||
        (/\bmei\b/i.test(desc) && (person === 'gabriel' || !person));
      const ehCabeloGabriel =
        /cabelo\s*gabriel|barbeiro\s*gabriel|corte\s*(de\s*)?cabelo\s*gabriel/i.test(desc) ||
        (/\b(cabelo|barbeiro|barbearia|corte\s+de\s+cabelo)\b/i.test(desc) && person === 'gabriel');

      if ((ehMei || ehCabeloGabriel) && item.status !== 'pago') {
        alterouMes = true;
        return { ...item, status: 'pago', _updatedAt: Date.now() };
      }
      return item;
    });

    if (alterouMes) {
      registrarHistoricoMes(mes, listaOriginal, novaLista);
      allData[mes] = novaLista;
      houveMudanca = true;
    }
  });

  // 2. Garantir Caixinha Turbo SEMPRE presente na aba Investimentos e no Mês a mês com R$ 450,00
  if (!Array.isArray(allData.__app.investimentos)) allData.__app.investimentos = [];
  if (!Array.isArray(allData.__app.historico)) allData.__app.historico = [];

  const regexCaixinhaTurbo = /caixinha\s*turbo/i;
  const idxCarteira = allData.__app.investimentos.findIndex(
    (inv) => regexCaixinhaTurbo.test(String(inv?.instituicao || '')) || regexCaixinhaTurbo.test(String(inv?.tipo || ''))
  );

  let carteiraId = '';
  if (idxCarteira >= 0) {
    carteiraId = allData.__app.investimentos[idxCarteira].id;
    desmarcarExclusaoIds([carteiraId]);
  } else {
    // Se a categoria sumiu da carteira (ex: sobrescrita por outro aparelho), RECIRA IMEDIATAMENTE
    carteiraId = generateId();
    const novaCarteira = {
      id: carteiraId,
      tipo: 'Caixinha / Conta remunerada',
      instituicao: 'Caixinha Turbo',
      meta: 0,
      rendimento: 0,
      data: `${mesAlvo}-01`,
      _updatedAt: Date.now()
    };
    allData.__app.investimentos.push(novaCarteira);
    desmarcarExclusaoIds([carteiraId]);
    houveMudanca = true;
  }

  let encontrouCaixinhaMes = false;
  mesesParaVerificar.forEach((mes) => {
    const listaOriginal = allData[mes];
    let alterouMes = false;
    const novaLista = listaOriginal.map((item) => {
      if (!item || typeof item !== 'object') return item;
      if (regexCaixinhaTurbo.test(String(item.description || ''))) {
        encontrouCaixinhaMes = true;
        let novoItem = item;
        let mudou = false;
        if (Number(item.value) === 600) {
          novoItem = { ...novoItem, value: 450, status: 'pago' };
          mudou = true;
        }
        if (novoItem.investimento_id !== carteiraId || novoItem.type !== 'investimento') {
          novoItem = { ...novoItem, investimento_id: carteiraId, type: 'investimento' };
          mudou = true;
        }
        if (mudou) {
          alterouMes = true;
          return { ...novoItem, _updatedAt: Date.now() };
        }
      }
      return item;
    });

    if (alterouMes) {
      registrarHistoricoMes(mes, listaOriginal, novaLista);
      allData[mes] = novaLista;
      houveMudanca = true;
    }
  });

  // Se não estava em nenhum mês, cria no mês alvo com R$ 450,00 vinculado à carteira
  if (!encontrouCaixinhaMes) {
    const entry450 = normalizeEntry({
      id: generateId(),
      description: 'Caixinha Turbo',
      category: catPapel('investimentos'),
      type: 'investimento',
      person: 'gabriel',
      value: 450,
      status: 'pago',
      due_day: null,
      observation: '',
      card_items: [],
      investimento_id: carteiraId,
      _updatedAt: Date.now()
    });
    const baseMes = Array.isArray(allData[mesAlvo]) ? allData[mesAlvo] : [];
    const novaLista = [...baseMes, entry450];
    registrarHistoricoMes(mesAlvo, baseMes, novaLista);
    allData[mesAlvo] = novaLista;
    houveMudanca = true;
  }

  return houveMudanca;
};

// Carrega os dados e desenha a tela (chamado quando o armazenamento está pronto)
const startApp = async () => {
  // 1. Exibe imediatamente o espelho local (0ms) enquanto busca a nuvem em segundo plano
  const cached = AppStorage.loadCached?.();
  if (cached && typeof cached === 'object' && Object.keys(cached).length > 0) {
    allData = cached;
    reconciliarDadosRecentes();
    iniciarSnapshotsHistorico();
    aplicarCategoriasSalvas();
    populateCategories();
    populateInvestimentoSelects();
    toggleInvestimentoField(dom.inputType, dom.inputCategory, dom.inputInvestimento, document.getElementById('btnManageCategories'));
    render();
  }

  // 2. Carrega e sincroniza com o servidor (Firestore)
  await loadData();
  iniciarSnapshotsHistorico();
  const reconciliou = reconciliarDadosRecentes();
  if (reconciliou) {
    saveData();
  }
  aplicarCategoriasSalvas();
  populateCategories();
  populateInvestimentoSelects();
  toggleInvestimentoField(dom.inputType, dom.inputCategory, dom.inputInvestimento, document.getElementById('btnManageCategories'));
  render();
};

// Recebe atualizações em tempo real da nuvem (outro aparelho/aba) sem perder edições locais
const handleRemoteUpdate = (remoteData, skipMirror = false) => {
  if (!remoteData || typeof remoteData !== 'object') return;
  const isLocalDirty = Boolean(AppStorage.isDirty?.());
  allData = AppStorage.mergeAllData ? AppStorage.mergeAllData(allData, remoteData, isLocalDirty) : remoteData;
  Object.keys(allData).forEach((month) => {
    if (month.startsWith('__')) return;
    if (Array.isArray(allData[month])) {
      allData[month] = allData[month].map(normalizeEntry);
    }
  });
  if (!skipMirror) {
    AppStorage.mirrorLocal?.(allData);
  }
  reconciliarDadosRecentes();
  iniciarSnapshotsHistorico();
  aplicarCategoriasSalvas();
  populateCategories();
  populateInvestimentoSelects();
  render();
};

// ============================================
// PWA — versão e service worker
// ============================================

// Fonte única da versão: a meta do index.html, que é o mesmo valor do ?v= dos arquivos
const APP_VERSION = document.querySelector('meta[name="app-version"]')?.content?.trim() || 'dev';
const RELOAD_GUARD_KEY = 'financas_casa_reloaded_version';
let isReloadingForUpdate = false;

// Limpa todos os caches do PWA/Service Worker e recarrega buscando a versão mais recente da rede
const forceHardReload = async (targetVersion = '') => {
  if (isReloadingForUpdate) return;
  isReloadingForUpdate = true;
  if (typeof targetVersion === 'string' && targetVersion) {
    try { sessionStorage.setItem(RELOAD_GUARD_KEY, targetVersion); } catch {}
  }
  try {
    await AppStorage.flush?.();
  } catch {}
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {}
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.update().catch(() => {})));
    }
  } catch {}
  window.location.reload();
};

// Verifica direto na rede se o index.html publicado tem uma versão mais nova que a aberta no PWA
const checkRemoteAppVersion = async () => {
  if (location.protocol === 'file:' || !navigator.onLine || isReloadingForUpdate) return;
  // Não recarrega no meio de um salvamento ou com modal de edição aberto
  if (AppStorage.isDirty?.() || dom.editModalEl?.classList.contains('show')) return;
  try {
    const res = await fetch(`./index.html?_vcheck=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
    });
    if (!res.ok) return;
    const html = await res.text();
    const match = html.match(/<meta\s+name=["']app-version["']\s+content=["']([^"']+)["']/i);
    const remoteVersion = match?.[1]?.trim();
    if (remoteVersion && remoteVersion !== APP_VERSION) {
      try {
        if (sessionStorage.getItem(RELOAD_GUARD_KEY) === remoteVersion) return;
      } catch {}
      notify.info(`Atualizando para a nova versão (v${remoteVersion})...`);
      setTimeout(() => forceHardReload(remoteVersion), 400);
    }
  } catch {
    /* Sem rede no momento */
  }
};

const showAppVersion = () => {
  if (!dom.appVersion) return;
  dom.appVersion.textContent = `v${APP_VERSION}`;
  dom.appVersion.hidden = false;
  // Clicar no selo de versão limpa o cache do PWA e recarrega a versão mais recente
  dom.appVersion.addEventListener('click', () => forceHardReload());
};

const registerServiceWorker = async () => {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;

  try {
    const reg = await navigator.serviceWorker.register(`sw.js?v=${encodeURIComponent(APP_VERSION)}`, {
      scope: './',
      updateViaCache: 'none' // o próprio sw.js nunca vem do cache do navegador
    });

    reg.addEventListener('updatefound', () => {
      const novo = reg.installing;
      if (!novo || !navigator.serviceWorker.controller) return;
      novo.addEventListener('statechange', () => {
        if (novo.state === 'installed' && navigator.serviceWorker.controller) {
          novo.postMessage({ type: 'SKIP_WAITING' });
        }
        if (novo.state === 'activated') {
          forceHardReload();
        }
      });
    });

    // Checa nova versão ao abrir o PWA, ao voltar para a janela/app e a cada 60s
    setTimeout(checkRemoteAppVersion, 1500);
    setInterval(checkRemoteAppVersion, 60000);

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        reg.update().catch(() => {});
        checkRemoteAppVersion();
      }
    });

    window.addEventListener('focus', () => {
      reg.update().catch(() => {});
      checkRemoteAppVersion();
    });
  } catch {
    /* O app funciona igual sem service worker — o PWA é um extra */
  }
};

const init = () => {
  dayjs.locale('pt-br');
  showAppVersion();
  window.addEventListener('load', registerServiceWorker);
  initTheme();
  populateSelectors();
  populateCategories();
  populatePersonSelect();
  initMoneyMasks();
  editModal = new bootstrap.Modal(dom.editModalEl);
  bindEvents();

  // Inicia o armazenamento: em modo nuvem aguarda o login e escuta mudanças em tempo real;
  // em modo local dispara startApp() imediatamente.
  AppStorage.init(startApp, handleRemoteUpdate);
};

document.addEventListener('DOMContentLoaded', init);
