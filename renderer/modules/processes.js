// Shared codesign risk assessment (used by processes, ports, network)
function assessCodesignRisk(cs) {
  if (cs.apple) {
    return { risk: 'safe', label: t('riskSafe'), reason: `Apple signed: ${cs.developer}` };
  }
  if (cs.adhoc) {
    return { risk: 'warning', label: t('riskAdhoc'), reason: 'Ad-hoc signature (self-signed, not Apple notarized)' };
  }
  if (cs.signed && cs.teamId) {
    return { risk: 'info', label: t('riskVerified'), reason: `Signed by: ${cs.developer} (${cs.teamId})` };
  }
  if (cs.signed && cs.authorities.length > 0) {
    return { risk: 'info', label: t('riskSigned'), reason: `Signed: ${cs.developer || 'yes'}` };
  }
  if (cs.signed) {
    return { risk: 'warning', label: t('riskAdhoc'), reason: 'Signed without developer identity (ad-hoc)' };
  }
  return { risk: 'warning', label: t('riskUnsigned'), reason: 'No code signature found' };
}

let processTable = null;
let processData = [];
let procCategoryFilter = 'all';
let procRiskFilter = 'all';

function categoryTag(category) {
  const map = {
    system: { cls: 'tag-system', key: 'catSystem' },
    apple: { cls: 'tag-apple', key: 'catApple' },
    app: { cls: 'tag-app', key: 'catApp' },
    dev: { cls: 'tag-dev', key: 'catDev' },
    unknown: { cls: 'tag-unknown', key: 'catUnknown' },
  };
  const info = map[category] || map.unknown;
  return `<span class="tag ${info.cls}">${t(info.key)}</span>`;
}

// Global store for popup data (avoids HTML attribute escaping issues)
const _riskPopupStore = [];

function riskTag(level, label, reason, row) {
  const map = {
    safe: { cls: 'tag-risk-safe', icon: '&#10003;', titleKey: 'riskSafe', descKey: 'riskSafePopup' },
    info: { cls: 'tag-risk-info', icon: '&#9432;', titleKey: 'riskVerified', descKey: 'riskVerifiedPopup' },
    warning: { cls: 'tag-risk-warning', icon: '&#9888;', titleKey: 'riskReview', descKey: 'riskReviewPopup' },
    danger: { cls: 'tag-risk-danger', icon: '&#9888;', titleKey: 'riskWarning', descKey: 'riskWarningPopup' },
  };
  const info = map[level] || map.warning;
  const idx = _riskPopupStore.length;
  _riskPopupStore.push({
    level,
    title: t(info.titleKey),
    label: label || level,
    reason: reason || '',
    appName: row?.appName || '',
    desc: row?.desc || '',
    pid: row?.pid || '',
    user: row?.user || '',
    command: row?.fullCommand || row?.command || '',
    category: row?.category || '',
    codesign: row?.codesign || null,
  });
  return `<span class="tag ${info.cls} risk-tag-clickable" data-ridx="${idx}">${info.icon} ${escapeHtml(label || level)}</span>`;
}

// Global popup handler
document.addEventListener('click', (e) => {
  const existing = document.querySelector('.risk-popup-overlay');
  if (existing) {
    if (e.target === existing || e.target.closest('.risk-popup-close')) {
      existing.remove();
      return;
    }
  }

  const tag = e.target.closest('.risk-tag-clickable');
  if (!tag) return;

  const idx = parseInt(tag.dataset.ridx);
  const data = _riskPopupStore[idx];
  if (data) showRiskPopup(data);
});

