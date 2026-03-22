//
// Cross-browser compatibility. Detect which API is available and 
// assign to browserAPI.
//
// Use 'browser' for Firefox and 'chrome' for Chrome.
//
// Test for 'browser' first to prioritize Firefox, since Firefox
// also supports 'chrome' API but with reduced functionality.
//
//const browserAPI = typeof chrome !== 'undefined' ? chrome : browser;
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

//console.log(typeof browser !== 'undefined' ? 'Using Firefox API' : 'Using Chrome API');

//
// Get the domain for the current active tab
//
async function getCurrentDomain() {
  const tabs = await browserAPI.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]) {
    const url = new URL(tabs[0].url);
    return url.hostname;
  }
  return null;
}

//
// Display current domain
//
async function displayDomain() {
  const domain = await getCurrentDomain();
  const domainLabel = document.getElementById('domainLabel');

  if (domain) {
    domainLabel.textContent = domain;
  } else {
    domainLabel.textContent = 'Error: Unable to detect website domain name';
    document.getElementById('clearButton').disabled = true;
    document.getElementById('jsToggle').disabled = true;
  }
}

//
// Load the list of domains with JavaScript disabled from storage
//
async function getJsDisabledSites() {
  const result = await browserAPI.storage.local.get({ jsDisabledSites: [] });
  return result.jsDisabledSites;
}

//
// Save the list of domains with JavaScript disabled to storage
//
async function setJsDisabledSites(sites) {
  await browserAPI.storage.local.set({ jsDisabledSites: sites });
}

//
// Initialize the JavaScript toggle checkbox state from storage
//
async function initJsToggle() {
  const domain = await getCurrentDomain();
  if (!domain) return;

  const jsToggle = document.getElementById('jsToggle');
  const sites = await getJsDisabledSites();
  jsToggle.checked = sites.includes(domain);
}

//
// Toggle JavaScript enabled/disabled for the current domain
//
async function toggleJavaScript() {
  const domain = await getCurrentDomain();
  if (!domain) return;

  const jsToggle = document.getElementById('jsToggle');
  const isDisabled = jsToggle.checked;
  const sites = await getJsDisabledSites();

  //
  // Chrome: use contentSettings API to block/allow JavaScript.
  // Firefox: the background script handles blocking via CSP header
  // injection, triggered by the storage change below.
  //
  if (browserAPI.contentSettings && browserAPI.contentSettings.javascript) {
    const primaryPattern = `*://${domain}/*`;
    const setting = isDisabled ? 'block' : 'allow';

    await browserAPI.contentSettings.javascript.set({
      primaryPattern: primaryPattern,
      setting: setting
    });
  }

  //
  // Update the stored list of disabled sites
  //
  if (isDisabled && !sites.includes(domain)) {
    sites.push(domain);
  } else if (!isDisabled) {
    const index = sites.indexOf(domain);
    if (index !== -1) {
      sites.splice(index, 1);
    }
  }

  await setJsDisabledSites(sites);

  //
  // Reload the active tab so the change takes effect.
  // For Firefox, the CSP header is applied on the next page load.
  // For Chrome, contentSettings takes effect on reload as well.
  //
  const tabs = await browserAPI.tabs.query({ active: true, currentWindow: true });
  if (tabs[0]) {
    browserAPI.tabs.reload(tabs[0].id);
  }
}

