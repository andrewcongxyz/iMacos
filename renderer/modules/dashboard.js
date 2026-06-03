async function loadDashboard() {
  const panel = document.getElementById('tab-dashboard');
  showLoading(panel);

  const [secResult, infoResult, procResult, portResult, startupResult, extrasResult] = await Promise.all([
    window.imacos.getSecurityStatus(),
    window.imacos.getSystemInfo(),
    window.imacos.getProcesses(),
    window.imacos.getPorts(),
    window.imacos.getStartupItems(),
    window.imacos.getDashboardExtras(),
  ]);

  let html = '';

  // System info bar
  if (infoResult.ok) {
    const info = infoResult.data;
    html += `<div class="system-info">
      <span><strong>${info.ProductName || 'macOS'}</strong> ${info.ProductVersion || ''} (${info.BuildVersion || ''})</span>
      <span>${t('host')}: <strong>${info.Hostname || ''}</strong></span>
      <span>${t('uptime')}: <strong>${info.Uptime || ''}</strong></span>
    </div>`;
  }

  // === Stats row ===
  const procCount = procResult.ok ? procResult.data.length : '?';
  const portCount = portResult.ok ? portResult.data.filter(c => c.state === 'LISTEN').length : '?';
  const netCount = portResult.ok ? portResult.data.filter(c => c.state === 'ESTABLISHED').length : '?';
  const startupCount = startupResult.ok ? startupResult.data.length : '?';

  html += `<div class="stats-row">
    <div class="stat-card"><div class="stat-number">${procCount}</div><div class="stat-label">${t('runningProcesses')}</div></div>
    <div class="stat-card"><div class="stat-number">${portCount}</div><div class="stat-label">${t('listeningPorts')}</div></div>
    <div class="stat-card"><div class="stat-number">${netCount}</div><div class="stat-label">${t('activeConnections')}</div></div>
    <div class="stat-card"><div class="stat-number">${startupCount}</div><div class="stat-label">${t('startupItems')}</div></div>
  </div>`;

  // === Security Alerts ===
  if (procResult.ok) {
    const procs = procResult.data;
    const unsignedProcs = procs.filter(p => p.risk === 'warning' || p.category === 'unknown');
    const unsignedNet = portResult.ok
      ? portResult.data.filter(c => c.state === 'ESTABLISHED' && (c.risk === 'warning' || c.category === 'unknown'))
      : [];
    const adhocCount = procs.filter(p => p.riskLabel === 'Ad-hoc').length;

    if (unsignedProcs.length > 0 || unsignedNet.length > 0 || adhocCount > 0) {
      html += `<div class="section-title">${t('securityAlerts')}</div>`;
      html += '<div class="dashboard-grid">';

      if (unsignedProcs.length > 0) {
        html += `<div class="card card-alert">
          <div class="card-header">
            <span class="card-label">${t('unsignedProcesses')}</span>
            <span class="status-dot ${unsignedProcs.length > 5 ? 'red' : 'yellow'}"></span>
          </div>
          <div class="card-value">${unsignedProcs.length}</div>
          <div class="card-detail">${t('unsignedProcessesDetail')}</div>
        </div>`;
      }

      if (unsignedNet.length > 0) {
        html += `<div class="card card-alert">
          <div class="card-header">
            <span class="card-label">${t('unsignedNetConns')}</span>
            <span class="status-dot red"></span>
          </div>
          <div class="card-value">${unsignedNet.length}</div>
          <div class="card-detail">${t('unsignedNetConnsDetail')}</div>
        </div>`;
      }

      if (adhocCount > 0) {
        html += `<div class="card">
          <div class="card-header">
            <span class="card-label">${t('adhocProcesses')}</span>
            <span class="status-dot yellow"></span>
          </div>
          <div class="card-value">${adhocCount}</div>
          <div class="card-detail">${t('adhocProcessesDetail')}</div>
        </div>`;
      }

      html += '</div>';
    }
  }

  // === System Resources ===
  if (extrasResult.ok) {
    const extras = extrasResult.data;
    html += `<div class="section-title">${t('systemResources')}</div>`;
    html += '<div class="dashboard-grid">';

    // Disk
    if (extras.disk) {
      const d = extras.disk;
      const diskColor = d.percentUsed > 90 ? 'red' : d.percentUsed > 75 ? 'yellow' : 'green';
      html += `<div class="card">
        <div class="card-header">
          <span class="card-label">${t('diskUsage')}</span>
          <span class="status-dot ${diskColor}"></span>
        </div>
        <div class="card-value">${d.percentUsed}%</div>
        <div class="dash-bar"><div class="dash-bar-fill" style="width:${d.percentUsed}%;background:var(--${diskColor === 'red' ? 'danger' : diskColor === 'yellow' ? 'warning' : 'success'})"></div></div>
        <div class="card-detail">${d.used} ${t('used')} / ${d.total} ${t('total')} (${d.available} ${t('free')})</div>
      </div>`;
    }

    // Memory
    if (extras.memory) {
      const m = extras.memory;
      const memColor = m.percentUsed > 85 ? 'red' : m.percentUsed > 65 ? 'yellow' : 'green';
      html += `<div class="card">
        <div class="card-header">
          <span class="card-label">${t('memoryPressure')}</span>
          <span class="status-dot ${memColor}"></span>
        </div>
        <div class="card-value">${m.percentUsed}%</div>
        <div class="dash-bar"><div class="dash-bar-fill" style="width:${m.percentUsed}%;background:var(--${memColor === 'red' ? 'danger' : memColor === 'yellow' ? 'warning' : 'success'})"></div></div>
        <div class="card-detail">${m.used}G ${t('used')} / ${m.total}G ${t('total')} (Wired: ${m.wired}G, Compressed: ${m.compressed}G${m.swapUsedMB > 0 ? `, Swap: ${m.swapUsedMB}MB` : ''})</div>
      </div>`;
    }

    html += '</div>';
  }

  // === Top CPU & Memory Processes ===
  if (procResult.ok) {
    const procs = procResult.data;
    const topCpu = [...procs].sort((a, b) => b.cpu - a.cpu).slice(0, 5);
    const topMem = [...procs].sort((a, b) => b.mem - a.mem).slice(0, 5);

    html += `<div class="section-title">${t('resourceHogs')}</div>`;
    html += '<div class="dash-twin">';

    // Top CPU
    html += `<div class="dash-list-card"><div class="dash-list-title">${t('topCpuUsage')}</div>`;
    html += `<table class="dash-list-table"><thead><tr><th>${t('process')}</th><th>${t('pid')}</th><th>${t('cpuPercent')}</th></tr></thead><tbody>`;
    for (const p of topCpu) {
      const cpuCls = p.cpu > 50 ? 'highlight-cpu' : '';
      html += `<tr>
        <td><span class="proc-app-name">${escapeHtml(p.appName)}</span></td>
        <td class="mono">${p.pid}</td>
        <td class="mono ${cpuCls}">${p.cpu.toFixed(1)}%</td>
      </tr>`;
    }
    html += '</tbody></table></div>';

    // Top Memory
    html += `<div class="dash-list-card"><div class="dash-list-title">${t('topMemUsage')}</div>`;
    html += `<table class="dash-list-table"><thead><tr><th>${t('process')}</th><th>${t('pid')}</th><th>${t('memPercent')}</th></tr></thead><tbody>`;
    for (const p of topMem) {
      const memCls = p.mem > 20 ? 'highlight-mem' : '';
      html += `<tr>
        <td><span class="proc-app-name">${escapeHtml(p.appName)}</span></td>
        <td class="mono">${p.pid}</td>
        <td class="mono ${memCls}">${p.mem.toFixed(1)}%</td>
      </tr>`;
    }
    html += '</tbody></table></div>';

    html += '</div>';
  }

  // === Security Status ===
  html += `<div class="section-title">${t('securityStatus')}</div>`;
  html += '<div class="dashboard-grid">';

  if (secResult.ok) {
    const checks = secResult.data;
    for (const [key, check] of Object.entries(checks)) {
      const dotClass = check.ok ? 'green' : (check.status === 'error' || check.status === 'unknown' ? 'yellow' : 'red');
      html += `<div class="card">
        <div class="card-header">
          <span class="card-label">${escapeHtml(check.label)}</span>
          <span class="status-dot ${dotClass}"></span>
        </div>
        <div class="card-value">${escapeHtml(check.status)}</div>
        <div class="card-detail">${escapeHtml(check.raw || '')}</div>
      </div>`;
    }
  }

  // XProtect & Software Update
  if (extrasResult.ok) {
    const extras = extrasResult.data;

    if (extras.xprotect) {
      html += `<div class="card">
        <div class="card-header">
          <span class="card-label">${t('xprotect')}</span>
          <span class="status-dot green"></span>
        </div>
        <div class="card-value">v${escapeHtml(extras.xprotect.version)}</div>
        <div class="card-detail">${extras.xprotect.date ? t('updated') + ': ' + escapeHtml(extras.xprotect.date) : t('malwareDb')}</div>
      </div>`;
    }

    if (extras.softwareUpdate) {
      const su = extras.softwareUpdate;
      const suDot = su.available ? 'yellow' : 'green';
      html += `<div class="card">
        <div class="card-header">
          <span class="card-label">${t('macosUpdates')}</span>
          <span class="status-dot ${suDot}"></span>
        </div>
        <div class="card-value">${escapeHtml(su.summary)}</div>
        <div class="card-detail">${t('lastCheck')}: ${escapeHtml(su.lastCheck)}</div>
      </div>`;
    }
  }

  html += '</div>';

  // === Privacy Permissions ===
  if (extrasResult.ok && extrasResult.data.privacy && Object.keys(extrasResult.data.privacy).length > 0) {
    const privacy = extrasResult.data.privacy;
    html += `<div class="section-title">${t('privacyPermissions')}</div>`;
    html += '<div class="dashboard-grid">';

    // Sensitive permissions first
    const order = ['Full Disk Access', 'Screen Recording', 'Accessibility', 'Input Monitoring', 'Camera', 'Microphone', 'Automation', 'Desktop Access', 'Documents Access', 'Downloads Access'];
    const sensitiveIcons = {
      'Full Disk Access': 'red',
      'Screen Recording': 'red',
      'Accessibility': 'yellow',
      'Input Monitoring': 'yellow',
      'Camera': 'yellow',
      'Microphone': 'yellow',
    };

    for (const perm of order) {
      if (!privacy[perm]) continue;
      const apps = privacy[perm];
      const dotColor = sensitiveIcons[perm] || 'gray';
      html += `<div class="card">
        <div class="card-header">
          <span class="card-label">${escapeHtml(perm)}</span>
          <span class="status-dot ${dotColor}"></span>
        </div>
        <div class="card-value">${apps.length} ${apps.length > 1 ? t('apps') : t('app')}</div>
        <div class="card-detail">${apps.map(a => escapeHtml(a)).join(', ')}</div>
      </div>`;
    }

    html += '</div>';
  }

  // === Startup Items Impact ===
  if (startupResult.ok && startupResult.data.length > 0) {
    const items = startupResult.data;
    const loaded = items.filter(i => i.status === 'loaded' || i.loaded);
    html += `<div class="section-title">${t('startupItems')}</div>`;
    html += `<div class="dash-list-card" style="max-width:100%">
      <div class="dash-list-title">${t('loadedSlashTotal')(loaded.length, items.length)}</div>`;
    html += `<table class="dash-list-table"><thead><tr><th>${t('name')}</th><th>${t('type')}</th><th>${t('status')}</th></tr></thead><tbody>`;
    const showItems = loaded.slice(0, 10);
    for (const item of showItems) {
      const typeTag = item.type === 'agent' ? '<span class="tag tag-agent">Agent</span>'
        : item.type === 'daemon' ? '<span class="tag tag-daemon">Daemon</span>'
        : `<span class="tag tag-other">${escapeHtml(item.type || 'other')}</span>`;
      html += `<tr>
        <td>${escapeHtml(item.appName || item.label || item.name || '')}</td>
        <td>${typeTag}</td>
        <td><span class="tag tag-loaded">${t('loaded')}</span></td>
      </tr>`;
    }
    if (loaded.length > 10) {
      html += `<tr><td colspan="3" style="color:var(--text-dim);text-align:center">${t('andMore')(loaded.length - 10)}</td></tr>`;
    }
    html += '</tbody></table></div>';
  }

  panel.innerHTML = html;
}
