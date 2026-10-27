// ============================================
// Tema Dark / Light
// ============================================

const applyTheme = (theme) => {
  currentTheme = theme;
  dom.html.setAttribute('data-theme', theme);
  dom.html.setAttribute('data-bs-theme', theme);
  dom.themeIcon.className = theme === 'dark'
    ? 'bi bi-sun-fill'
    : 'bi bi-moon-stars-fill';
  localStorage.setItem(THEME_KEY, theme);

  const metaTheme = document.getElementById('metaThemeColor');
  if (metaTheme) {
    metaTheme.content = theme === 'dark' ? '#1e293b' : '#ffffff';
  }
};

const initTheme = () => {
  const saved = localStorage.getItem(THEME_KEY);
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved ?? (prefersDark ? 'dark' : 'light'));
};

const toggleTheme = () => {
  applyTheme(currentTheme === 'light' ? 'dark' : 'light');
  render();
};

// ============================================
// Persistência (localStorage ou Firebase via AppStorage)
// ============================================

const loadData = async () => {
  try {
    const loaded = await AppStorage.load();
    if (loaded && typeof loaded === 'object') {
      allData = loaded;
    }
  } catch {
    notify.error('Falha de rede ao buscar nuvem — mantendo dados salvos no aparelho.');
  }
};

const saveData = () => {
  try {
    AppStorage.save(allData);
  } catch {
    notify.error('Erro ao salvar os dados.');
  }
};

const registrarExclusaoIds = (ids = [], minTimestamp = 0) => {
  if (!ids.length) return;
  if (!allData.__app || typeof allData.__app !== 'object') allData.__app = {};
  if (!allData.__app._deleted || typeof allData.__app._deleted !== 'object') allData.__app._deleted = {};
  const stamp = Math.max(Date.now(), (Number(minTimestamp) || 0) + 1);
  ids.forEach((id) => {
    if (id) {
      const prev = Number(allData.__app._deleted[id]) || 0;
      allData.__app._deleted[id] = Math.max(stamp, prev);
    }
  });
};

const desmarcarExclusaoIds = (ids = []) => {
  if (!ids.length) return;
  AppStorage?.markDirtyIds?.(ids);
  if (!allData.__app?._deleted) return;
  ids.forEach((id) => {
    if (id) delete allData.__app._deleted[id];
  });
};

window.registrarExclusaoIds = registrarExclusaoIds;
window.desmarcarExclusaoIds = desmarcarExclusaoIds;

const getCurrentEntries = () => allData[getMonthKey(currentDate)] ?? [];