//
// Clear data for the current domain
//
async function clearSiteData() {
  const infoLabel = document.getElementById('infoLabel');
  const statusLabel = document.getElementById('statusLabel');
  const clearButton = document.getElementById('clearButton');
  const progressContainer = document.getElementById('progressContainer');

  try {
    clearButton.disabled = true;
    statusLabel.className = 'status working';
    statusLabel.textContent = 'Clearing Data...';
    progressContainer.style.display = 'block';

    const domain = await getCurrentDomain();
    if (!domain) {
      throw new Error('Error: Unable to detect domain');
    }

    const tabs = await browserAPI.tabs.query({ active: true, currentWindow: true });
    const currentUrl = tabs[0].url;

    //
    // Initialize tracking variables
    //
    let totalCookies = 0;
    let clearedCookies = 0;

    //
    // Inner helper function to update progress UI
    //
    function updateProgress(cookiesClearedCount, totalCookiesCount, phase) {
      const percentage = totalCookiesCount > 0
        ? Math.round((cookiesClearedCount / totalCookiesCount) * 100)
        : 0;

      document.getElementById('progressFill').style.width = percentage + '%';
      document.getElementById('progressText').textContent = percentage + '%';
    }

    //
    // Inner helper function to clear cookies with progress tracking
    //
    async function clearCookiesWithProgress(cookieList, label) {
      const cookiePromises = [];
      let clearedCount = 0;

      document.getElementById(label + 'Count').textContent = `0/${cookieList.length}`;

      for (const cookie of cookieList) {
        const url = `http${cookie.secure ? 's' : ''}://${cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain}${cookie.path}`;

        const promise = browserAPI.cookies.remove({
          url: url,
          name: cookie.name
        }).then(() => {
          clearedCount++;
          document.getElementById(label + 'Count').textContent = `${clearedCount}/${cookieList.length}`;
          updateProgress(clearedCookies + clearedCount, totalCookies);
        });

        cookiePromises.push(promise);
      }

      await Promise.all(cookiePromises);
      return clearedCount;
    }

    //
    // Get all cookies and count total
    //
    const cookies = await browserAPI.cookies.getAll({ domain: domain });
    totalCookies = cookies.length;

    const wwwCookies = !domain.startsWith('www.')
      ? await browserAPI.cookies.getAll({ domain: 'www.' + domain })
      : [];
    totalCookies += wwwCookies.length;

    const dotCookies = await browserAPI.cookies.getAll({ domain: '.' + domain });
    totalCookies += dotCookies.length;

    //
    // Clear domain cookies
    //
    const clearedDomain = await clearCookiesWithProgress(cookies, 'cookie');
    clearedCookies += clearedDomain;

    //
    // Clear www cookies
    //
    if (wwwCookies.length > 0) {
      const clearedWww = await clearCookiesWithProgress(wwwCookies, 'wwwCookie');
      clearedCookies += clearedWww;
    }

    //
    // Clear subdomain cookies
    //
    if (dotCookies.length > 0) {
      const clearedSubdomain = await clearCookiesWithProgress(dotCookies, 'subdomainCookie');
      clearedCookies += clearedSubdomain;
    }

    //
    // TODO: Add feature to check browser type and use appropriate API calls
    //

    //
    // Using origins to clear other storage types is not supported in Chrome.
    // The following code is commented out to maintain cross-browser compatibility.
    // Need to find alternative methods for Chrome.
    //
    // //
    // // Clear browsing data for the specific origin
    // //
    // const origin = new URL(currentUrl).origin;
    //
    // // Clear various types of storage
    // await browserAPI.browsingData.remove({
    //   origins: [origin]
    // }, {
    //   cacheStorage: true,
    //   cookies: true,
    //   fileSystems: true,
    //   indexedDB: true,
    //   localStorage: true,
    //   serviceWorkers: true,
    //   webSQL: true
    // });
    //

    //
    // Finalize progress
    //
    document.getElementById('progressFill').style.width = '100%';
    document.getElementById('progressText').textContent = '100%';

    statusLabel.className = 'status success';
    statusLabel.textContent = `Successfully cleared ${clearedCookies} item(s) for ${domain}`;

    //
    // Hide progress and disable button for 3 seconds
    //
    setTimeout(() => {
      clearButton.disabled = false;
      statusLabel.className = 'status';
      progressContainer.style.display = 'none';
    }, 3000);

  } catch (error) {
    console.error('Error clearing data:', error);
    statusLabel.className = 'status error';
    statusLabel.textContent = 'Error: ' + error.message;
    progressContainer.style.display = 'none';

    //
    // Re-enable button after slightly longer than 3 seconds
    //
    setTimeout(() => {
      clearButton.disabled = false;
      statusLabel.className = 'status';
    }, 3100);
  }
}

//
// Initialize popup
//
document.addEventListener('DOMContentLoaded', () => {
  displayDomain();
  initJsToggle();
  document.getElementById('clearButton').addEventListener('click', clearSiteData);
  document.getElementById('jsToggle').addEventListener('change', toggleJavaScript);
});