function showRiskPopup(data) {
  // Remove existing popup
  const existing = document.querySelector('.risk-popup-overlay');
  if (existing) existing.remove();

  const levelMap = {
    safe: { color: 'var(--success)', bg: 'rgba(0, 212, 170, 0.1)', icon: '&#10003;' },
    info: { color: '#60a5fa', bg: 'rgba(59, 130, 246, 0.1)', icon: '&#9432;' },
    warning: { color: 'var(--warning)', bg: 'rgba(245, 166, 35, 0.1)', icon: '&#9888;' },
    danger: { color: 'var(--danger)', bg: 'rgba(233, 69, 96, 0.1)', icon: '&#9888;' },
  };
  const style = levelMap[data.level] || levelMap.warning;

  let codesignHtml = '';
  if (data.codesign) {
    const cs = data.codesign;

    // Authority chain
    let chainHtml = '';
    if (cs.authorities && cs.authorities.length > 0) {
      chainHtml = `<div class="risk-popup-row">
        <span class="risk-popup-label">${t('trustChain')}</span>
        <div class="risk-popup-value codesign-chain">
          ${cs.authorities.map((a, i) => {
            const indent = i > 0 ? `<span class="chain-arrow">&#8627;</span>` : '';
            const color = a.includes('Apple Root') ? 'var(--success)' : a.includes('Apple') ? '#c084fc' : 'var(--text)';
            return `<div class="chain-item" style="padding-left:${i * 12}px">${indent}<span style="color:${color}">${escapeHtml(a)}</span></div>`;
          }).join('')}
        </div>
      </div>`;
    }

    codesignHtml = `
      <div class="risk-popup-section">
        <div class="risk-popup-section-title">${t('codeSignature')}</div>
        <div class="risk-popup-row">
          <span class="risk-popup-label">${t('status')}</span>
          <span class="risk-popup-value">${cs.signed ? `<span class="codesign-badge codesign-signed">${t('signed')}</span>` : `<span class="codesign-badge codesign-unsigned">${t('unsigned')}</span>`}</span>
        </div>
        ${cs.identifier ? `<div class="risk-popup-row">
          <span class="risk-popup-label">${t('identifier')}</span>
          <span class="risk-popup-value mono">${escapeHtml(cs.identifier)}</span>
        </div>` : ''}
        ${cs.teamId ? `<div class="risk-popup-row">
          <span class="risk-popup-label">${t('teamId')}</span>
          <span class="risk-popup-value mono">${escapeHtml(cs.teamId)}</span>
        </div>` : ''}
        ${cs.format ? `<div class="risk-popup-row">
          <span class="risk-popup-label">${t('format')}</span>
          <span class="risk-popup-value">${escapeHtml(cs.format)}</span>
        </div>` : ''}
        ${cs.signedTime ? `<div class="risk-popup-row">
          <span class="risk-popup-label">${t('signedTime')}</span>
          <span class="risk-popup-value">${escapeHtml(cs.signedTime)}</span>
        </div>` : ''}
        ${cs.platform ? `<div class="risk-popup-row">
          <span class="risk-popup-label">${t('platform')}</span>
          <span class="risk-popup-value">${escapeHtml(cs.platform)}</span>
        </div>` : ''}
        ${cs.flags ? `<div class="risk-popup-row">
          <span class="risk-popup-label">${t('flags')}</span>
          <span class="risk-popup-value mono">${escapeHtml(cs.flags)}</span>
        </div>` : ''}
        ${chainHtml}
        ${cs.execPath ? `<div class="risk-popup-row">
          <span class="risk-popup-label">${t('executable')}</span>
          <span class="risk-popup-value mono risk-popup-cmd">${escapeHtml(cs.execPath)}</span>
        </div>` : ''}
      </div>`;
  } else {
    codesignHtml = `
      <div class="risk-popup-section">
        <div class="risk-popup-section-title">${t('codeSignature')}</div>
        <div class="risk-popup-row">
          <span class="risk-popup-label">${t('status')}</span>
          <span class="risk-popup-value"><span class="codesign-badge codesign-na">${t('notChecked')}</span></span>
        </div>
      </div>`;
  }

  const overlay = document.createElement('div');
  overlay.className = 'risk-popup-overlay';
  overlay.innerHTML = `
    <div class="risk-popup">
      <button class="risk-popup-close">&times;</button>
      <div class="risk-popup-header" style="background:${style.bg};border-left:3px solid ${style.color}">
        <span class="risk-popup-icon" style="color:${style.color}">${style.icon}</span>
        <div>
          <div class="risk-popup-title" style="color:${style.color}">${escapeHtml(data.label)}</div>
          <div class="risk-popup-reason">${escapeHtml(data.reason)}</div>
        </div>
      </div>
      <div class="risk-popup-section">
        <div class="risk-popup-section-title">${t('processInfo')}</div>
        <div class="risk-popup-row">
          <span class="risk-popup-label">${t('application')}</span>
          <span class="risk-popup-value">${escapeHtml(data.appName)}</span>
        </div>
        ${data.desc ? `<div class="risk-popup-row">
          <span class="risk-popup-label">${t('description')}</span>
          <span class="risk-popup-value" style="color:var(--text-secondary)">${escapeHtml(data.desc)}</span>
        </div>` : ''}
        <div class="risk-popup-row">
          <span class="risk-popup-label">${t('category')}</span>
          <span class="risk-popup-value">${categoryTag(data.category)}</span>
        </div>
        <div class="risk-popup-row">
          <span class="risk-popup-label">${t('pid')}</span>
          <span class="risk-popup-value mono">${data.pid}</span>
        </div>
        <div class="risk-popup-row">
          <span class="risk-popup-label">${t('user')}</span>
          <span class="risk-popup-value">${escapeHtml(data.user)}</span>
        </div>
        <div class="risk-popup-row">
          <span class="risk-popup-label">${t('command')}</span>
          <span class="risk-popup-value mono risk-popup-cmd">${escapeHtml(data.command)}</span>
        </div>
      </div>
      ${codesignHtml}
      <div class="risk-popup-legend">
        <div class="risk-popup-section-title">${t('riskLevels')}</div>
        <div class="risk-popup-legend-item"><span class="tag tag-risk-safe">&#10003; ${t('riskSafe')}</span> ${t('riskSafeDesc')}</div>
        <div class="risk-popup-legend-item"><span class="tag tag-risk-info">&#9432; ${t('riskVerified')}</span> ${t('riskVerifiedDesc')}</div>
        <div class="risk-popup-legend-item"><span class="tag tag-risk-warning">&#9888; ${t('riskReview')}</span> ${t('riskReviewDesc')}</div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
}

