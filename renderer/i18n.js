// --- Internationalization ---
const I18N = {
  en: {
    // Titlebar
    subtitle: 'Security Monitor',
    refreshAll: 'Refresh All',
    langSwitch: 'CN',

    // Tabs
    tabDashboard: 'Dashboard',
    tabProcesses: 'Processes',
    tabPorts: 'Ports',
    tabStartup: 'Startup',
    tabNetwork: 'Network',

    // Common
    loading: 'Loading...',
    noData: 'No data',
    all: 'All',
    error: 'Error',
    name: 'Name',
    status: 'Status',
    risk: 'Risk',
    riskColon: 'Risk:',

    // Dashboard
    host: 'Host',
    uptime: 'Uptime',
    runningProcesses: 'Running Processes',
    listeningPorts: 'Listening Ports',
    activeConnections: 'Active Connections',
    startupItems: 'Startup Items',
    securityAlerts: 'Security Alerts',
    unsignedProcesses: 'Unsigned / Unknown Processes',
    unsignedProcessesDetail: 'Processes without verified code signature. Check Processes tab for details.',
    unsignedNetConns: 'Unsigned Network Connections',
    unsignedNetConnsDetail: 'Unverified processes with active network connections. Check Network tab.',
    adhocProcesses: 'Ad-hoc Signed Processes',
    adhocProcessesDetail: 'Self-signed binaries (e.g. Homebrew). Not Apple notarized.',
    systemResources: 'System Resources',
    diskUsage: 'Disk Usage',
    memoryPressure: 'Memory Pressure',
    resourceHogs: 'Resource Hogs',
    topCpuUsage: 'Top CPU Usage',
    topMemUsage: 'Top Memory Usage',
    process: 'Process',
    pid: 'PID',
    cpuPercent: 'CPU%',
    memPercent: 'MEM%',
    securityStatus: 'Security Status',
    xprotect: 'XProtect (Built-in Antivirus)',
    updated: 'Updated',
    malwareDb: 'Malware definition database',
    macosUpdates: 'macOS Updates',
    lastCheck: 'Last check',
    privacyPermissions: 'Privacy Permissions',
    app: 'app',
    apps: 'apps',
    loaded: 'Loaded',
    unloaded: 'Unloaded',
    loadedSlashTotal: (l, t) => `${l} loaded / ${t} total startup items`,
    type: 'Type',
    andMore: (n) => `... and ${n} more. See Startup tab for full list.`,
    used: 'used',
    total: 'total',
    free: 'free',

    // Processes
    searchProcesses: 'Search by app name, PID, command...',
    processes: 'processes',
    proc: 'proc',
    procs: 'procs',
    user: 'User',
    started: 'Started',
    command: 'Command',

    // Categories
    catSystem: 'System',
    catApple: 'Apple',
    catApp: 'App',
    catDev: 'Dev',
    catUnknown: 'Unknown',

    // Risk labels
    riskSafe: 'Safe',
    riskVerified: 'Verified',
    riskReview: 'Review Needed',
    riskWarning: 'Warning',
    riskAdhoc: 'Ad-hoc',
    riskSigned: 'Signed',
    riskUnsigned: 'Unsigned',

    // Risk popup
    processInfo: 'Process Info',
    application: 'Application',
    description: 'Description',
    category: 'Category',
    codeSignature: 'Code Signature',
    trustChain: 'Trust Chain',
    identifier: 'Identifier',
    teamId: 'Team ID',
    format: 'Format',
    signedTime: 'Signed Time',
    platform: 'Platform',
    flags: 'Flags',
    executable: 'Executable',
    signed: 'Signed',
    unsigned: 'Unsigned',
    notChecked: 'Not Checked',
    riskLevels: 'Risk Levels',
    riskSafeDesc: 'Known system / Apple / identified app',
    riskVerifiedDesc: 'Valid code signature from identified developer',
    riskReviewDesc: 'Unknown or unsigned process - verify manually',
    riskSafePopup: 'Known safe process with verified identity',
    riskVerifiedPopup: 'Third-party app with valid code signature',
    riskReviewPopup: 'Process needs manual verification',
    riskWarningPopup: 'Potentially risky process',

    // Ports
    searchPorts: 'Search by port, process, app...',
    connections: 'connections',
    conn: 'conn',
    conns: 'conns',
    listenOnly: 'LISTEN Only',
    protocol: 'Protocol',
    localAddress: 'Local Address',
    remoteAddress: 'Remote Address',
    state: 'State',
    review: 'Review',

    // Startup
    searchStartup: 'Search startup items...',
    items: 'items',
    program: 'Program',
    path: 'Path',
    noStartupItems: 'No startup items found',

    // Network
    searchNetwork: 'Search by process, IP, port...',
    local: 'Local',
    remote: 'Remote',
    direction: 'Direction',
    established: 'Established',
    listen: 'Listen',
    outbound: 'Outbound',
    remoteCount: 'remote',
    remotesCount: 'remotes',
    nEstablished: (n) => `${n} established`,
    nListen: (n) => `${n} listen`,
    nOther: (n) => `${n} other`,
  },

  zh: {
    // Titlebar
    subtitle: '\u5b89\u5168\u76d1\u63a7',
    refreshAll: '\u5237\u65b0\u5168\u90e8',
    langSwitch: 'EN',

    // Tabs
    tabDashboard: '\u4eea\u8868\u76d8',
    tabProcesses: '\u8fdb\u7a0b',
    tabPorts: '\u7aef\u53e3',
    tabStartup: '\u542f\u52a8\u9879',
    tabNetwork: '\u7f51\u7edc',

    // Common
    loading: '\u52a0\u8f7d\u4e2d...',
    noData: '\u65e0\u6570\u636e',
    all: '\u5168\u90e8',
    error: '\u9519\u8bef',
    name: '\u540d\u79f0',
    status: '\u72b6\u6001',
    risk: '\u98ce\u9669',
    riskColon: '\u98ce\u9669:',

    // Dashboard
    host: '\u4e3b\u673a',
    uptime: '\u8fd0\u884c\u65f6\u95f4',
    runningProcesses: '\u8fd0\u884c\u8fdb\u7a0b',
    listeningPorts: '\u76d1\u542c\u7aef\u53e3',
    activeConnections: '\u6d3b\u8dc3\u8fde\u63a5',
    startupItems: '\u542f\u52a8\u9879',
    securityAlerts: '\u5b89\u5168\u8b66\u62a5',
    unsignedProcesses: '\u672a\u7b7e\u540d / \u672a\u77e5\u8fdb\u7a0b',
    unsignedProcessesDetail: '\u672a\u7ecf\u4ee3\u7801\u7b7e\u540d\u9a8c\u8bc1\u7684\u8fdb\u7a0b\u3002\u8bf7\u67e5\u770b\u201c\u8fdb\u7a0b\u201d\u9009\u9879\u5361\u4e86\u89e3\u8be6\u60c5\u3002',
    unsignedNetConns: '\u672a\u7b7e\u540d\u7f51\u7edc\u8fde\u63a5',
    unsignedNetConnsDetail: '\u672a\u9a8c\u8bc1\u8fdb\u7a0b\u7684\u6d3b\u8dc3\u7f51\u7edc\u8fde\u63a5\u3002\u8bf7\u67e5\u770b\u201c\u7f51\u7edc\u201d\u9009\u9879\u5361\u3002',
    adhocProcesses: 'Ad-hoc \u7b7e\u540d\u8fdb\u7a0b',
    adhocProcessesDetail: '\u81ea\u7b7e\u540d\u4e8c\u8fdb\u5236\u6587\u4ef6\uff08\u5982 Homebrew\uff09\u3002\u672a\u7ecf Apple \u516c\u8bc1\u3002',
    systemResources: '\u7cfb\u7edf\u8d44\u6e90',
    diskUsage: '\u78c1\u76d8\u4f7f\u7528',
    memoryPressure: '\u5185\u5b58\u538b\u529b',
    resourceHogs: '\u8d44\u6e90\u5360\u7528',
    topCpuUsage: 'CPU \u5360\u7528 Top',
    topMemUsage: '\u5185\u5b58\u5360\u7528 Top',
    process: '\u8fdb\u7a0b',
    pid: 'PID',
    cpuPercent: 'CPU%',
    memPercent: 'MEM%',
    securityStatus: '\u5b89\u5168\u72b6\u6001',
    xprotect: 'XProtect\uff08\u5185\u7f6e\u53cd\u75c5\u6bd2\uff09',
    updated: '\u66f4\u65b0\u65f6\u95f4',
    malwareDb: '\u6076\u610f\u8f6f\u4ef6\u5b9a\u4e49\u5e93',
    macosUpdates: 'macOS \u66f4\u65b0',
    lastCheck: '\u4e0a\u6b21\u68c0\u67e5',
    privacyPermissions: '\u9690\u79c1\u6743\u9650',
    app: '\u4e2a\u5e94\u7528',
    apps: '\u4e2a\u5e94\u7528',
    loaded: '\u5df2\u52a0\u8f7d',
    unloaded: '\u672a\u52a0\u8f7d',
    loadedSlashTotal: (l, t) => `${l} \u5df2\u52a0\u8f7d / \u5171 ${t} \u4e2a\u542f\u52a8\u9879`,
    type: '\u7c7b\u578b',
    andMore: (n) => `... \u53e6\u6709 ${n} \u9879\u3002\u8bf7\u67e5\u770b\u201c\u542f\u52a8\u9879\u201d\u9009\u9879\u5361\u3002`,
    used: '\u5df2\u7528',
    total: '\u603b\u8ba1',
    free: '\u53ef\u7528',

    // Processes
    searchProcesses: '\u641c\u7d22\u5e94\u7528\u540d\u79f0\u3001PID\u3001\u547d\u4ee4...',
    processes: '\u4e2a\u8fdb\u7a0b',
    proc: '\u8fdb\u7a0b',
    procs: '\u8fdb\u7a0b',
    user: '\u7528\u6237',
    started: '\u542f\u52a8\u65f6\u95f4',
    command: '\u547d\u4ee4',

    // Categories
    catSystem: '\u7cfb\u7edf',
    catApple: 'Apple',
    catApp: '\u5e94\u7528',
    catDev: '\u5f00\u53d1',
    catUnknown: '\u672a\u77e5',

    // Risk labels
    riskSafe: '\u5b89\u5168',
    riskVerified: '\u5df2\u9a8c\u8bc1',
    riskReview: '\u5f85\u5ba1\u67e5',
    riskWarning: '\u8b66\u544a',
    riskAdhoc: 'Ad-hoc',
    riskSigned: '\u5df2\u7b7e\u540d',
    riskUnsigned: '\u672a\u7b7e\u540d',

    // Risk popup
    processInfo: '\u8fdb\u7a0b\u4fe1\u606f',
    application: '\u5e94\u7528\u7a0b\u5e8f',
    description: '\u63cf\u8ff0',
    category: '\u5206\u7c7b',
    codeSignature: '\u4ee3\u7801\u7b7e\u540d',
    trustChain: '\u4fe1\u4efb\u94fe',
    identifier: '\u6807\u8bc6\u7b26',
    teamId: '\u56e2\u961f ID',
    format: '\u683c\u5f0f',
    signedTime: '\u7b7e\u540d\u65f6\u95f4',
    platform: '\u5e73\u53f0',
    flags: '\u6807\u5fd7',
    executable: '\u53ef\u6267\u884c\u6587\u4ef6',
    signed: '\u5df2\u7b7e\u540d',
    unsigned: '\u672a\u7b7e\u540d',
    notChecked: '\u672a\u68c0\u67e5',
    riskLevels: '\u98ce\u9669\u7b49\u7ea7',
    riskSafeDesc: '\u5df2\u77e5\u7684\u7cfb\u7edf / Apple / \u5df2\u8bc6\u522b\u5e94\u7528',
    riskVerifiedDesc: '\u6765\u81ea\u5df2\u8bc6\u522b\u5f00\u53d1\u8005\u7684\u6709\u6548\u4ee3\u7801\u7b7e\u540d',
    riskReviewDesc: '\u672a\u77e5\u6216\u672a\u7b7e\u540d\u8fdb\u7a0b - \u8bf7\u624b\u52a8\u9a8c\u8bc1',
    riskSafePopup: '\u5df2\u9a8c\u8bc1\u8eab\u4efd\u7684\u5df2\u77e5\u5b89\u5168\u8fdb\u7a0b',
    riskVerifiedPopup: '\u5177\u6709\u6709\u6548\u4ee3\u7801\u7b7e\u540d\u7684\u7b2c\u4e09\u65b9\u5e94\u7528',
    riskReviewPopup: '\u9700\u8981\u624b\u52a8\u9a8c\u8bc1\u7684\u8fdb\u7a0b',
    riskWarningPopup: '\u6f5c\u5728\u98ce\u9669\u8fdb\u7a0b',

    // Ports
    searchPorts: '\u641c\u7d22\u7aef\u53e3\u3001\u8fdb\u7a0b\u3001\u5e94\u7528...',
    connections: '\u4e2a\u8fde\u63a5',
    conn: '\u8fde\u63a5',
    conns: '\u8fde\u63a5',
    listenOnly: '\u4ec5\u76d1\u542c',
    protocol: '\u534f\u8bae',
    localAddress: '\u672c\u5730\u5730\u5740',
    remoteAddress: '\u8fdc\u7a0b\u5730\u5740',
    state: '\u72b6\u6001',
    review: '\u5ba1\u67e5',

    // Startup
    searchStartup: '\u641c\u7d22\u542f\u52a8\u9879...',
    items: '\u9879',
    program: '\u7a0b\u5e8f',
    path: '\u8def\u5f84',
    noStartupItems: '\u672a\u627e\u5230\u542f\u52a8\u9879',

    // Network
    searchNetwork: '\u641c\u7d22\u8fdb\u7a0b\u3001IP\u3001\u7aef\u53e3...',
    local: '\u672c\u5730',
    remote: '\u8fdc\u7a0b',
    direction: '\u65b9\u5411',
    established: '\u5df2\u5efa\u7acb',
    listen: '\u76d1\u542c',
    outbound: '\u51fa\u7ad9',
    remoteCount: '\u4e2a\u8fdc\u7a0b',
    remotesCount: '\u4e2a\u8fdc\u7a0b',
    nEstablished: (n) => `${n} \u5df2\u5efa\u7acb`,
    nListen: (n) => `${n} \u76d1\u542c`,
    nOther: (n) => `${n} \u5176\u4ed6`,
  },
};

let currentLang = localStorage.getItem('imacos-lang') || 'en';

function t(key) {
  return (I18N[currentLang] && I18N[currentLang][key]) || I18N.en[key] || key;
}

function setLang(lang) {
  currentLang = lang;
  localStorage.setItem('imacos-lang', lang);
}

function getLang() {
  return currentLang;
}
