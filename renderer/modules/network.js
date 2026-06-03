let networkData = [];
let netStateFilter = 'all';
let netCategoryFilter = 'all';
let netRiskFilter = 'all';
let netSearchQuery = '';

async function loadNetwork() {
  const panel = document.getElementById('tab-network');
  showLoading(panel);

  const result = await window.imacos.getNetwork();
  if (!result.ok) {
    panel.innerHTML = `<div class="loading">${t('error')}: ${escapeHtml(result.error)}</div>`;
    return;
  }

  networkData = result.data;
  netStateFilter = 'all';
  netCategoryFilter = 'all';
  netRiskFilter = 'all';
  netSearchQuery = '';
  panel.innerHTML = '';

  // Counts
  const catCounts = {};
  networkData.forEach(p => { catCounts[p.category] = (catCounts[p.category] || 0) + 1; });
  const riskCounts = {};
  networkData.forEach(p => { riskCounts[p.risk] = (riskCounts[p.risk] || 0) + 1; });

  // Toolbar - search + category
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  toolbar.innerHTML = `
    <input type="text" class="search-input" placeholder="${t('searchNetwork')}" id="net-search">
    <button class="filter-btn active" data-cat="all">${t('all')}</button>
    <button class="filter-btn" data-cat="system">${t('catSystem')} ${catCounts.system ? '(' + catCounts.system + ')' : ''}</button>
    <button class="filter-btn" data-cat="apple">${t('catApple')} ${catCounts.apple ? '(' + catCounts.apple + ')' : ''}</button>
    <button class="filter-btn" data-cat="app">${t('catApp')} ${catCounts.app ? '(' + catCounts.app + ')' : ''}</button>
    <button class="filter-btn" data-cat="dev">${t('catDev')} ${catCounts.dev ? '(' + catCounts.dev + ')' : ''}</button>
    ${catCounts.unknown ? `<button class="filter-btn" data-cat="unknown">${t('catUnknown')} (${catCounts.unknown})</button>` : ''}
    <span class="count-badge" id="net-count-badge">${networkData.length} ${t('connections')}</span>
  `;
  panel.appendChild(toolbar);

  // Risk + state filter toolbar
  const riskToolbar = document.createElement('div');
  riskToolbar.className = 'toolbar risk-toolbar';
  riskToolbar.id = 'net-risk-toolbar';
  riskToolbar.innerHTML = buildNetRiskToolbar(riskCounts);
  panel.appendChild(riskToolbar);

  // Container for grouped cards
  const groupContainer = document.createElement('div');
  groupContainer.className = 'port-groups';
  groupContainer.id = 'net-group-container';
  panel.appendChild(groupContainer);

  function applyNetFilters() {
    const q = (document.getElementById('net-search')?.value || '').toLowerCase();
    netSearchQuery = q;
    let filtered = networkData;

    if (netStateFilter === 'established') {
      filtered = filtered.filter(c => c.state === 'ESTABLISHED');
    } else if (netStateFilter === 'listen') {
      filtered = filtered.filter(c => c.state === 'LISTEN');
    } else if (netStateFilter === 'outbound') {
      filtered = filtered.filter(c => c.direction === 'outbound');
    }
    if (netCategoryFilter !== 'all') {
      filtered = filtered.filter(c => c.category === netCategoryFilter);
    }
    if (netRiskFilter !== 'all') {
      filtered = filtered.filter(c => c.risk === netRiskFilter);
    }
    if (q) {
      filtered = filtered.filter(c =>
        c.command.toLowerCase().includes(q) ||
        (c.appName || '').toLowerCase().includes(q) ||
        String(c.pid).includes(q) ||
        c.local.toLowerCase().includes(q) ||
        c.remote.toLowerCase().includes(q) ||
        (c.node || '').toLowerCase().includes(q) ||
        (c.desc || '').toLowerCase().includes(q)
      );
    }

    renderNetGroups(filtered);
    document.getElementById('net-count-badge').textContent =
      `${filtered.length} / ${networkData.length} ${t('connections')}`;
  }

  document.getElementById('net-search').addEventListener('input', applyNetFilters);

  // Category filter
  toolbar.querySelectorAll('.filter-btn[data-cat]').forEach(btn => {
    btn.addEventListener('click', () => {
      toolbar.querySelectorAll('.filter-btn[data-cat]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      netCategoryFilter = btn.dataset.cat;
      applyNetFilters();
    });
  });

  // Risk + state filter
  bindNetRiskToolbar(riskToolbar, applyNetFilters);

  // Initial render
  renderNetGroups(networkData);

  // Async codesign
  const seen = new Set();
  const commands = [];
  for (const p of networkData) {
    if (seen.has(p.pid)) continue;
    seen.add(p.pid);
    commands.push({ pid: p.pid, command: p.fullCommand || p.command });
  }

  if (commands.length > 0) {
    const csResult = await window.imacos.checkCodesignBatch(commands);
    if (csResult.ok) {
      let updated = false;
      for (const conn of networkData) {
        const cs = csResult.data[conn.pid];
        if (cs) {
          conn.codesign = cs;
          const assessed = assessCodesignRisk(cs);
          conn.risk = assessed.risk;
          conn.riskLabel = assessed.label;
          conn.riskReason = assessed.reason;
          updated = true;
        }
      }
      if (updated) {
        const newRiskCounts = {};
        networkData.forEach(p => { newRiskCounts[p.risk] = (newRiskCounts[p.risk] || 0) + 1; });
        riskToolbar.innerHTML = buildNetRiskToolbar(newRiskCounts);
        bindNetRiskToolbar(riskToolbar, applyNetFilters);
        applyNetFilters();
      }
    }
  }
}

// Risk priority for sorting groups (higher = worse)
const RISK_PRIORITY = { danger: 3, warning: 2, info: 1, safe: 0 };

function getGroupRisk(connections) {
  let worst = 'safe';
  let worstRow = connections[0];
  for (const c of connections) {
    if ((RISK_PRIORITY[c.risk] || 0) > (RISK_PRIORITY[worst] || 0)) {
      worst = c.risk;
      worstRow = c;
    }
  }
  return { level: worst, row: worstRow };
}

function renderNetGroups(filtered) {
  const container = document.getElementById('net-group-container');
  container.innerHTML = '';

  // Group by appName
  const groupMap = new Map();
  for (const conn of filtered) {
    const key = conn.appName || conn.command;
    if (!groupMap.has(key)) {
      groupMap.set(key, []);
    }
    groupMap.get(key).push(conn);
  }

  // Sort groups: warning first, then by connection count desc
  const groups = [...groupMap.entries()].sort((a, b) => {
    const ra = getGroupRisk(a[1]), rb = getGroupRisk(b[1]);
    const riskDiff = (RISK_PRIORITY[rb.level] || 0) - (RISK_PRIORITY[ra.level] || 0);
    if (riskDiff !== 0) return riskDiff;
    return b[1].length - a[1].length;
  });

  for (const [appName, connections] of groups) {
    const card = buildNetGroupCard(appName, connections);
    container.appendChild(card);
  }
}

function buildNetGroupCard(appName, connections) {
  const card = document.createElement('div');
  card.className = 'port-group-card';

  const firstConn = connections[0];
  const groupRisk = getGroupRisk(connections);

  // Collect unique info
  const protocols = [...new Set(connections.map(c => c.node).filter(Boolean))];
  const remotes = new Set(connections.map(c => c.remote).filter(r => r && r !== '*:*'));
  const states = {};
  connections.forEach(c => { if (c.state) states[c.state] = (states[c.state] || 0) + 1; });
  const pids = [...new Set(connections.map(c => c.pid))];

  const desc = firstConn.desc ? `<span class="port-group-desc">${escapeHtml(firstConn.desc)}</span>` : '';

  const connLabel = connections.length > 1 ? t('conns') : t('conn');
  const remoteLabel = remotes.size !== 1 ? t('remotesCount') : t('remoteCount');

  const header = document.createElement('div');
  header.className = 'port-group-header';
  header.innerHTML = `
    <span class="port-group-arrow">&#9654;</span>
    <span class="port-group-name">${escapeHtml(appName)}</span>
    ${desc}
    <span class="port-group-tags">
      ${categoryTag(firstConn.category || 'unknown')}
      ${riskTag(groupRisk.level, groupRisk.row.riskLabel || groupRisk.level, groupRisk.row.riskReason || '', groupRisk.row)}
    </span>
    <span class="port-group-stats">
      ${connections.length} ${connLabel}
      &nbsp;&middot;&nbsp; ${protocols.join('/')}
      &nbsp;&middot;&nbsp; ${remotes.size} ${remoteLabel}
      ${pids.length > 1 ? `&nbsp;&middot;&nbsp; ${pids.length} PIDs` : `&nbsp;&middot;&nbsp; PID ${pids[0]}`}
    </span>
  `;

  card.appendChild(header);

  // Detail section (hidden by default)
  const detail = document.createElement('div');
  detail.className = 'port-group-detail';
  detail.style.display = 'none';
  card.appendChild(detail);

  header.addEventListener('click', (e) => {
    // Don't toggle if clicking risk tag
    if (e.target.closest('.risk-tag-clickable')) return;

    const isExpanded = card.classList.toggle('port-group-expanded');
    header.querySelector('.port-group-arrow').innerHTML = isExpanded ? '&#9660;' : '&#9654;';
    if (isExpanded) {
      detail.style.display = '';
      detail.innerHTML = buildNetDetailTable(connections);
    } else {
      detail.style.display = 'none';
      detail.innerHTML = '';
    }
  });

  return card;
}

function buildNetDetailTable(connections) {
  let html = `<table class="port-detail-table">
    <thead><tr>
      <th>${t('pid')}</th>
      <th>${t('protocol')}</th>
      <th>${t('local')}</th>
      <th>${t('remote')}</th>
      <th>${t('state')}</th>
      <th>${t('direction')}</th>
    </tr></thead><tbody>`;

  for (const c of connections) {
    const stateTag = c.state ? (() => {
      const cls = c.state === 'LISTEN' ? 'tag-listen'
        : c.state === 'ESTABLISHED' ? 'tag-established'
        : c.state.includes('CLOSE') ? 'tag-close-wait'
        : c.state.includes('TIME') ? 'tag-time-wait'
        : 'tag-other';
      return `<span class="tag ${cls}">${escapeHtml(c.state)}</span>`;
    })() : '';

    const dirTag = (() => {
      const cls = c.direction === 'outbound' ? 'tag-outbound' : 'tag-listen-dir';
      const label = c.direction === 'outbound' ? 'OUT' : 'LISTEN';
      return `<span class="tag ${cls}">${label}</span>`;
    })();

    html += `<tr>
      <td class="mono">${c.pid}</td>
      <td class="mono">${escapeHtml(c.node || '')}</td>
      <td class="mono">${escapeHtml(c.local || '')}</td>
      <td class="mono">${escapeHtml(c.remote || '')}</td>
      <td>${stateTag}</td>
      <td>${dirTag}</td>
    </tr>`;
  }

  html += '</tbody></table>';
  return html;
}

function buildNetRiskToolbar(riskCounts) {
  return `
    <span style="font-size:12px;color:var(--text-secondary);margin-right:4px;">${t('riskColon')}</span>
    <button class="filter-btn active" data-risk="all">${t('all')}</button>
    ${riskCounts.warning ? `<button class="filter-btn filter-btn-warning" data-risk="warning">${t('review')} (${riskCounts.warning})</button>` : ''}
    ${riskCounts.info ? `<button class="filter-btn" data-risk="info">${t('riskVerified')} (${riskCounts.info})</button>` : ''}
    ${riskCounts.safe ? `<button class="filter-btn" data-risk="safe">${t('riskSafe')} (${riskCounts.safe})</button>` : ''}
    <span style="margin-left:8px;border-left:1px solid var(--border);padding-left:8px;">
      <button class="filter-btn" data-state="all">${t('all')}</button>
      <button class="filter-btn" data-state="established">${t('established')}</button>
      <button class="filter-btn" data-state="listen">${t('listen')}</button>
      <button class="filter-btn" data-state="outbound">${t('outbound')}</button>
    </span>
  `;
}

function bindNetRiskToolbar(riskToolbar, applyFilters) {
  riskToolbar.querySelectorAll('.filter-btn[data-risk]').forEach(btn => {
    btn.addEventListener('click', () => {
      riskToolbar.querySelectorAll('.filter-btn[data-risk]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      netRiskFilter = btn.dataset.risk;
      applyFilters();
    });
  });

  riskToolbar.querySelectorAll('.filter-btn[data-state]').forEach(btn => {
    btn.addEventListener('click', () => {
      riskToolbar.querySelectorAll('.filter-btn[data-state]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      netStateFilter = btn.dataset.state;
      applyFilters();
    });
  });
}
