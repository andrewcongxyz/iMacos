// --- Tab switching ---
const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.tab-panel');

let currentTab = 'dashboard';

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const target = tab.dataset.tab;
    if (target === currentTab) return;

    tabs.forEach(t => t.classList.remove('active'));
    panels.forEach(p => p.classList.remove('active'));

    tab.classList.add('active');
    document.getElementById('tab-' + target).classList.add('active');
    currentTab = target;

    // Load data for the tab on first visit
    loadTab(target);
  });
});

// --- Module registry ---
const modules = {
  dashboard: { load: loadDashboard, loaded: false },
  processes: { load: loadProcesses, loaded: false },
  ports: { load: loadPorts, loaded: false },
  startup: { load: loadStartup, loaded: false },
  network: { load: loadNetwork, loaded: false },
};

function loadTab(name, force = false) {
  const mod = modules[name];
  if (!mod) return;
  if (mod.loaded && !force) return;
  mod.load();
  mod.loaded = true;
}

// --- Refresh All ---
const btnRefresh = document.getElementById('btn-refresh');
btnRefresh.addEventListener('click', () => {
  btnRefresh.classList.add('spinning');
  // Reset all loaded flags and reload current tab
  Object.values(modules).forEach(m => m.loaded = false);
  loadTab(currentTab, true);
  setTimeout(() => btnRefresh.classList.remove('spinning'), 800);
});

// --- Language Switch ---
const btnLang = document.getElementById('btn-lang');
const langLabel = document.getElementById('lang-label');

function updateStaticUI() {
  // Update titlebar
  document.querySelector('.titlebar-subtitle').textContent = t('subtitle');
  btnRefresh.title = t('refreshAll');
  langLabel.textContent = t('langSwitch');

  // Update tab labels
  const tabKeys = ['tabDashboard', 'tabProcesses', 'tabPorts', 'tabStartup', 'tabNetwork'];
  tabs.forEach((tab, i) => {
    tab.querySelector('span').textContent = t(tabKeys[i]);
  });
}

btnLang.addEventListener('click', () => {
  const newLang = getLang() === 'en' ? 'zh' : 'en';
  setLang(newLang);
  updateStaticUI();
  // Force reload current tab to apply translations
  Object.values(modules).forEach(m => m.loaded = false);
  loadTab(currentTab, true);
});

// --- Helper: create sortable table with incremental rendering ---
const PAGE_SIZE = 100;

function createSortableTable(container, columns, data, opts = {}) {
  let sortCol = opts.defaultSort || null;
  let sortAsc = opts.defaultAsc !== undefined ? opts.defaultAsc : true;
  let filteredData = data;
  let sorted = [];
  let renderedCount = 0;
  let wrap = null;
  let tbody = null;
  let loadingMore = false;

  function doSort() {
    sorted = [...filteredData].sort((a, b) => {
      if (!sortCol) return 0;
      let va = a[sortCol], vb = b[sortCol];
      if (typeof va === 'number' && typeof vb === 'number') {
        return sortAsc ? va - vb : vb - va;
      }
      va = String(va || '').toLowerCase();
      vb = String(vb || '').toLowerCase();
      return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
    });
  }

  function buildRowHtml(row) {
    let html = '<tr>';
    columns.forEach(col => {
      const val = row[col.key];
      const cls = col.class ? ` class="${typeof col.class === 'function' ? col.class(row) : col.class}"` : '';
      const display = col.render ? col.render(val, row) : escapeHtml(String(val ?? ''));
      html += `<td${cls}>${display}</td>`;
    });
    html += '</tr>';
    return html;
  }

  function renderMore() {
    if (!tbody || renderedCount >= sorted.length) return;
    const end = Math.min(renderedCount + PAGE_SIZE, sorted.length);
    let html = '';
    for (let i = renderedCount; i < end; i++) {
      html += buildRowHtml(sorted[i]);
    }
    tbody.insertAdjacentHTML('beforeend', html);
    renderedCount = end;
  }

  function render() {
    doSort();
    renderedCount = 0;

    // Reuse existing wrap or create new
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'data-table-wrap';
      container.appendChild(wrap);

      // Scroll listener for infinite loading
      const panel = container.closest('.tab-panel');
      if (panel) {
        panel.addEventListener('scroll', () => {
          if (loadingMore || renderedCount >= sorted.length) return;
          if (panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 200) {
            loadingMore = true;
            renderMore();
            loadingMore = false;
          }
        });
      }
    }

    let html = '<table class="data-table"><thead><tr>';
    columns.forEach(col => {
      const arrow = sortCol === col.key
        ? (sortAsc ? ' <span class="sort-arrow active">\u25B2</span>' : ' <span class="sort-arrow active">\u25BC</span>')
        : ' <span class="sort-arrow">\u25B2</span>';
      html += `<th data-col="${col.key}">${col.label}${arrow}</th>`;
    });
    html += '</tr></thead><tbody></tbody></table>';
    wrap.innerHTML = html;
    tbody = wrap.querySelector('tbody');

    if (sorted.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${columns.length}" style="text-align:center;padding:30px;color:var(--text-dim)">${t('noData')}</td></tr>`;
    } else {
      renderMore();
    }

    // Sort click handlers
    wrap.querySelectorAll('th').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.col;
        if (sortCol === col) {
          sortAsc = !sortAsc;
        } else {
          sortCol = col;
          sortAsc = true;
        }
        render();
      });
    });
  }

  render();

  return {
    update(newData) {
      filteredData = newData;
      render();
    },
  };
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showLoading(container) {
  container.innerHTML = `<div class="loading"><div class="loading-spinner"></div><span>${t('loading')}</span></div>`;
}

// --- Initial load ---
updateStaticUI();
loadTab('dashboard');
