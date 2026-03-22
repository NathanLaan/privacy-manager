//
// Background script for Privacy-Manager.
//
// Handles two responsibilities:
// 1. Updates the toolbar icon to green when JavaScript is blocked
//    on the current tab's domain (both Chrome and Firefox).
// 2. Blocks JavaScript on specific domains in Firefox by injecting
//    a Content-Security-Policy header via webRequest.onHeadersReceived.
//    Chrome uses contentSettings.javascript.set() from popup.js instead.
//

const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

//
// Icon paths for default (blue) and JS-blocked (green) states
//
const ICONS_DEFAULT = {
  16: 'icon-shield-blue-16.png',
  24: 'icon-shield-blue-24.png',
  48: 'icon-shield-blue-48.png',
  128: 'icon-shield-blue-128.png'
};

const ICONS_JS_BLOCKED = {
  16: 'icon-shield-green-16.png',
  24: 'icon-shield-green-24.png',
  48: 'icon-shield-green-48.png',
  128: 'icon-shield-green-128.png'
};

//
// Cache of disabled sites for synchronous access
//
let disabledSitesCache = [];

//
// Cross-browser icon setter.
// Chrome MV3 uses chrome.action, Firefox MV2 uses browser.browserAction.
//
const iconAPI = browserAPI.action || browserAPI.browserAction;

//
// Initialize cache from storage on startup
//
browserAPI.storage.local.get({ jsDisabledSites: [] }).then(result => {
  disabledSitesCache = result.jsDisabledSites;
});

//
// Keep cache in sync when storage changes, and update the icon
//
browserAPI.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.jsDisabledSites) {
    disabledSitesCache = changes.jsDisabledSites.newValue || [];
    updateIconForActiveTab();
  }
});

//
// Update the toolbar icon for a specific tab based on whether
// its domain has JavaScript blocked
//
function updateIcon(tabId, url) {
  try {
    const hostname = new URL(url).hostname;
    const isBlocked = disabledSitesCache.includes(hostname);
    const icons = isBlocked ? ICONS_JS_BLOCKED : ICONS_DEFAULT;

    iconAPI.setIcon({
      tabId: tabId,
      path: icons
    });
  } catch (e) {
    //
    // Invalid URL (e.g. about:blank, chrome://) - use default icon
    //
    iconAPI.setIcon({
      tabId: tabId,
      path: ICONS_DEFAULT
    });
  }
}

//
// Update the icon for the currently active tab
//
async function updateIconForActiveTab() {
  const tabs = await browserAPI.tabs.query({ active: true, currentWindow: true });
  if (tabs[0] && tabs[0].url) {
    updateIcon(tabs[0].id, tabs[0].url);
  }
}

//
// Update icon when the user switches tabs
//
browserAPI.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await browserAPI.tabs.get(activeInfo.tabId);
  if (tab && tab.url) {
    updateIcon(tab.id, tab.url);
  }
});

//
// Update icon when a tab navigates to a new URL
//
browserAPI.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url || changeInfo.status === 'complete') {
    if (tab.url) {
      updateIcon(tabId, tab.url);
    }
  }
});

//
// Firefox-only: Block JavaScript on disabled sites by injecting
// a CSP header via webRequest.onHeadersReceived.
// Chrome MV3 does not support blocking webRequest, so this is
// guarded behind a feature check for webRequest.onHeadersReceived.
//
if (browserAPI.webRequest && browserAPI.webRequest.onHeadersReceived) {

  function onHeadersReceived(details) {
    const host = new URL(details.url).hostname;

    if (disabledSitesCache.includes(host)) {
      details.responseHeaders.push({
        name: 'Content-Security-Policy',
        value: "script-src 'none'"
      });
    }

    return { responseHeaders: details.responseHeaders };
  }

  browserAPI.webRequest.onHeadersReceived.addListener(
    onHeadersReceived,
    {
      urls: ['<all_urls>'],
      types: ['main_frame', 'sub_frame']
    },
    ['blocking', 'responseHeaders']
  );
}
