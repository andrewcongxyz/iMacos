const { app, BrowserWindow, ipcMain, nativeImage } = require('electron');
const { execFile, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

let mainWindow;

function createWindow() {
  const iconPath = path.join(__dirname, 'resources', 'icon.png');

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0f0f1a',
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Set Dock icon and name
  if (process.platform === 'darwin' && app.dock) {
    try {
      const dockIcon = nativeImage.createFromPath(iconPath);
      if (!dockIcon.isEmpty()) app.dock.setIcon(dockIcon);
    } catch (e) { /* ignore */ }
  }

  mainWindow.loadFile('renderer/index.html');
}

app.setName('iMacOS');
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => saveCodesignCache());

// --- Helper ---
function runCommand(cmd, args = []) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 10 * 1024 * 1024, timeout: 15000 }, (err, stdout, stderr) => {
      if (err && !stdout) {
        reject(err);
      } else {
        resolve(stdout);
      }
    });
  });
}

function runShell(cmd) {
  return new Promise((resolve, reject) => {
    exec(cmd, { maxBuffer: 10 * 1024 * 1024, timeout: 15000 }, (err, stdout, stderr) => {
      if (err && !stdout) {
        reject(err);
      } else {
        resolve(stdout);
      }
    });
  });
}

// --- IPC: System Info ---
ipcMain.handle('get-system-info', async () => {
  try {
    const [swVers, uptimeOut] = await Promise.all([
      runCommand('sw_vers'),
      runCommand('uptime'),
    ]);

    const info = {};
    swVers.split('\n').forEach(line => {
      const [key, val] = line.split(':').map(s => s?.trim());
      if (key && val) info[key] = val;
    });

    const uptimeMatch = uptimeOut.match(/up\s+(.+?),\s+\d+\s+user/);
    info.Uptime = uptimeMatch ? uptimeMatch[1].trim() : uptimeOut.trim();
    info.Hostname = os.hostname();

    return { ok: true, data: info };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// --- IPC: Security Status ---
ipcMain.handle('get-security-status', async () => {
  const results = {};

  const checks = [
    {
      name: 'SIP',
      label: 'System Integrity Protection',
      run: async () => {
        const out = await runCommand('csrutil', ['status']);
        const enabled = out.includes('enabled');
        return { status: enabled ? 'enabled' : 'disabled', ok: enabled, raw: out.trim() };
      },
    },
    {
      name: 'FileVault',
      label: 'FileVault Encryption',
      run: async () => {
        const out = await runCommand('fdesetup', ['status']);
        const on = out.includes('On');
        return { status: on ? 'On' : 'Off', ok: on, raw: out.trim() };
      },
    },
    {
      name: 'Gatekeeper',
      label: 'Gatekeeper',
      run: async () => {
        const out = await runCommand('spctl', ['--status']);
        const enabled = out.includes('enabled');
        return { status: enabled ? 'enabled' : 'disabled', ok: enabled, raw: out.trim() };
      },
    },
    {
      name: 'Firewall',
      label: 'Firewall',
      run: async () => {
        const out = await runShell('/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate');
        const enabled = out.includes('enabled');
        return { status: enabled ? 'enabled' : 'disabled', ok: enabled, raw: out.trim() };
      },
    },
    {
      name: 'RemoteLogin',
      label: 'Remote Login (SSH)',
      run: async () => {
        // Use launchctl to check if SSH is enabled (no admin required)
        const out = await runShell('launchctl print system/com.openssh.sshd 2>&1 || true');
        const notFound = out.includes('Could not find service') || out.includes('No such process');
        const enabled = !notFound;
        return {
          status: enabled ? 'On' : 'Off',
          ok: !enabled,
          raw: enabled ? 'SSH remote login is enabled' : 'SSH remote login is disabled',
        };
      },
    },
  ];

  await Promise.all(checks.map(async (check) => {
    try {
      results[check.name] = { label: check.label, ...(await check.run()) };
    } catch (e) {
      results[check.name] = { label: check.label, status: 'error', ok: false, raw: e.message };
    }
  }));

  return { ok: true, data: results };
});

// --- IPC: Dashboard extended info ---
ipcMain.handle('get-dashboard-extras', async () => {
  const extras = {};

  // 1. Disk usage
  try {
    const dfOut = await runShell('df -H / 2>/dev/null | tail -1');
    const parts = dfOut.trim().split(/\s+/);
    if (parts.length >= 5) {
      extras.disk = {
        total: parts[1],
        used: parts[2],
        available: parts[3],
        percentUsed: parseInt(parts[4]) || 0,
      };
    }
  } catch (e) { extras.disk = null; }

  // 2. Memory pressure
  try {
    const vmOut = await runShell('vm_stat 2>/dev/null');
    const pageSize = 16384; // Apple Silicon default
    const parse = (key) => {
      const m = vmOut.match(new RegExp(key + '\\s*:\\s*(\\d+)'));
      return m ? parseInt(m[1]) * pageSize : 0;
    };
    const free = parse('Pages free');
    const active = parse('Pages active');
    const inactive = parse('Pages inactive');
    const speculative = parse('Pages speculative');
    const wired = parse('Pages wired down');
    const compressed = parse('Pages occupied by compressor');
    const total = os.totalmem();
    const used = active + wired + compressed;
    const swapOut = await runShell('sysctl vm.swapusage 2>/dev/null');
    const swapMatch = swapOut.match(/used\s*=\s*([\d.]+)([MG])/);
    let swapUsed = 0;
    if (swapMatch) {
      swapUsed = parseFloat(swapMatch[1]);
      if (swapMatch[2] === 'G') swapUsed *= 1024;
    }
    extras.memory = {
      total: (total / 1073741824).toFixed(1),
      used: (used / 1073741824).toFixed(1),
      free: (free / 1073741824).toFixed(1),
      compressed: (compressed / 1073741824).toFixed(1),
      wired: (wired / 1073741824).toFixed(1),
      swapUsedMB: Math.round(swapUsed),
      percentUsed: Math.round((used / total) * 100),
    };
  } catch (e) { extras.memory = null; }

  // 3. XProtect version
  try {
    const xpOut = await runShell('system_profiler SPInstallHistoryDataType 2>/dev/null | grep -A2 "XProtect" | tail -3');
    const verMatch = xpOut.match(/Version:\s*(.+)/);
    const dateMatch = xpOut.match(/Install Date:\s*(.+)/);
    extras.xprotect = {
      version: verMatch ? verMatch[1].trim() : 'Unknown',
      date: dateMatch ? dateMatch[1].trim() : '',
    };
  } catch (e) {
    // Fallback: check plist directly
    try {
      const plistOut = await runShell('defaults read /Library/Apple/System/Library/CoreServices/XProtect.bundle/Contents/Info.plist CFBundleShortVersionString 2>/dev/null || echo "Unknown"');
      extras.xprotect = { version: plistOut.trim(), date: '' };
    } catch (e2) { extras.xprotect = null; }
  }

  // 4. macOS software update
  try {
    const suOut = await runShell('defaults read /Library/Preferences/com.apple.SoftwareUpdate.plist LastSuccessfulDate 2>/dev/null || echo ""');
    const listOut = await runShell('softwareupdate -l --no-scan 2>&1 || true');
    const hasUpdates = listOut.includes('*') || listOut.includes('Label:');
    const noUpdates = listOut.includes('No new software available');
    extras.softwareUpdate = {
      lastCheck: suOut.trim() || 'Unknown',
      available: hasUpdates && !noUpdates,
      summary: hasUpdates && !noUpdates ? 'Updates available' : 'Up to date',
      raw: listOut.trim().substring(0, 300),
    };
  } catch (e) { extras.softwareUpdate = null; }

  // 5. Privacy permissions (TCC) - key sensitive permissions
  try {
    const tccDb = `${os.homedir()}/Library/Application Support/com.apple.TCC/TCC.db`;
    const tccOut = await runShell(`sqlite3 "${tccDb}" "SELECT client, service, auth_value FROM access WHERE auth_value = 2 ORDER BY service" 2>/dev/null || echo ""`);
    const permissions = {};
    const serviceLabels = {
      kTCCServiceAccessibility: 'Accessibility',
      kTCCServiceScreenCapture: 'Screen Recording',
      kTCCServiceSystemPolicyAllFiles: 'Full Disk Access',
      kTCCServiceMicrophone: 'Microphone',
      kTCCServiceCamera: 'Camera',
      kTCCServiceSystemPolicyDesktopFolder: 'Desktop Access',
      kTCCServiceSystemPolicyDocumentsFolder: 'Documents Access',
      kTCCServiceSystemPolicyDownloadsFolder: 'Downloads Access',
      kTCCServiceAppleEvents: 'Automation',
      kTCCServiceListenEvent: 'Input Monitoring',
    };
    for (const line of tccOut.split('\n').filter(Boolean)) {
      const [client, service] = line.split('|');
      if (!client || !service) continue;
      const label = serviceLabels[service];
      if (!label) continue;
      if (!permissions[label]) permissions[label] = [];
      const appName = client.replace(/^com\./, '').replace(/\./g, ' ').split('/').pop();
      permissions[label].push(appName);
    }
    extras.privacy = permissions;
  } catch (e) { extras.privacy = null; }

  return { ok: true, data: extras };
});

// --- Process identification ---
const KNOWN_SYSTEM_PROCESSES = {
  'kernel_task': { appName: 'macOS Kernel', category: 'system', desc: 'macOS core kernel task' },
  'launchd': { appName: 'LaunchD', category: 'system', desc: 'macOS service manager (init)' },
  'WindowServer': { appName: 'Window Server', category: 'system', desc: 'macOS display/window management' },
  'loginwindow': { appName: 'Login Window', category: 'system', desc: 'macOS login & session manager' },
  'Finder': { appName: 'Finder', category: 'system', desc: 'macOS file manager' },
  'Dock': { appName: 'Dock', category: 'system', desc: 'macOS Dock & app launcher' },
  'SystemUIServer': { appName: 'System UI Server', category: 'system', desc: 'Menu bar & system UI' },
  'NotificationCenter': { appName: 'Notification Center', category: 'system', desc: 'macOS notifications' },
  'mds': { appName: 'Spotlight Indexer', category: 'system', desc: 'Metadata server for Spotlight search' },
  'mds_stores': { appName: 'Spotlight Storage', category: 'system', desc: 'Spotlight metadata storage' },
  'mdworker': { appName: 'Spotlight Worker', category: 'system', desc: 'Spotlight indexing worker' },
  'mdworker_shared': { appName: 'Spotlight Worker', category: 'system', desc: 'Spotlight indexing worker (shared)' },
  'coreaudiod': { appName: 'Core Audio', category: 'system', desc: 'macOS audio daemon' },
  'bluetoothd': { appName: 'Bluetooth Daemon', category: 'system', desc: 'Bluetooth service' },
  'airportd': { appName: 'WiFi Daemon', category: 'system', desc: 'WiFi management' },
  'configd': { appName: 'System Config', category: 'system', desc: 'System configuration daemon' },
  'diskarbitrationd': { appName: 'Disk Arbitration', category: 'system', desc: 'Disk mount/unmount manager' },
  'fseventsd': { appName: 'FS Events', category: 'system', desc: 'File system event daemon' },
  'securityd': { appName: 'Security Daemon', category: 'system', desc: 'macOS security/keychain service' },
  'trustd': { appName: 'Trust Daemon', category: 'system', desc: 'Certificate trust evaluation' },
  'UserEventAgent': { appName: 'User Event Agent', category: 'system', desc: 'User-level event monitoring' },
  'syslogd': { appName: 'System Logger', category: 'system', desc: 'System logging daemon' },
  'powerd': { appName: 'Power Manager', category: 'system', desc: 'Energy/power management' },
  'thermalmonitord': { appName: 'Thermal Monitor', category: 'system', desc: 'Temperature monitoring' },
  'corebrightnessd': { appName: 'Brightness Daemon', category: 'system', desc: 'Display brightness control' },
  'sharingd': { appName: 'Sharing Daemon', category: 'system', desc: 'AirDrop, Handoff, file sharing' },
  'cloudd': { appName: 'iCloud Daemon', category: 'apple', desc: 'iCloud sync service' },
  'cloudphotod': { appName: 'iCloud Photos', category: 'apple', desc: 'iCloud Photos sync daemon' },
  'cloudpaird': { appName: 'iCloud Pairing', category: 'apple', desc: 'iCloud device pairing' },
  'nsurlsessiond': { appName: 'URL Session', category: 'system', desc: 'Background network transfers' },
  'cfprefsd': { appName: 'Preferences Daemon', category: 'system', desc: 'System/app preferences sync' },
  'lsd': { appName: 'Launch Services', category: 'system', desc: 'App registration & file associations' },
  'launchservicesd': { appName: 'Launch Services D', category: 'system', desc: 'App launch management' },
  'diagnosticd': { appName: 'Diagnostics', category: 'system', desc: 'System diagnostics logging' },
  'logd': { appName: 'Log Daemon', category: 'system', desc: 'Unified logging system' },
  'opendirectoryd': { appName: 'Open Directory', category: 'system', desc: 'Directory/user lookup service' },
  'sandboxd': { appName: 'Sandbox Daemon', category: 'system', desc: 'App sandboxing enforcement' },
  'symptomsd': { appName: 'Symptoms Daemon', category: 'system', desc: 'Network diagnostics' },
  'rapportd': { appName: 'Rapport Daemon', category: 'apple', desc: 'Device-to-device communication (Continuity)' },
  'remindd': { appName: 'Reminders Daemon', category: 'apple', desc: 'Reminders sync service' },
  'CalendarAgent': { appName: 'Calendar Agent', category: 'apple', desc: 'Calendar sync & notifications' },
  'imagent': { appName: 'iMessage Agent', category: 'apple', desc: 'iMessage/FaceTime service' },
  'IMDPersistenceAgent': { appName: 'iMessage Storage', category: 'apple', desc: 'iMessage data persistence' },
  'accountsd': { appName: 'Accounts Daemon', category: 'system', desc: 'Internet accounts management' },
  'tccd': { appName: 'TCC Daemon', category: 'system', desc: 'Privacy permission control (Transparency, Consent, Control)' },
  'WindowManager': { appName: 'Window Manager', category: 'system', desc: 'Stage Manager & window tiling' },
  'UniversalControl': { appName: 'Universal Control', category: 'apple', desc: 'Cross-device keyboard/mouse sharing' },
  'ControlCenter': { appName: 'Control Center', category: 'system', desc: 'macOS Control Center' },
  'TextInputMenuAgent': { appName: 'Input Method', category: 'system', desc: 'Keyboard input method manager' },
  'AXVisualSupportAgent': { appName: 'Accessibility', category: 'system', desc: 'Accessibility visual support' },
  'bird': { appName: 'iCloud Storage', category: 'apple', desc: 'iCloud Drive file sync' },
  'photolibraryd': { appName: 'Photos Library', category: 'apple', desc: 'Photos library management' },
  'mediaanalysisd': { appName: 'Media Analysis', category: 'apple', desc: 'Photo/video ML analysis' },
  'AMPDeviceDiscoveryAgent': { appName: 'AMP Discovery', category: 'apple', desc: 'Apple media device discovery' },
  'CommCenter': { appName: 'CommCenter', category: 'system', desc: 'Telephony/cellular communication' },
  'ctkd': { appName: 'CryptoToken Daemon', category: 'system', desc: 'Smart card/crypto token support' },
  'softwareupdated': { appName: 'Software Update', category: 'system', desc: 'macOS software update service' },
  'AppleSpell': { appName: 'Spell Checker', category: 'system', desc: 'macOS spell checking service' },
  'deleted': { appName: 'Storage Manager', category: 'system', desc: 'Disk space reclamation daemon' },
  'cupsd': { appName: 'CUPS Printer', category: 'system', desc: 'Printing service daemon' },
  'smbd': { appName: 'SMB Daemon', category: 'system', desc: 'Windows file sharing (SMB)' },
  'sshd': { appName: 'SSH Daemon', category: 'system', desc: 'Secure Shell remote login' },
  'httpd': { appName: 'Apache HTTP', category: 'system', desc: 'Apache web server' },
  'coreservicesd': { appName: 'Core Services', category: 'system', desc: 'Core system services manager' },
  'automountd': { appName: 'Auto Mount', category: 'system', desc: 'Automatic filesystem mount daemon' },
  'autofsd': { appName: 'AutoFS Daemon', category: 'system', desc: 'Automatic filesystem mount service' },
  'endpointsecurityd': { appName: 'Endpoint Security', category: 'system', desc: 'macOS endpoint security framework daemon' },
  'aslmanager': { appName: 'ASL Manager', category: 'system', desc: 'Apple System Log manager' },
  'ps': { appName: 'Process Status', category: 'system', desc: 'Process listing utility' },
  'caffeinate': { appName: 'Caffeinate', category: 'system', desc: 'Prevent Mac from sleeping (Apple built-in)' },
  'sleep': { appName: 'Sleep', category: 'system', desc: 'Delay execution utility' },
  'bash': { appName: 'Bash', category: 'system', desc: 'Bourne-Again Shell' },
  'zsh': { appName: 'Zsh', category: 'system', desc: 'Z Shell (default macOS shell)' },
  'sh': { appName: 'Shell', category: 'system', desc: 'POSIX shell' },
  'login': { appName: 'Login', category: 'system', desc: 'User login process' },
  'top': { appName: 'Top', category: 'system', desc: 'Process monitoring utility' },
  'grep': { appName: 'Grep', category: 'system', desc: 'Text search utility' },
  'osascript': { appName: 'AppleScript', category: 'system', desc: 'AppleScript/JXA executor' },
  'plutil': { appName: 'Plist Utility', category: 'system', desc: 'Property list tool' },
  'launchctl': { appName: 'Launchctl', category: 'system', desc: 'Service management utility' },
  'lsof': { appName: 'lsof', category: 'system', desc: 'List open files utility' },
  'mdworker_shared': { appName: 'Spotlight Worker', category: 'system', desc: 'Spotlight indexing worker (shared)' },
  'cat': { appName: 'Cat', category: 'system', desc: 'File concatenation utility' },
  'remoted': { appName: 'Remote Daemon', category: 'system', desc: 'Remote services daemon' },
  'remotepairingd': { appName: 'Remote Pairing', category: 'system', desc: 'Device wireless pairing service' },
  'contextstored': { appName: 'Context Store', category: 'system', desc: 'System context storage daemon' },
  'corespeechd': { appName: 'Core Speech', category: 'system', desc: 'Speech recognition daemon' },
  'taskgated': { appName: 'Task Gate', category: 'system', desc: 'Code signing enforcement daemon' },
  'biomed': { appName: 'Biome Daemon', category: 'system', desc: 'Activity/intent data collection' },
  'dasd': { appName: 'DAS Daemon', category: 'system', desc: 'Duet Activity Scheduler' },
  'containermanagerd': { appName: 'Container Manager', category: 'system', desc: 'App container/sandbox management' },
  'runningboardd': { appName: 'RunningBoard', category: 'system', desc: 'Process lifecycle management' },
  'watchdogd': { appName: 'Watchdog', category: 'system', desc: 'System watchdog daemon' },
  'notifyd': { appName: 'Notify Daemon', category: 'system', desc: 'Darwin notification service' },
  'usermanagerd': { appName: 'User Manager', category: 'system', desc: 'User session management' },
  'fileproviderd': { appName: 'File Provider', category: 'system', desc: 'Cloud file provider coordination' },
  'mobileassetd': { appName: 'Mobile Asset', category: 'apple', desc: 'System asset updates (fonts, voices, etc.)' },
  'backgroundtaskmanagementd': { appName: 'Background Task Mgr', category: 'system', desc: 'Background task management' },
  'syspolicyd': { appName: 'System Policy', category: 'system', desc: 'System security policy daemon' },
  'pkd': { appName: 'Plugin Kit', category: 'system', desc: 'App extensions/plugins management' },
  'extensionkitservice': { appName: 'ExtensionKit', category: 'system', desc: 'App extension host service' },
  'CategoriesService': { appName: 'Categories', category: 'system', desc: 'App categorization service' },
  'kernelmanagerd': { appName: 'Kernel Manager', category: 'system', desc: 'Kernel extension management' },
  'mediaremoted': { appName: 'Media Remote', category: 'apple', desc: 'Media remote control daemon' },
  'iconservicesd': { appName: 'Icon Services', category: 'system', desc: 'App icon management' },
  'filecoordinationd': { appName: 'File Coordination', category: 'system', desc: 'Cross-process file access coordination' },
  'timed': { appName: 'Time Daemon', category: 'system', desc: 'Date/time synchronization' },
  'apsd': { appName: 'Apple Push Service', category: 'apple', desc: 'Push notification service' },
  'searchpartyd': { appName: 'Find My', category: 'apple', desc: 'Find My network service' },
  'WirelessRadioManagerd': { appName: 'Wireless Manager', category: 'system', desc: 'Wireless radio management' },
  'wifip2pd': { appName: 'WiFi P2P', category: 'system', desc: 'WiFi peer-to-peer (AirDrop)' },
  'pboard': { appName: 'Pasteboard', category: 'system', desc: 'System clipboard service' },
  'siriknowledged': { appName: 'Siri Knowledge', category: 'apple', desc: 'Siri data & knowledge service' },
  'searchd': { appName: 'Search Daemon', category: 'system', desc: 'Spotlight search daemon' },
  'suggestd': { appName: 'Suggestions', category: 'apple', desc: 'Siri suggestions daemon' },
  'duetexpertd': { appName: 'Duet Expert', category: 'system', desc: 'Intelligent scheduling daemon' },
  'ReportCrash': { appName: 'Crash Reporter', category: 'system', desc: 'Crash report generation' },
  'analyticssd': { appName: 'Analytics Service', category: 'apple', desc: 'Apple analytics collection' },
  'identityservicesd': { appName: 'Identity Services', category: 'apple', desc: 'Apple ID & iCloud authentication service' },
  'networkserviceproxy': { appName: 'Network Service Proxy', category: 'system', desc: 'iCloud Private Relay / network proxy' },
  'nesessionmanager': { appName: 'NE Session Manager', category: 'system', desc: 'Network Extension session management (VPN etc.)' },
  'mDNSResponder': { appName: 'mDNS Responder', category: 'system', desc: 'Bonjour / multicast DNS service discovery' },
  'netbiosd': { appName: 'NetBIOS Daemon', category: 'system', desc: 'NetBIOS name resolution for Windows network' },
  'locationd': { appName: 'Location Daemon', category: 'system', desc: 'Location services & GPS management' },
  'iCloudNotificationAgent': { appName: 'iCloud Notifications', category: 'apple', desc: 'iCloud push notification delivery' },
  'AMPLibraryAgent': { appName: 'AMP Library Agent', category: 'apple', desc: 'Apple Music/Podcast library sync' },
  'akd': { appName: 'Auth Kit Daemon', category: 'apple', desc: 'Apple ID authentication & sign-in service' },
  'aned': { appName: 'ANE Daemon', category: 'system', desc: 'Apple Neural Engine management' },
  'biomesyncd': { appName: 'Biome Sync', category: 'system', desc: 'Cross-device activity sync (Handoff)' },
  'assistantd': { appName: 'Siri Assistant', category: 'apple', desc: 'Siri voice assistant backend service' },
  'parsecd': { appName: 'Parsec Daemon', category: 'apple', desc: 'Siri & Spotlight suggestions ranking engine' },
  'itunescloudd': { appName: 'iTunes Cloud', category: 'apple', desc: 'iTunes/Apple Music cloud library sync' },
  'touristd': { appName: 'Tourist Daemon', category: 'apple', desc: 'macOS feature tour & tips service' },
  'translationd': { appName: 'Translation', category: 'apple', desc: 'System-wide translation service' },
  'familycircled': { appName: 'Family Circle', category: 'apple', desc: 'Family Sharing management service' },
  'routined': { appName: 'Routine Daemon', category: 'system', desc: 'Location-based routine & habit learning' },
  'networkd': { appName: 'Network Daemon', category: 'system', desc: 'Core networking stack daemon' },
  'storekitagent': { appName: 'StoreKit Agent', category: 'apple', desc: 'App Store in-app purchase & transaction service' },
  'storedownloadd': { appName: 'Store Download', category: 'apple', desc: 'App Store app download manager' },
  'storeassetd': { appName: 'Store Asset', category: 'apple', desc: 'App Store asset management' },
  'storeaccountd': { appName: 'Store Account', category: 'apple', desc: 'App Store account & license management' },
  'commerce': { appName: 'Commerce', category: 'apple', desc: 'Apple purchase & payment processing' },
  'appstoreagent': { appName: 'App Store Agent', category: 'apple', desc: 'App Store background update agent' },
  'softwareupdateservicesd': { appName: 'SUS Daemon', category: 'apple', desc: 'Software Update background check service' },
  'appinstalld': { appName: 'App Installer', category: 'system', desc: 'Application installation & removal service' },
  'installd': { appName: 'Install Daemon', category: 'system', desc: 'Package & app installation service' },
  'revisiond': { appName: 'Revision Daemon', category: 'system', desc: 'Document version tracking & snapshots' },
  'progressd': { appName: 'Progress Daemon', category: 'system', desc: 'System progress & status tracking' },
  'knowledge-agent': { appName: 'Knowledge Agent', category: 'apple', desc: 'Siri knowledge & data indexing agent' },
  'knowledgeconstructiond': { appName: 'Knowledge Construction', category: 'apple', desc: 'On-device Siri knowledge graph building' },
  'intelligenceplatformd': { appName: 'Intelligence Platform', category: 'apple', desc: 'Apple Intelligence on-device ML platform' },
  'triald': { appName: 'Trial Daemon', category: 'apple', desc: 'A/B testing & feature rollout service' },
  'trustdFileHelper': { appName: 'Trust File Helper', category: 'system', desc: 'Certificate trust database file management' },
  'secd': { appName: 'Security Daemon', category: 'system', desc: 'Keychain & security credentials management' },
  'coreauthd': { appName: 'Core Auth', category: 'system', desc: 'Touch ID / password authentication service' },
  'authd': { appName: 'Auth Daemon', category: 'system', desc: 'Authorization & privilege escalation service' },
  'keybagd': { appName: 'Keybag Daemon', category: 'system', desc: 'Encryption key management (Data Protection)' },
  'spindump': { appName: 'Spindump', category: 'system', desc: 'Hang & performance diagnostics tool' },
  'sysdiagnose': { appName: 'Sysdiagnose', category: 'system', desc: 'System diagnostic data collection' },
  'tailspind': { appName: 'Tailspin Daemon', category: 'system', desc: 'Continuous system tracing for crash analysis' },
  'logd_helper': { appName: 'Log Helper', category: 'system', desc: 'Unified logging system helper' },
  'WiFiAgent': { appName: 'WiFi Agent', category: 'system', desc: 'WiFi network selection & management UI' },
  'wirelessproxd': { appName: 'Wireless Proxy', category: 'system', desc: 'Wireless device proxy (Apple Watch pairing)' },
  'bluetoothuserd': { appName: 'Bluetooth User', category: 'system', desc: 'Bluetooth user-level device management' },
  'audioclocksyncd': { appName: 'Audio Clock Sync', category: 'system', desc: 'Audio clock synchronization service' },
  'coresymbolicationd': { appName: 'Core Symbolication', category: 'system', desc: 'Crash log symbol resolution service' },
  'distnoted': { appName: 'Dist Notification', category: 'system', desc: 'Distributed notification service between apps' },
  'gamecontrollerd': { appName: 'Game Controller', category: 'system', desc: 'Game controller input management' },
  'gpumemd': { appName: 'GPU Memory', category: 'system', desc: 'GPU memory management daemon' },
  'hidd': { appName: 'HID Daemon', category: 'system', desc: 'Human Interface Device (keyboard/mouse) management' },
  'useractivityd': { appName: 'User Activity', category: 'apple', desc: 'Handoff & user activity tracking' },
  'adid': { appName: 'Ad ID Daemon', category: 'apple', desc: 'Advertising identifier management' },
  'ckabortsenderserviced': { appName: 'CloudKit Abort Sender', category: 'apple', desc: 'CloudKit error reporting service' },
  'nfcd': { appName: 'NFC Daemon', category: 'system', desc: 'Near Field Communication service' },
  'coreduetd': { appName: 'Core Duet', category: 'system', desc: 'Device usage pattern learning & prediction' },
  'lskdd': { appName: 'LSKD Daemon', category: 'system', desc: 'Local session key distribution' },
  'mediaserverd': { appName: 'Media Server', category: 'system', desc: 'Core audio/video media processing' },
  'companionappd': { appName: 'Companion App', category: 'apple', desc: 'Apple Watch companion app service' },
  'watchlistd': { appName: 'Watchlist Daemon', category: 'apple', desc: 'Apple TV+ watchlist sync service' },
  'tipsd': { appName: 'Tips Daemon', category: 'apple', desc: 'Tips app content delivery' },
  'newsd': { appName: 'News Daemon', category: 'apple', desc: 'Apple News content sync' },
  'homed': { appName: 'Home Daemon', category: 'apple', desc: 'HomeKit smart home device management' },
  'healthd': { appName: 'Health Daemon', category: 'apple', desc: 'Health data sync & management' },
  'weatherd': { appName: 'Weather Daemon', category: 'apple', desc: 'Weather data fetch & widget updates' },
  'mapspushd': { appName: 'Maps Push', category: 'apple', desc: 'Apple Maps push notification service' },
  'geod': { appName: 'Geo Daemon', category: 'apple', desc: 'Apple Maps geocoding & location service' },
  'passd': { appName: 'Wallet Daemon', category: 'apple', desc: 'Apple Wallet passes & payment management' },
};

const KNOWN_APPS = {
  'Google Chrome': { category: 'app', desc: 'Web browser by Google' },
  'Google Chrome Helper': { category: 'app', desc: 'Chrome renderer/extension process' },
  'Safari': { category: 'app', desc: 'Apple web browser' },
  'Firefox': { category: 'app', desc: 'Mozilla web browser' },
  'WeChat': { category: 'app', desc: 'Messaging app (Tencent)' },
  'WeChatAppEx': { category: 'app', desc: 'WeChat Mini Program' },
  'Telegram': { category: 'app', desc: 'Messaging app' },
  'Discord': { category: 'app', desc: 'Voice/text chat app' },
  'Slack': { category: 'app', desc: 'Team communication app' },
  'Spotify': { category: 'app', desc: 'Music streaming app' },
  'Music': { category: 'apple', desc: 'Apple Music' },
  'Mail': { category: 'apple', desc: 'Apple Mail client' },
  'Notes': { category: 'apple', desc: 'Apple Notes' },
  'Messages': { category: 'apple', desc: 'Apple iMessage' },
  'FaceTime': { category: 'apple', desc: 'Apple video calling' },
  'Preview': { category: 'apple', desc: 'Apple image/PDF viewer' },
  'Terminal': { category: 'apple', desc: 'macOS terminal emulator' },
  'iTerm2': { category: 'app', desc: 'Terminal emulator' },
  'Visual Studio Code': { category: 'app', desc: 'Code editor by Microsoft' },
  'Code Helper': { category: 'app', desc: 'VS Code helper process' },
  'Xcode': { category: 'apple', desc: 'Apple IDE for app development' },
  'Claude': { category: 'app', desc: 'Anthropic AI assistant' },
  'Zed': { category: 'app', desc: 'Code editor' },
  'PopClip': { category: 'app', desc: 'Text selection utility' },
  'Alfred': { category: 'app', desc: 'Productivity/launcher app' },
  'Raycast': { category: 'app', desc: 'Productivity launcher' },
  'Docker': { category: 'app', desc: 'Container platform' },
  'com.docker.vmnetd': { category: 'app', desc: 'Docker networking daemon' },
  '1Password': { category: 'app', desc: 'Password manager' },
  'Notion': { category: 'app', desc: 'Note-taking & productivity' },
  'Obsidian': { category: 'app', desc: 'Markdown knowledge base' },
  'CleanMyMac': { category: 'app', desc: 'System maintenance tool' },
  'BetterTouchTool': { category: 'app', desc: 'Input device customization' },
  'Karabiner-Elements': { category: 'app', desc: 'Keyboard remapping tool' },
  'Little Snitch': { category: 'app', desc: 'Network firewall' },
  'Lulu': { category: 'app', desc: 'Open-source firewall (Objective-See)' },
  'Surge': { category: 'app', desc: 'Network proxy/debugging tool' },
  'ClashX': { category: 'app', desc: 'Network proxy tool' },
  'V2RayU': { category: 'app', desc: 'Network proxy tool' },
  'Proxyman': { category: 'app', desc: 'HTTP debugging proxy' },
  'WaveTerminal': { category: 'app', desc: 'Terminal emulator' },
  'Wave': { category: 'app', desc: 'Wave terminal emulator' },
  'Warp': { category: 'app', desc: 'AI-powered terminal' },
  'iStat Menus': { category: 'app', desc: 'System monitor (menu bar)' },
  'Bartender': { category: 'app', desc: 'Menu bar icon manager' },
  'Magnet': { category: 'app', desc: 'Window management tool' },
  'Rectangle': { category: 'app', desc: 'Window management tool' },
  'Amphetamine': { category: 'app', desc: 'Keep Mac awake utility' },
  'Fantastical': { category: 'app', desc: 'Calendar app' },
  'Things': { category: 'app', desc: 'Task management app' },
  'Bear': { category: 'app', desc: 'Note-taking app' },
  'Cursor': { category: 'app', desc: 'AI code editor' },
  'Figma': { category: 'app', desc: 'UI design tool' },
  'Sketch': { category: 'app', desc: 'UI design tool' },
  'TablePlus': { category: 'app', desc: 'Database management GUI' },
  'Postman': { category: 'app', desc: 'API testing tool' },
  'Insomnia': { category: 'app', desc: 'API testing tool' },
  'ScreenFloat': { category: 'app', desc: 'Screenshot management' },
  'Parallels Desktop': { category: 'app', desc: 'Virtual machine software' },
  'VMware Fusion': { category: 'app', desc: 'Virtual machine software' },
  'iMacos': { category: 'app', desc: 'macOS Security Monitor (this app)' },
};

const KNOWN_CLI_TOOLS = {
  'ollama': { appName: 'Ollama', category: 'app', desc: 'Local AI model runner' },
  'claude': { appName: 'Claude CLI', category: 'app', desc: 'Anthropic Claude CLI assistant' },
  'code': { appName: 'VS Code CLI', category: 'dev', desc: 'Visual Studio Code CLI' },
  'docker': { appName: 'Docker CLI', category: 'dev', desc: 'Container management CLI' },
  'kubectl': { appName: 'Kubernetes CLI', category: 'dev', desc: 'Kubernetes cluster management' },
  'nginx': { appName: 'Nginx', category: 'dev', desc: 'Web server / reverse proxy' },
  'redis-server': { appName: 'Redis', category: 'dev', desc: 'In-memory data store' },
  'postgres': { appName: 'PostgreSQL', category: 'dev', desc: 'Database server' },
  'mysqld': { appName: 'MySQL', category: 'dev', desc: 'Database server' },
  'mongod': { appName: 'MongoDB', category: 'dev', desc: 'NoSQL database server' },
  'brew': { appName: 'Homebrew', category: 'dev', desc: 'macOS package manager' },
  'npx': { appName: 'npx', category: 'dev', desc: 'Node.js package executor' },
  'bun': { appName: 'Bun', category: 'dev', desc: 'JavaScript runtime & toolkit' },
  'deno': { appName: 'Deno', category: 'dev', desc: 'JavaScript/TypeScript runtime' },
  'tsx': { appName: 'TSX', category: 'dev', desc: 'TypeScript execute' },
  'biome': { appName: 'Biome', category: 'dev', desc: 'JS/TS linter & formatter' },
  'eslint': { appName: 'ESLint', category: 'dev', desc: 'JavaScript linter' },
  'prettier': { appName: 'Prettier', category: 'dev', desc: 'Code formatter' },
  'webpack': { appName: 'Webpack', category: 'dev', desc: 'JavaScript bundler' },
  'vite': { appName: 'Vite', category: 'dev', desc: 'Frontend build tool' },
  'next': { appName: 'Next.js', category: 'dev', desc: 'React framework' },
  'uvicorn': { appName: 'Uvicorn', category: 'dev', desc: 'Python ASGI server' },
  'gunicorn': { appName: 'Gunicorn', category: 'dev', desc: 'Python WSGI server' },
  'flask': { appName: 'Flask', category: 'dev', desc: 'Python web framework' },
  'pip': { appName: 'pip', category: 'dev', desc: 'Python package manager' },
  'pip3': { appName: 'pip3', category: 'dev', desc: 'Python package manager' },
};

// Generate a meaningful description for unknown system processes based on name patterns
function describeSystemProcess(execName, cmd) {
  const name = execName.toLowerCase();

  // Known component keywords in daemon/agent names
  const keywords = {
    'network': 'Network management',
    'wifi': 'WiFi management',
    'bluetooth': 'Bluetooth management',
    'audio': 'Audio processing',
    'video': 'Video processing',
    'media': 'Media processing',
    'display': 'Display management',
    'gpu': 'GPU management',
    'disk': 'Disk management',
    'storage': 'Storage management',
    'file': 'File system management',
    'fs': 'File system management',
    'security': 'Security service',
    'auth': 'Authentication service',
    'keychain': 'Keychain access service',
    'crypto': 'Cryptographic service',
    'privacy': 'Privacy management',
    'sandbox': 'App sandboxing',
    'icloud': 'iCloud sync service',
    'cloud': 'Cloud sync service',
    'sync': 'Data synchronization',
    'backup': 'Backup service',
    'update': 'Software update service',
    'install': 'Installation service',
    'download': 'Download management',
    'store': 'App Store / purchase service',
    'commerce': 'Purchase & payment service',
    'notification': 'Notification delivery',
    'push': 'Push notification service',
    'message': 'Messaging service',
    'mail': 'Email service',
    'calendar': 'Calendar service',
    'contact': 'Contacts management',
    'photo': 'Photo library management',
    'camera': 'Camera management',
    'location': 'Location service',
    'geo': 'Geolocation service',
    'map': 'Maps service',
    'weather': 'Weather data service',
    'siri': 'Siri intelligence service',
    'spotlight': 'Spotlight search',
    'search': 'Search service',
    'index': 'Content indexing',
    'knowledge': 'Knowledge & learning service',
    'intelligence': 'Apple Intelligence / ML service',
    'neural': 'Neural Engine / ML service',
    'speech': 'Speech recognition',
    'voice': 'Voice processing',
    'accessibility': 'Accessibility service',
    'input': 'Input management',
    'hid': 'Input device management',
    'print': 'Printing service',
    'usb': 'USB device management',
    'power': 'Power management',
    'thermal': 'Thermal monitoring',
    'battery': 'Battery management',
    'energy': 'Energy management',
    'diagnostic': 'System diagnostics',
    'crash': 'Crash reporting',
    'log': 'System logging',
    'analytics': 'Analytics collection',
    'telemetry': 'Telemetry collection',
    'home': 'HomeKit / smart home',
    'health': 'Health data management',
    'fitness': 'Fitness tracking',
    'wallet': 'Wallet & payments',
    'watch': 'Apple Watch service',
    'remote': 'Remote access/control',
    'sharing': 'File/screen sharing',
    'airdrop': 'AirDrop service',
    'handoff': 'Handoff / Continuity',
    'continuity': 'Continuity service',
    'game': 'Gaming service',
    'metal': 'Metal GPU framework',
    'render': 'Rendering service',
    'font': 'Font management',
    'translation': 'Translation service',
    'safari': 'Safari browser service',
    'webkit': 'WebKit rendering engine',
  };

  for (const [keyword, desc] of Object.entries(keywords)) {
    if (name.includes(keyword)) return desc;
  }

  // Try to parse the framework name from the path
  const fwMatch = cmd.match(/\/([\w]+)\.framework\//);
  if (fwMatch) return `${fwMatch[1]} framework service`;

  // Classify by suffix
  if (name.endsWith('d') && name.length > 3) return `System daemon (${execName})`;
  if (name.endsWith('agent')) return `System agent (${execName})`;
  if (name.endsWith('helper')) return `System helper process`;
  if (name.endsWith('server')) return `System server process`;

  return `macOS system process (${execName})`;
}

function identifyProcess(command) {
  const cmd = command || '';

  // Handle defunct processes
  if (cmd.includes('<defunct>') || cmd === '<defunct>') {
    return { appName: 'Defunct Process', category: 'system', desc: 'Terminated process awaiting cleanup (zombie)' };
  }

  // Handle Core Audio Driver (command starts with "Core Audio Driver")
  if (cmd.startsWith('Core Audio Driver')) {
    const pluginMatch = cmd.match(/\(([^)]+)\)/);
    const plugin = pluginMatch ? pluginMatch[1] : '';
    return { appName: 'Core Audio Driver', category: 'system', desc: `macOS audio driver${plugin ? ' (' + plugin + ')' : ''}` };
  }

  // Extract the executable name from the full path
  const parts = cmd.split(/\s+/);
  const fullExec = parts[0] || '';
  const execName = path.basename(fullExec);

  // 1. Check known system processes
  if (KNOWN_SYSTEM_PROCESSES[execName]) {
    return { ...KNOWN_SYSTEM_PROCESSES[execName] };
  }

  // 2. Check known CLI tools
  if (KNOWN_CLI_TOOLS[execName]) {
    return { ...KNOWN_CLI_TOOLS[execName] };
  }

  // 3. Check Application Support path → belongs to a known parent app
  const appSupportMatch = cmd.match(/\/Application Support\/([^/]+)\//);
  if (appSupportMatch) {
    const parentApp = appSupportMatch[1];
    return { appName: parentApp + ' (helper)', category: 'app', desc: `Helper process for ${parentApp}` };
  }

  // 4. Check if it's from an .app bundle → extract app name
  const appMatch = cmd.match(/\/([^/]+)\.app\//);
  if (appMatch) {
    const appName = appMatch[1];
    if (KNOWN_APPS[appName]) {
      return { appName, ...KNOWN_APPS[appName] };
    }
    const isSystemApp = cmd.includes('/System/') || cmd.includes('/Library/Apple/');
    if (isSystemApp) {
      return { appName, category: 'system', desc: 'macOS system application' };
    }
    return { appName, category: 'app', desc: 'Third-party application' };
  }

  // 4. Check path-based identification
  if (cmd.startsWith('/System/') || cmd.startsWith('/usr/libexec/') || cmd.startsWith('/usr/sbin/')) {
    return { appName: execName, category: 'system', desc: describeSystemProcess(execName, cmd) };
  }
  if (cmd.startsWith('/usr/bin/') || cmd.startsWith('/bin/') || cmd.startsWith('/sbin/')) {
    return { appName: execName, category: 'system', desc: describeSystemProcess(execName, cmd) };
  }
  if (cmd.startsWith('/Library/Apple/') || cmd.startsWith('/Library/CoreMediaIO/')) {
    return { appName: execName, category: 'apple', desc: describeSystemProcess(execName, cmd) };
  }
  if (cmd.startsWith('/Library/SystemExtensions/') || cmd.includes('.systemextension/')) {
    return { appName: execName, category: 'app', desc: 'System extension (third-party)' };
  }
  if (cmd.startsWith('/Library/') && !cmd.startsWith('/Library/Apple/')) {
    return { appName: execName, category: 'app', desc: 'Third-party system service' };
  }

  // 5. Common developer tools
  if (execName === 'node' || execName === 'npm') {
    return { appName: 'Node.js', category: 'dev', desc: 'JavaScript runtime' };
  }
  if (execName === 'python3' || execName === 'python') {
    return { appName: 'Python', category: 'dev', desc: 'Python interpreter' };
  }
  if (execName === 'ruby') {
    return { appName: 'Ruby', category: 'dev', desc: 'Ruby interpreter' };
  }
  if (execName === 'java') {
    return { appName: 'Java', category: 'dev', desc: 'Java runtime' };
  }
  if (execName === 'go') {
    return { appName: 'Go', category: 'dev', desc: 'Go compiler/runtime' };
  }
  if (execName === 'cargo' || execName === 'rustc') {
    return { appName: 'Rust', category: 'dev', desc: 'Rust compiler/build tool' };
  }
  if (execName === 'git') {
    return { appName: 'Git', category: 'dev', desc: 'Version control' };
  }
  if (execName === 'Electron' || execName === 'electron') {
    return { appName: 'Electron App', category: 'app', desc: 'Electron-based application' };
  }

  // 6. Check if it's from a Homebrew/usr/local path (likely dev tool)
  if (cmd.startsWith('/usr/local/') || cmd.startsWith('/opt/homebrew/')) {
    return { appName: execName, category: 'dev', desc: 'Homebrew-installed tool' };
  }

  // 7. If it looks like a com.xxx.xxx identifier → system extension or service
  if (execName.match(/^com\.\w+\.\w+/)) {
    if (cmd.includes('objective-see') || cmd.includes('Objective-See')) {
      return { appName: execName, category: 'app', desc: 'Objective-See security tool extension' };
    }
    return { appName: execName, category: 'app', desc: 'Application extension/service' };
  }

  // 8. Unknown
  return { appName: execName || 'Unknown', category: 'unknown', desc: '' };
}

// --- Codesign verification ---
// Persistent codesign cache - survives app restarts
const CODESIGN_CACHE_PATH = path.join(app.getPath('userData'), 'codesign-cache.json');
const CODESIGN_CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

const codesignCache = new Map();

function loadCodesignCache() {
  try {
    if (fs.existsSync(CODESIGN_CACHE_PATH)) {
      const raw = JSON.parse(fs.readFileSync(CODESIGN_CACHE_PATH, 'utf8'));
      const now = Date.now();
      let loaded = 0;
      for (const [key, entry] of Object.entries(raw)) {
        if (entry._ts && (now - entry._ts) < CODESIGN_CACHE_MAX_AGE) {
          codesignCache.set(key, entry);
          loaded++;
        }
      }
      console.log(`[codesign] Loaded ${loaded} cached entries`);
    }
  } catch (e) {
    console.warn('[codesign] Failed to load cache:', e.message);
  }
}

function saveCodesignCache() {
  try {
    const obj = {};
    for (const [key, val] of codesignCache) {
      obj[key] = val;
    }
    fs.writeFileSync(CODESIGN_CACHE_PATH, JSON.stringify(obj), 'utf8');
  } catch (e) {
    console.warn('[codesign] Failed to save cache:', e.message);
  }
}

// Load cache on startup
loadCodesignCache();

async function checkCodesign(execPath) {
  if (!execPath || execPath.startsWith('<') || execPath === '-') return null;
  if (codesignCache.has(execPath)) return codesignCache.get(execPath);

  try {
    const out = await runShell(`codesign -dvv "${execPath}" 2>&1`);
    const result = {
      signed: !out.includes('not signed'),
      apple: out.includes('Authority=Software Signing') || out.includes('Authority=Apple') || out.includes('Apple Root CA'),
      developer: '',
      teamId: '',
      identifier: '',
      format: '',
      authorities: [],
      signedTime: '',
      flags: '',
      platform: '',
      execPath: '',
      raw: out.trim(),
    };

    // Extract all Authority entries (full chain)
    const authorityMatches = out.matchAll(/Authority=(.+)/g);
    for (const m of authorityMatches) {
      result.authorities.push(m[1].trim());
    }
    if (result.authorities.length > 0) result.developer = result.authorities[0];

    const teamMatch = out.match(/TeamIdentifier=(.+)/);
    if (teamMatch && teamMatch[1].trim() !== 'not set') result.teamId = teamMatch[1].trim();

    const idMatch = out.match(/Identifier=(\S+)/);
    if (idMatch) result.identifier = idMatch[1];

    const formatMatch = out.match(/Format=(.+)/);
    if (formatMatch) result.format = formatMatch[1].trim();

    const timeMatch = out.match(/Signed Time=(.+)/);
    if (timeMatch) result.signedTime = timeMatch[1].trim();

    const flagsMatch = out.match(/CodeDirectory .* flags=(\S+)/);
    if (flagsMatch) result.flags = flagsMatch[1];

    // Detect ad-hoc signing (no real identity, local self-sign only)
    result.adhoc = (result.flags && result.flags.includes('adhoc')) ||
                   out.includes('Signature=adhoc') ||
                   (result.signed && result.authorities.length === 0 && !result.teamId);

    const platMatch = out.match(/Platform identifier=(\S+)/);
    if (platMatch) result.platform = platMatch[1];

    const execMatch = out.match(/Executable=(.+)/);
    if (execMatch) result.execPath = execMatch[1].trim();

    result._ts = Date.now();
    codesignCache.set(execPath, result);
    return result;
  } catch (e) {
    const result = { signed: false, apple: false, developer: '', teamId: '', identifier: '', format: '', authorities: [], signedTime: '', flags: '', platform: '', execPath: '', raw: e.message, _ts: Date.now() };
    codesignCache.set(execPath, result);
    return result;
  }
}

function assessRisk(proc, codesign) {
  // Safe: known system/apple processes
  if (proc.category === 'system' || proc.category === 'apple') {
    return { level: 'safe', label: 'Safe', reason: 'Known macOS system process' };
  }

  // Safe: known apps
  if (proc.category === 'app' && proc.desc && proc.desc !== 'Third-party application' && proc.desc !== 'Application extension/service' && proc.desc !== 'System extension (third-party)') {
    return { level: 'safe', label: 'Safe', reason: 'Known application' };
  }

  // Dev tools from known paths
  if (proc.category === 'dev') {
    return { level: 'safe', label: 'Safe', reason: 'Developer tool' };
  }

  // Codesign checks
  if (codesign) {
    if (codesign.apple) {
      return { level: 'safe', label: 'Safe', reason: `Apple signed: ${codesign.developer}` };
    }
    if (codesign.signed && codesign.teamId) {
      return { level: 'info', label: 'Verified', reason: `Signed by: ${codesign.developer} (${codesign.teamId})` };
    }
    if (codesign.signed) {
      return { level: 'info', label: 'Signed', reason: `Signed: ${codesign.developer || 'yes'}` };
    }
    if (!codesign.signed) {
      return { level: 'warning', label: 'Unsigned', reason: 'No code signature found' };
    }
  }

  // Unknown process
  if (proc.category === 'unknown') {
    return { level: 'warning', label: 'Review', reason: 'Unknown process - verify manually' };
  }

  return { level: 'info', label: 'Check', reason: 'Verify this process' };
}

// --- IPC: Processes ---
ipcMain.handle('get-processes', async () => {
  try {
    const out = await runCommand('ps', ['aux']);
    const lines = out.split('\n').filter(Boolean);
    const processes = [];

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(/\s+/);
      if (parts.length < 11) continue;
      const command = parts.slice(10).join(' ');
      const identity = identifyProcess(command);
      processes.push({
        user: parts[0],
        pid: parseInt(parts[1]),
        cpu: parseFloat(parts[2]),
        mem: parseFloat(parts[3]),
        vsz: parts[4],
        rss: parts[5],
        tt: parts[6],
        stat: parts[7],
        started: parts[8],
        time: parts[9],
        command,
        appName: identity.appName,
        category: identity.category,
        desc: identity.desc,
      });
    }

    // Quick risk assessment without codesign (fast)
    for (const proc of processes) {
      const risk = assessRisk(proc, null);
      proc.risk = risk.level;
      proc.riskLabel = risk.label;
      proc.riskReason = risk.reason;
    }

    return { ok: true, data: processes };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// --- IPC: Codesign batch check (async, called after processes load) ---
ipcMain.handle('check-codesign-batch', async (event, commands) => {
  try {
    // Resolve PIDs to full executable paths via /proc or lsof
    let pidExecMap = new Map();
    try {
      const psOut = await runShell('ps -eo pid,comm 2>/dev/null || true');
      for (const line of psOut.split('\n')) {
        const trimmed = line.trim();
        const spaceIdx = trimmed.indexOf(' ');
        if (spaceIdx > 0) {
          const pid = parseInt(trimmed.substring(0, spaceIdx));
          const comm = trimmed.substring(spaceIdx + 1).trim();
          if (!isNaN(pid) && comm.startsWith('/')) pidExecMap.set(pid, comm);
        }
      }
    } catch (e) { /* ignore */ }

    // commands = [{pid, command}, ...] — deduplicate by exec path
    const execPathMap = new Map();
    for (const { pid, command } of commands) {
      // Prefer resolved full path from ps, fallback to command field
      let execPath = pidExecMap.get(pid) || (command || '').split(/\s+/)[0];
      if (!execPath || execPath.startsWith('<') || execPath === '-') continue;
      // Skip short names without path - codesign needs full path
      if (!execPath.includes('/')) {
        try {
          const resolved = await runShell(`which "${execPath}" 2>/dev/null || true`);
          if (resolved.trim() && resolved.trim().startsWith('/')) {
            execPath = resolved.trim();
          } else {
            continue;
          }
        } catch (e) { continue; }
      }
      if (!execPathMap.has(execPath)) execPathMap.set(execPath, []);
      execPathMap.get(execPath).push(pid);
    }

    const results = {}; // pid -> { codesign, risk }
    const uniquePaths = [...execPathMap.keys()];
    const batchSize = 30;

    for (let i = 0; i < uniquePaths.length; i += batchSize) {
      const batch = uniquePaths.slice(i, i + batchSize);
      await Promise.all(batch.map(async (execPath) => {
        const cs = await checkCodesign(execPath);
        if (cs) {
          for (const pid of execPathMap.get(execPath)) {
            results[pid] = cs;
          }
        }
      }));
    }

    // Save cache to disk after batch check
    saveCodesignCache();
    return { ok: true, data: results };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// --- IPC: Ports (lsof) ---
ipcMain.handle('get-ports', async () => {
  try {
    const out = await runShell('lsof -i -P -n 2>/dev/null || true');
    const lines = out.split('\n').filter(Boolean);
    const connections = [];

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(/\s+/);
      if (parts.length < 9) continue;

      const name = parts.slice(8).join(' ');
      const nameParts = name.split('->');
      const localPart = nameParts[0] || '';
      const remotePart = nameParts[1] || '';

      let state = '';
      if (name.includes('(')) {
        const m = name.match(/\((\w+)\)/);
        state = m ? m[1] : '';
      }

      // Identify the process behind this connection
      const cmdName = parts[0];
      // Try to find full command from a quick ps lookup (we'll batch this)
      const identity = identifyProcess(cmdName);

      connections.push({
        command: cmdName,
        pid: parseInt(parts[1]),
        user: parts[2],
        fd: parts[3],
        type: parts[4],
        device: parts[5],
        sizeOff: parts[6],
        node: parts[7],
        local: localPart.replace(/\(.*\)/, '').trim(),
        remote: remotePart.replace(/\(.*\)/, '').trim(),
        state: state.replace(/[()]/g, ''),
        raw: name,
        appName: identity.appName,
        category: identity.category,
        desc: identity.desc,
      });
    }

    // Enrich with full command paths from ps for better identification
    try {
      const psOut = await runCommand('ps', ['-eo', 'pid,command']);
      const psMap = new Map();
      psOut.split('\n').forEach(line => {
        const trimmed = line.trim();
        const spaceIdx = trimmed.indexOf(' ');
        if (spaceIdx > 0) {
          const pid = parseInt(trimmed.substring(0, spaceIdx));
          const cmd = trimmed.substring(spaceIdx + 1);
          if (!isNaN(pid)) psMap.set(pid, cmd);
        }
      });

      for (const conn of connections) {
        const fullCmd = psMap.get(conn.pid);
        if (fullCmd) {
          conn.fullCommand = fullCmd;
          const richer = identifyProcess(fullCmd);
          // Only upgrade if we got a better result
          if (richer.category !== 'unknown' || conn.category === 'unknown') {
            conn.appName = richer.appName;
            conn.category = richer.category;
            conn.desc = richer.desc;
          }
        }
        // Quick risk assessment
        const risk = assessRisk(conn, null);
        conn.risk = risk.level;
        conn.riskLabel = risk.label;
        conn.riskReason = risk.reason;
      }
    } catch (_) {}

    return { ok: true, data: connections };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// --- IPC: Network (reuses lsof, same format as ports) ---
ipcMain.handle('get-network', async () => {
  try {
    const out = await runShell('lsof -i -P -n 2>/dev/null || true');
    const lines = out.split('\n').filter(Boolean);
    const connections = [];

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(/\s+/);
      if (parts.length < 9) continue;

      const name = parts.slice(8).join(' ');
      const nameParts = name.split('->');
      const localPart = nameParts[0] || '';
      const remotePart = nameParts[1] || '';

      let state = '';
      if (name.includes('(')) {
        const m = name.match(/\((\w+)\)/);
        state = m ? m[1] : '';
      }

      const hasRemote = remotePart.length > 0;

      const cmdName = parts[0];
      const identity = identifyProcess(cmdName);

      connections.push({
        command: cmdName,
        pid: parseInt(parts[1]),
        user: parts[2],
        type: parts[4],
        node: parts[7],
        local: localPart.replace(/\(.*\)/, '').trim(),
        remote: remotePart.replace(/\(.*\)/, '').trim(),
        state: state.replace(/[()]/g, ''),
        direction: hasRemote ? 'outbound' : 'listen',
        appName: identity.appName,
        category: identity.category,
        desc: identity.desc,
      });
    }

    // Enrich with full command paths from ps
    try {
      const psOut = await runCommand('ps', ['-eo', 'pid,command']);
      const psMap = new Map();
      psOut.split('\n').forEach(line => {
        const trimmed = line.trim();
        const spaceIdx = trimmed.indexOf(' ');
        if (spaceIdx > 0) {
          const pid = parseInt(trimmed.substring(0, spaceIdx));
          const cmd = trimmed.substring(spaceIdx + 1);
          if (!isNaN(pid)) psMap.set(pid, cmd);
        }
      });

      for (const conn of connections) {
        const fullCmd = psMap.get(conn.pid);
        if (fullCmd) {
          conn.fullCommand = fullCmd;
          const richer = identifyProcess(fullCmd);
          if (richer.category !== 'unknown' || conn.category === 'unknown') {
            conn.appName = richer.appName;
            conn.category = richer.category;
            conn.desc = richer.desc;
          }
        }
        const risk = assessRisk(conn, null);
        conn.risk = risk.level;
        conn.riskLabel = risk.label;
        conn.riskReason = risk.reason;
      }
    } catch (_) {}

    return { ok: true, data: connections };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// --- IPC: Startup Items ---
ipcMain.handle('get-startup-items', async () => {
  try {
    const items = [];

    // LaunchAgents / LaunchDaemons directories
    const dirs = [
      { path: path.join(os.homedir(), 'Library/LaunchAgents'), type: 'User Agent' },
      { path: '/Library/LaunchAgents', type: 'System Agent' },
      { path: '/Library/LaunchDaemons', type: 'System Daemon' },
    ];

    // Get loaded services
    let loadedServices = new Set();
    try {
      const launchctlOut = await runCommand('launchctl', ['list']);
      launchctlOut.split('\n').forEach(line => {
        const parts = line.split('\t');
        if (parts.length >= 3) loadedServices.add(parts[2]);
      });
    } catch (_) {}

    // Read plist files from each directory
    for (const dir of dirs) {
      try {
        const files = fs.readdirSync(dir.path).filter(f => f.endsWith('.plist'));
        for (const file of files) {
          const filePath = path.join(dir.path, file);
          const label = file.replace('.plist', '');
          let program = '';

          try {
            const jsonOut = await runShell(`plutil -convert json -o - "${filePath}" 2>/dev/null`);
            const plist = JSON.parse(jsonOut);
            program = plist.Program || (plist.ProgramArguments && plist.ProgramArguments[0]) || '';
          } catch (_) {}

          items.push({
            name: label,
            type: dir.type,
            path: filePath,
            program,
            loaded: loadedServices.has(label),
          });
        }
      } catch (_) {
        // Directory may not exist or not be readable
      }
    }

    // Login Items via osascript
    try {
      const loginOut = await runShell(
        'osascript -e \'tell application "System Events" to get the name of every login item\' 2>/dev/null'
      );
      if (loginOut.trim()) {
        loginOut.trim().split(', ').forEach(name => {
          items.push({
            name: name.trim(),
            type: 'Login Item',
            path: '',
            program: '',
            loaded: true,
          });
        });
      }
    } catch (_) {}

    return { ok: true, data: items };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