const PROC_RISK_PRIORITY = { danger: 3, warning: 2, info: 1, safe: 0 };

function getProcGroupRisk(procs) {
  let worst = 'safe';
  let worstRow = procs[0];
  for (const p of procs) {
    if ((PROC_RISK_PRIORITY[p.risk] || 0) > (PROC_RISK_PRIORITY[worst] || 0)) {
      worst = p.risk;
      worstRow = p;
    }
  }
  return { level: worst, row: worstRow };
}

function renderProcGroups(filtered) {
  const container = document.getElementById('proc-group-container');
  container.innerHTML = '';

  // Group by appName
  const groupMap = new Map();
  for (const proc of filtered) {
    const key = proc.appName || proc.command;
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key).push(proc);
  }

  // Sort: warning first, then by total CPU desc
  const groups = [...groupMap.entries()].sort((a, b) => {
    const ra = getProcGroupRisk(a[1]), rb = getProcGroupRisk(b[1]);
    const riskDiff = (PROC_RISK_PRIORITY[rb.level] || 0) - (PROC_RISK_PRIORITY[ra.level] || 0);
    if (riskDiff !== 0) return riskDiff;
    const cpuA = a[1].reduce((s, p) => s + (p.cpu || 0), 0);
    const cpuB = b[1].reduce((s, p) => s + (p.cpu || 0), 0);
    return cpuB - cpuA;
  });

  for (const [appName, procs] of groups) {
    container.appendChild(buildProcGroupCard(appName, procs));
  }
}

function buildProcGroupCard(appName, procs) {
  const card = document.createElement('div');
  card.className = 'port-group-card';

  const firstProc = procs[0];
  const groupRisk = getProcGroupRisk(procs);
  const totalCpu = procs.reduce((s, p) => s + (p.cpu || 0), 0);
  const totalMem = procs.reduce((s, p) => s + (p.mem || 0), 0);
  const pids = procs.map(p => p.pid);

  const desc = firstProc.desc ? `<span class="port-group-desc">${escapeHtml(firstProc.desc)}</span>` : '';
  const cpuCls = totalCpu > 50 ? 'highlight-cpu' : '';
  const memCls = totalMem > 20 ? 'highlight-mem' : '';

  const procLabel = procs.length > 1 ? t('procs') : t('proc');

  const header = document.createElement('div');
  header.className = 'port-group-header';
  header.innerHTML = `
    <span class="port-group-arrow">&#9654;</span>
    <span class="port-group-name">${escapeHtml(appName)}</span>
    ${desc}
    <span class="port-group-tags">
      ${categoryTag(firstProc.category || 'unknown')}
      ${riskTag(groupRisk.level, groupRisk.row.riskLabel || groupRisk.level, groupRisk.row.riskReason || '', groupRisk.row)}
    </span>
    <span class="port-group-stats">
      ${procs.length} ${procLabel}
      &nbsp;&middot;&nbsp; <span class="${cpuCls}">CPU ${totalCpu.toFixed(1)}%</span>
      &nbsp;&middot;&nbsp; <span class="${memCls}">MEM ${totalMem.toFixed(1)}%</span>
      ${procs.length === 1 ? `&nbsp;&middot;&nbsp; PID ${pids[0]}` : `&nbsp;&middot;&nbsp; ${pids.length} PIDs`}
    </span>
  `;
  card.appendChild(header);

  const detail = document.createElement('div');
  detail.className = 'port-group-detail';
  detail.style.display = 'none';
  card.appendChild(detail);

  header.addEventListener('click', (e) => {
    if (e.target.closest('.risk-tag-clickable')) return;
    const isExpanded = card.classList.toggle('port-group-expanded');
    header.querySelector('.port-group-arrow').innerHTML = isExpanded ? '&#9660;' : '&#9654;';
    if (isExpanded) {
      detail.style.display = '';
      detail.innerHTML = buildProcDetailTable(procs);
    } else {
      detail.style.display = 'none';
      detail.innerHTML = '';
    }
  });

  return card;
}

