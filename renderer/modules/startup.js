async function loadStartup() {
  const panel = document.getElementById('tab-startup');
  showLoading(panel);

  const result = await window.imacos.getStartupItems();
  if (!result.ok) {
    panel.innerHTML = `<div class="loading">${t('error')}: ${escapeHtml(result.error)}</div>`;
    return;
  }

  const data = result.data;
  panel.innerHTML = '';

  // Toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'toolbar';
  toolbar.innerHTML = `
    <input type="text" class="search-input" placeholder="${t('searchStartup')}" id="startup-search">
    <span class="count-badge">${data.length} ${t('items')}</span>
  `;
  panel.appendChild(toolbar);

  // Group by type
  const groups = {};
  data.forEach(item => {
    if (!groups[item.type]) groups[item.type] = [];
    groups[item.type].push(item);
  });

  const contentDiv = document.createElement('div');
  contentDiv.id = 'startup-content';
  panel.appendChild(contentDiv);

  function renderGroups(items) {
    const grouped = {};
    items.forEach(item => {
      if (!grouped[item.type]) grouped[item.type] = [];
      grouped[item.type].push(item);
    });

    let html = '';
    const typeOrder = ['User Agent', 'System Agent', 'System Daemon', 'Login Item'];

    typeOrder.forEach(type => {
      const list = grouped[type];
      if (!list || list.length === 0) return;

      const tagClass = type.includes('Agent') ? 'tag-agent' : type.includes('Daemon') ? 'tag-daemon' : 'tag-login';

      html += `<div class="group-header"><span class="tag ${tagClass}">${escapeHtml(type)}</span> (${list.length})</div>`;
      html += '<div class="data-table-wrap"><table class="data-table"><thead><tr>';
      html += `<th>${t('name')}</th><th>${t('program')}</th><th>${t('status')}</th><th>${t('path')}</th>`;
      html += '</tr></thead><tbody>';

      list.forEach(item => {
        const loadedTag = item.loaded
          ? `<span class="tag tag-loaded">${t('loaded')}</span>`
          : `<span class="tag tag-unloaded">${t('unloaded')}</span>`;
        html += `<tr>
          <td><strong>${escapeHtml(item.name)}</strong></td>
          <td class="mono">${escapeHtml(item.program || '-')}</td>
          <td>${loadedTag}</td>
          <td class="mono" title="${escapeHtml(item.path)}">${escapeHtml(item.path || '-')}</td>
        </tr>`;
      });

      html += '</tbody></table></div>';
    });

    if (!html) {
      html = `<div class="loading">${t('noStartupItems')}</div>`;
    }

    contentDiv.innerHTML = html;
  }

  renderGroups(data);

  document.getElementById('startup-search').addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    const filtered = data.filter(item =>
      item.name.toLowerCase().includes(q) ||
      (item.program || '').toLowerCase().includes(q) ||
      item.type.toLowerCase().includes(q)
    );
    renderGroups(filtered);
    toolbar.querySelector('.count-badge').textContent = `${filtered.length} / ${data.length} ${t('items')}`;
  });
}
