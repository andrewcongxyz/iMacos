let portData = [];
let showListenOnly = false;
let portCategoryFilter = 'all';
let portRiskFilter = 'all';
let portGroupContainer = null;

async function loadPorts() {
  const panel = document.getElementById('tab-ports');
  showLoading(panel);

  const result = await window.imacos.getPorts();
  if (!result.ok) {
    panel.innerHTML = `<div class="loading">${t('error')}: ${escapeHtml(result.error)}</div>`;
    return;
  }

  portData = result.data;
  showListenOnly = false;
  portCategoryFilter = 'all';
  portRiskFilter = 'all';
  panel.innerHTML = '';

  // Count by category
  const catCounts = {};
  portData.forEach(p => { catCounts[p.category] = (catCounts[p.category] || 0) + 1; });

  const riskCounts = {};
  portData.forEach(p => { riskCounts[p.risk] = (riskCounts[p.risk] || 0) + 1; });

  // Toolbar - search + category
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  toolbar.innerHTML = `
    <input type="text" class="search-input" placeholder="${t('searchPorts')}" id="port-search">
    <button class="filter-btn active" data-cat="all">${t('all')}</button>
    <button class="filter-btn" data-cat="system">${t('catSystem')} ${catCounts.system ? '(' + catCounts.system + ')' : ''}</button>
    <button class="filter-btn" data-cat="apple">${t('catApple')} ${catCounts.apple ? '(' + catCounts.apple + ')' : ''}</button>
    <button class="filter-btn" data-cat="app">${t('catApp')} ${catCounts.app ? '(' + catCounts.app + ')' : ''}</button>
    <button class="filter-btn" data-cat="dev">${t('catDev')} ${catCounts.dev ? '(' + catCounts.dev + ')' : ''}</button>
    ${catCounts.unknown ? `<button class="filter-btn" data-cat="unknown">${t('catUnknown')} (${catCounts.unknown})</button>` : ''}
    <span class="count-badge">${portData.length} ${t('connections')}</span>
  `;
  panel.appendChild(toolbar);

  // Risk + state filter toolbar
  const riskToolbar = document.createElement('div');
  riskToolbar.className = 'toolbar risk-toolbar';
  riskToolbar.id = 'port-risk-toolbar';
  riskToolbar.innerHTML = buildPortRiskToolbar(riskCounts);
  panel.appendChild(riskToolbar);

  // Group container
  portGroupContainer = document.createElement('div');
  portGroupContainer.className = 'port-groups';
  panel.appendChild(portGroupContainer);

  function applyFilters() {
    const q = (document.getElementById('port-search')?.value || '').toLowerCase();
    let filtered = portData;

    if (showListenOnly) {
      filtered = filtered.filter(c => c.state === 'LISTEN');
    }
    if (portCategoryFilter !== 'all') {
      filtered = filtered.filter(c => c.category === portCategoryFilter);
    }
    if (portRiskFilter !== 'all') {
      filtered = filtered.filter(c => c.risk === portRiskFilter);
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

    renderPortGroups(filtered);
    toolbar.querySelector('.count-badge').textContent = `${filtered.length} / ${portData.length} ${t('connections')}`;
  }

  document.getElementById('port-search').addEventListener('input', applyFilters);

  // Category filter
  toolbar.querySelectorAll('.filter-btn[data-cat]').forEach(btn => {
    btn.addEventListener('click', () => {
      toolbar.querySelectorAll('.filter-btn[data-cat]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      portCategoryFilter = btn.dataset.cat;
      applyFilters();
    });
  });

  // Risk + LISTEN filter
  bindPortRiskToolbar(riskToolbar, applyFilters);

  // Initial render
  renderPortGroups(portData);

  // Async codesign
  const seen = new Set();
  const commands = [];
  for (const p of portData) {
    if (seen.has(p.pid)) continue;
    seen.add(p.pid);
    commands.push({ pid: p.pid, command: p.fullCommand || p.command });
  }

  if (commands.length > 0) {
    const csResult = await window.imacos.checkCodesignBatch(commands);
    if (csResult.ok) {
      let updated = false;
      for (const conn of portData) {
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
        portData.forEach(p => { newRiskCounts[p.risk] = (newRiskCounts[p.risk] || 0) + 1; });
        riskToolbar.innerHTML = buildPortRiskToolbar(newRiskCounts);
        bindPortRiskToolbar(riskToolbar, applyFilters);
        applyFilters();
      }
    }
  }
}

function groupByApp(data) {
  const groups = new Map();
  const riskPriority = { warning: 3, danger: 4, info: 2, safe: 1 };

  for (const conn of data) {
    const key = conn.appName || conn.command;
    if (!groups.has(key)) {
      groups.set(key, {
        appName: key,
        category: conn.category,
        desc: conn.desc,
        connections: [],
        listenCount: 0,
        establishedCount: 0,
        maxRisk: 'safe',
        maxRiskLabel: t('riskSafe'),
        maxRiskReason: '',
        riskRow: conn,
      });
    }
    const g = groups.get(key);
    g.connections.push(conn);
    if (conn.state === 'LISTEN') g.listenCount++;
    if (conn.state === 'ESTABLISHED') g.establishedCount++;

    const connPri = riskPriority[conn.risk] || 1;
    const curPri = riskPriority[g.maxRisk] || 1;
    if (connPri > curPri) {
      g.maxRisk = conn.risk;
      g.maxRiskLabel = conn.riskLabel || conn.risk;
      g.maxRiskReason = conn.riskReason || '';
      g.riskRow = conn;
    }
  }

  // Sort: connection count descending
  return Array.from(groups.values()).sort((a, b) => b.connections.length - a.connections.length);
}

function renderPortGroups(filtered) {
  if (!portGroupContainer) return;
  portGroupContainer.innerHTML = '';

  const groups = groupByApp(filtered);

  for (const group of groups) {
    const card = document.createElement('div');
    card.className = 'port-group-card';

    // Header
    const header = document.createElement('div');
    header.className = 'port-group-header';

    const arrow = document.createElement('span');
    arrow.className = 'port-group-arrow';
    arrow.textContent = '\u25B6';

    const appName = document.createElement('span');
    appName.className = 'port-group-name';
    appName.textContent = group.appName;

    const tags = document.createElement('span');
    tags.className = 'port-group-tags';
    tags.innerHTML = `
      ${categoryTag(group.category || 'unknown')}
      ${riskTag(group.maxRisk || 'warning', group.maxRiskLabel || t('review'), group.maxRiskReason || '', group.riskRow)}
    `;

    const stats = document.createElement('span');
    stats.className = 'port-group-stats';
    const connLabel = group.connections.length > 1 ? t('conns') : t('conn');
    const parts = [`${group.connections.length} ${connLabel}`];
    if (group.listenCount > 0) parts.push(`${group.listenCount} LISTEN`);
    if (group.establishedCount > 0) parts.push(`${group.establishedCount} ESTAB`);
    stats.textContent = parts.join(' \u00B7 ');

    header.appendChild(arrow);
    header.appendChild(appName);
    if (group.desc) {
      const descSpan = document.createElement('span');
      descSpan.className = 'port-group-desc';
      descSpan.textContent = group.desc;
      header.appendChild(descSpan);
    }
    header.appendChild(tags);
    header.appendChild(stats);

    card.appendChild(header);

    // Detail (hidden by default)
    const detail = document.createElement('div');
    detail.className = 'port-group-detail';
    detail.style.display = 'none';

    // Sort connections: LISTEN first, then ESTABLISHED, then others
    const stateOrder = { LISTEN: 0, ESTABLISHED: 1 };
    group.connections.sort((a, b) => {
      const oa = stateOrder[a.state] ?? 2;
      const ob = stateOrder[b.state] ?? 2;
      return oa - ob;
    });

    const table = document.createElement('table');
    table.className = 'port-detail-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th>${t('pid')}</th>
          <th>${t('user')}</th>
          <th>${t('protocol')}</th>
          <th>${t('localAddress')}</th>
          <th>${t('remoteAddress')}</th>
          <th>${t('state')}</th>
          <th>${t('risk')}</th>
        </tr>
      </thead>
    `;
    const tbody = document.createElement('tbody');
    for (const conn of group.connections) {
      const tr = document.createElement('tr');
      const stateHtml = renderStateTag(conn.state);
      const riskHtml = riskTag(conn.risk || 'warning', conn.riskLabel || t('review'), conn.riskReason || '', conn);
      tr.innerHTML = `
        <td class="mono">${escapeHtml(String(conn.pid))}</td>
        <td>${escapeHtml(conn.user || '')}</td>
        <td class="mono">${escapeHtml(conn.node || '')}</td>
        <td class="mono">${escapeHtml(conn.local || '')}</td>
        <td class="mono">${escapeHtml(conn.remote || '')}</td>
        <td>${stateHtml}</td>
        <td>${riskHtml}</td>
      `;
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    detail.appendChild(table);
    card.appendChild(detail);

    // Toggle expand/collapse
    header.addEventListener('click', (e) => {
      // Don't toggle if clicking on risk tag
      if (e.target.closest('.risk-tag-clickable')) return;

      const isExpanded = card.classList.toggle('port-group-expanded');
      arrow.textContent = isExpanded ? '\u25BC' : '\u25B6';
      detail.style.display = isExpanded ? 'block' : 'none';
    });

    portGroupContainer.appendChild(card);
  }
}

function renderStateTag(state) {
  if (!state) return '';
  const tag = state === 'LISTEN' ? 'tag-listen'
    : state === 'ESTABLISHED' ? 'tag-established'
    : state.includes('CLOSE') ? 'tag-close-wait'
    : state.includes('TIME') ? 'tag-time-wait'
    : 'tag-other';
  return `<span class="tag ${tag}">${escapeHtml(state)}</span>`;
}

function buildPortRiskToolbar(riskCounts) {
  return `
    <span style="font-size:12px;color:var(--text-secondary);margin-right:4px;">${t('riskColon')}</span>
    <button class="filter-btn active" data-risk="all">${t('all')}</button>
    ${riskCounts.warning ? `<button class="filter-btn filter-btn-warning" data-risk="warning">${t('review')} (${riskCounts.warning})</button>` : ''}
    ${riskCounts.info ? `<button class="filter-btn" data-risk="info">${t('riskVerified')} (${riskCounts.info})</button>` : ''}
    ${riskCounts.safe ? `<button class="filter-btn" data-risk="safe">${t('riskSafe')} (${riskCounts.safe})</button>` : ''}
    <span style="margin-left:8px;border-left:1px solid var(--border);padding-left:8px;">
      <button class="filter-btn" id="port-listen-filter">${t('listenOnly')}</button>
    </span>
  `;
}

function bindPortRiskToolbar(riskToolbar, applyFilters) {
  riskToolbar.querySelectorAll('.filter-btn[data-risk]').forEach(btn => {
    btn.addEventListener('click', () => {
      riskToolbar.querySelectorAll('.filter-btn[data-risk]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      portRiskFilter = btn.dataset.risk;
      applyFilters();
    });
  });

  const listenBtn = riskToolbar.querySelector('#port-listen-filter');
  if (listenBtn) {
    if (showListenOnly) listenBtn.classList.add('active');
    listenBtn.addEventListener('click', () => {
      showListenOnly = !showListenOnly;
      listenBtn.classList.toggle('active', showListenOnly);
      applyFilters();
    });
  }
}