function buildProcDetailTable(procs) {
  let html = `<table class="port-detail-table">
    <thead><tr>
      <th>${t('pid')}</th>
      <th>${t('user')}</th>
      <th>%CPU</th>
      <th>%MEM</th>
      <th>${t('started')}</th>
      <th>${t('command')}</th>
    </tr></thead><tbody>`;

  for (const p of procs) {
    const cpuCls = p.cpu > 50 ? 'mono highlight-cpu' : 'mono';
    const memCls = p.mem > 20 ? 'mono highlight-mem' : 'mono';
    html += `<tr>
      <td class="mono">${p.pid}</td>
      <td>${escapeHtml(p.user || '')}</td>
      <td class="${cpuCls}">${(p.cpu || 0).toFixed(1)}</td>
      <td class="${memCls}">${(p.mem || 0).toFixed(1)}</td>
      <td>${escapeHtml(p.started || '')}</td>
      <td class="mono" title="${escapeHtml(p.fullCommand || p.command)}">${escapeHtml(p.fullCommand || p.command)}</td>
    </tr>`;
  }

  html += '</tbody></table>';
  return html;
}

function buildProcRiskToolbar(riskCounts) {
  return `
    <span style="font-size:12px;color:var(--text-secondary);margin-right:4px;">${t('riskColon')}</span>
    <button class="filter-btn active" data-risk="all">${t('all')}</button>
    ${riskCounts.warning ? `<button class="filter-btn filter-btn-warning" data-risk="warning">${t('riskReview')} (${riskCounts.warning})</button>` : ''}
    ${riskCounts.info ? `<button class="filter-btn" data-risk="info">${t('riskVerified')} (${riskCounts.info})</button>` : ''}
    ${riskCounts.safe ? `<button class="filter-btn" data-risk="safe">${t('riskSafe')} (${riskCounts.safe})</button>` : ''}
  `;
}

