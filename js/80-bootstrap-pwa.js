// ============================================
// Init
// ============================================

// Reconciliação única dos ajustes recentes relatados (Caixinha Turbo 600 -> 450,
// MEI pago, Cabelo Gabriel pago + histórico de alterações correspondente) caso
// tenham se perdido antes da correção do sync/histórico.
const reconciliarDadosRecentes = () => {
  if (!allData || typeof allData !== 'object') return false;
  if (!allData.__app || typeof allData.__app !== 'object') allData.__app = {};
  if (allData.__app._reconciliado20261024) return false;

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
  const mesesParaVerificar = Array.from(new Set([mesAlvo, mesAtualKey])).filter((m) => Array.isArray(allData[m]));
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

  // 2. Garantir Caixinha Turbo em R$ 450,00 (com histórico 600 -> 450)
  if (!Array.isArray(allData.__app.investimentos)) allData.__app.investimentos = [];
  if (!Array.isArray(allData.__app.historico)) allData.__app.historico = [];

  const regexCaixinhaTurbo = /caixinha\s*turbo/i;
  let encontrouCaixinhaMes = false;

  mesesParaVerificar.forEach((mes) => {
    const listaOriginal = allData[mes];
    let alterouMes = false;
    const novaLista = listaOriginal.map((item) => {
      if (!item || typeof item !== 'object') return item;
      if (regexCaixinhaTurbo.test(String(item.description || ''))) {
        encontrouCaixinhaMes = true;
        if (Number(item.value) === 600) {
          alterouMes = true;
          return { ...item, value: 450, status: 'pago', _updatedAt: Date.now() };
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

  const idxCarteira = allData.__app.investimentos.findIndex(
    (inv) => regexCaixinhaTurbo.test(String(inv?.instituicao || '')) || regexCaixinhaTurbo.test(String(inv?.tipo || ''))
  );

  if (idxCarteira >= 0) {
    const invAtual = allData.__app.investimentos[idxCarteira];
    const vAplicado = Number(invAtual.valorAplicado) || 0;
    const vAtual = Number(invAtual.valorAtual) || 0;
    if (vAplicado === 600 || vAtual === 600 || (!encontrouCaixinhaMes && vAplicado !== 450 && vAtual !== 450)) {
      const invAntes600 = {
        ...JSON.parse(JSON.stringify(invAtual)),
        valorAplicado: 600,
        valorAtual: 600
      };
      const invDepois450 = {
        ...JSON.parse(JSON.stringify(invAtual)),
        valorAplicado: 450,
        valorAtual: 450,
        _updatedAt: Date.now()
      };
      allData.__app.investimentos[idxCarteira] = invDepois450;
      registrarHistoricoModulo('investimentos', invAntes600, invDepois450);
      houveMudanca = true;
    }
  } else if (!encontrouCaixinhaMes) {
    // Se não estava nem na carteira nem no mês (perdeu-se ao sair do site),
    // garante a categoria na carteira e o lançamento de R$ 450,00 no mês alvo + histórico 600 -> 450
    const carteiraId = generateId();
    const dataInicio = `${mesAlvo}-01`;
    const novaCarteira = {
      id: carteiraId,
      tipo: 'Renda Fixa',
      instituicao: 'Caixinha Turbo',
      valorAplicado: 0,
      valorAtual: 0,
      rentabilidade: 0,
      data: dataInicio,
      _updatedAt: Date.now()
    };
    allData.__app.investimentos.push(novaCarteira);

    const entryId = generateId();
    const entry600 = normalizeEntry({
      id: entryId,
      description: 'Caixinha Turbo',
      category: catPapel('investimentos'),
      type: 'investimento',
      person: 'gabriel',
      value: 600,
      status: 'pago',
      due_day: null,
      observation: '',
      card_items: [],
      investimento_id: carteiraId,
      _updatedAt: Date.now() - 60000
    });
    const entry450 = {
      ...entry600,
      value: 450,
      _updatedAt: Date.now()
    };

    const baseMes = Array.isArray(allData[mesAlvo]) ? allData[mesAlvo] : [];
    const listaCom600 = [...baseMes, entry600];
    registrarHistoricoMes(mesAlvo, baseMes, listaCom600);
    const listaCom450 = [...baseMes, entry450];
    registrarHistoricoMes(mesAlvo, listaCom600, listaCom450);
    allData[mesAlvo] = listaCom450;
    houveMudanca = true;
  }

  // Se Caixinha Turbo já estava em 450 mas sem o registro de histórico 600 -> 450, garante no histórico
  const jaTemHistCaixinha600 = allData.__app.historico.some((h) => {
    const txt = String(h?.acao || h?.resumo || '');
    return regexCaixinhaTurbo.test(txt) && txt.includes('600');
  });
  if (!jaTemHistCaixinha600) {
    const invRef = allData.__app.investimentos.find(
      (inv) => regexCaixinhaTurbo.test(String(inv?.instituicao || '')) || regexCaixinhaTurbo.test(String(inv?.tipo || ''))
    );
    const entryRef = (allData[mesAlvo] || []).find((e) => regexCaixinhaTurbo.test(String(e?.description || '')));
    if (entryRef) {
      const antes600 = { ...JSON.parse(JSON.stringify(entryRef)), value: 600 };
      const depois450 = { ...JSON.parse(JSON.stringify(entryRef)), value: 450 };
      const idxAdd450 = allData.__app.historico.findIndex((h) =>
        h?.tipo === 'mes' &&
        regexCaixinhaTurbo.test(String(h?.acao || '')) &&
        Array.isArray(h?.adicionados) &&
        h.adicionados.length === 1 &&
        Number(h.adicionados[0]?.value) === 450
      );
      if (idxAdd450 >= 0) {
        const regAdd = allData.__app.historico[idxAdd450];
        const tsAdd = dayjs(regAdd.quando).subtract(1, 'minute').toISOString();
        regAdd.acao = `adicionou “Caixinha Turbo” (${formatCurrency(600)})`;
        regAdd.adicionados = [antes600];
        const regEdit = {
          id: generateId(),
          quando: regAdd.quando,
          tipo: 'mes',
          mes: regAdd.mes || mesAlvo,
          acao: `alterou “Caixinha Turbo” (${formatCurrency(600)} → ${formatCurrency(450)})`,
          reversivel: true,
          adicionados: [],
          removidos: [],
          alterados: [{ antes: antes600, depois: depois450 }]
        };
        regAdd.quando = tsAdd;
        allData.__app.historico.splice(idxAdd450, 0, regEdit);
      } else {
        novoRegistroHistorico({
          tipo: 'mes',
          mes: mesAlvo,
          acao: `alterou “Caixinha Turbo” (${formatCurrency(600)} → ${formatCurrency(450)})`,
          reversivel: true,
          adicionados: [],
          removidos: [],
          alterados: [{ antes: antes600, depois: depois450 }]
        });
      }
      houveMudanca = true;
    } else if (invRef) {
      const antes600 = { ...JSON.parse(JSON.stringify(invRef)), valorAplicado: 600, valorAtual: 600 };
      const depois450 = { ...JSON.parse(JSON.stringify(invRef)), valorAplicado: 450, valorAtual: 450 };
      registrarHistoricoModulo('investimentos', antes600, depois450);
      houveMudanca = true;
    }
  }

  allData.__app._reconciliado20261024 = true;
  return houveMudanca;
};

// Carrega os dados e desenha a tela (chamado quando o armazenamento está pronto)
const startApp = async () => {
  // 1. Exibe imediatamente o espelho local (0ms) enquanto busca a nuvem em segundo plano
  const cached = AppStorage.loadCached?.();
  if (cached && typeof cached === 'object' && Object.keys(cached).length > 0) {
    allData = cached;
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