function bindProcRiskToolbar(riskToolbar, applyFilters) {
  riskToolbar.querySelectorAll('.filter-btn[data-risk]').forEach(btn => {
    btn.addEventListener('click', () => {
      riskToolbar.querySelectorAll('.filter-btn[data-risk]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      procRiskFilter = btn.dataset.risk;
      applyFilters();
    });
  });
}

async function loadProcesses() {
  const panel = document.getElementById('tab-processes');
  showLoading(panel);

  const result = await window.imacos.getProcesses();
  if (!result.ok) {
    panel.innerHTML = `<div class="loading">${t('error')}: ${escapeHtml(result.error)}</div>`;
    return;
  }

  processData = result.data;
  procCategoryFilter = 'all';
  procRiskFilter = 'all';
  panel.innerHTML = '';

  // Count by category
  const counts = {};
  processData.forEach(p => { counts[p.category] = (counts[p.category] || 0) + 1; });

  // Count by risk
  const riskCounts = {};
  processData.forEach(p => { riskCounts[p.risk] = (riskCounts[p.risk] || 0) + 1; });

  // Toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  toolbar.innerHTML = `
    <input type="text" class="search-input" placeholder="${t('searchProcesses')}" id="proc-search">
    <button class="filter-btn active" data-cat="all">${t('all')}</button>
    <button class="filter-btn" data-cat="system">${t('catSystem')} ${counts.system ? '(' + counts.system + ')' : ''}</button>
    <button class="filter-btn" data-cat="apple">${t('catApple')} ${counts.apple ? '(' + counts.apple + ')' : ''}</button>
    <button class="filter-btn" data-cat="app">${t('catApp')} ${counts.app ? '(' + counts.app + ')' : ''}</button>
    <button class="filter-btn" data-cat="dev">${t('catDev')} ${counts.dev ? '(' + counts.dev + ')' : ''}</button>
    <button class="filter-btn" data-cat="unknown">${t('catUnknown')} ${counts.unknown ? '(' + counts.unknown + ')' : ''}</button>
    <span class="count-badge" id="proc-count-badge">${processData.length} ${t('processes')}</span>
  `;
  panel.appendChild(toolbar);

  // Risk filter toolbar
  const riskToolbar = document.createElement('div');
  riskToolbar.className = 'toolbar risk-toolbar';
  riskToolbar.innerHTML = buildProcRiskToolbar(riskCounts);
  panel.appendChild(riskToolbar);

  // Group container
  const groupContainer = document.createElement('div');
  groupContainer.className = 'port-groups';
  groupContainer.id = 'proc-group-container';
  panel.appendChild(groupContainer);

  function applyProcFilters() {
    const q = (document.getElementById('proc-search')?.value || '').toLowerCase();
    let filtered = processData;

    if (procCategoryFilter !== 'all') {
      filtered = filtered.filter(p => p.category === procCategoryFilter);
    }
    if (procRiskFilter !== 'all') {
      filtered = filtered.filter(p => p.risk === procRiskFilter);
    }
    if (q) {
      filtered = filtered.filter(p =>
        p.appName.toLowerCase().includes(q) ||
        p.command.toLowerCase().includes(q) ||
        String(p.pid).includes(q) ||
        p.user.toLowerCase().includes(q) ||
        (p.desc || '').toLowerCase().includes(q) ||
        (p.riskReason || '').toLowerCase().includes(q)
      );
    }

    renderProcGroups(filtered);
    document.getElementById('proc-count-badge').textContent =
      `${filtered.length} / ${processData.length} ${t('processes')}`;
  }

  document.getElementById('proc-search').addEventListener('input', applyProcFilters);

  toolbar.querySelectorAll('.filter-btn[data-cat]').forEach(btn => {
    btn.addEventListener('click', () => {
      toolbar.querySelectorAll('.filter-btn[data-cat]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      procCategoryFilter = btn.dataset.cat;
      applyProcFilters();
    });
  });

  bindProcRiskToolbar(riskToolbar, applyProcFilters);

  // Initial render
  renderProcGroups(processData);

  // Async codesign
  loadCodesignAsync(processData, riskToolbar, applyProcFilters);
}

async function loadCodesignAsync(data, riskToolbar, applyFilters) {
  const seen = new Set();
  const commands = [];
  for (const p of data) {
    if (seen.has(p.pid)) continue;
    seen.add(p.pid);
    commands.push({ pid: p.pid, command: p.fullCommand || p.command });
  }

  if (commands.length === 0) return;

  const result = await window.imacos.checkCodesignBatch(commands);
  if (!result.ok) return;

  const csData = result.data;
  let updated = false;

  for (const proc of data) {
    const cs = csData[proc.pid];
    if (cs) {
      proc.codesign = cs;
      const assessed = assessCodesignRisk(cs);
      proc.risk = assessed.risk;
      proc.riskLabel = assessed.label;
      proc.riskReason = assessed.reason;
      updated = true;

      for (let i = 0; i < _riskPopupStore.length; i++) {
        if (_riskPopupStore[i].pid === proc.pid) {
          _riskPopupStore[i].codesign = cs;
          _riskPopupStore[i].level = proc.risk;
          _riskPopupStore[i].label = proc.riskLabel;
          _riskPopupStore[i].reason = proc.riskReason;
        }
      }
    }
  }

  if (updated) {
    const riskCounts = {};
    data.forEach(p => { riskCounts[p.risk] = (riskCounts[p.risk] || 0) + 1; });
    riskToolbar.innerHTML = buildProcRiskToolbar(riskCounts);
    bindProcRiskToolbar(riskToolbar, applyFilters);
    applyFilters();
  }
}
