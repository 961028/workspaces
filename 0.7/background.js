// background.js
// Workspace Manager Background Script
// This script manages workspace data storage, listens to tab/window events,
// processes messages from the popup, and implements debouncing to batch updates.

const DEBOUNCE_DELAY = 800;
let pendingUpdates = new Set();
let updateTimer = null;

// Global object to track the last active timestamp for each window.
let windowLastActive = {};

/* ===== STORAGE HELPERS ===== */

/**
 * Retrieves workspaces and next available ID from storage.
 *
 * @returns {Promise<{workspaces: Object, nextId: number}>}
 */
async function getWorkspaces() {
  try {
    const data = await browser.storage.local.get(["workspaces", "nextId"]);
    return {
      workspaces: data.workspaces || {},
      nextId: data.nextId || 1
    };
  } catch (e) {
    console.error("Error fetching workspaces:", e);
    return { workspaces: {}, nextId: 1 };
  }
}

/**
 * Saves the provided workspaces and nextId into storage.
 *
 * @param {Object} workspaces - The workspaces object.
 * @param {number} nextId - The next workspace identifier.
 */
async function setWorkspaces(workspaces, nextId) {
  try {
    await browser.storage.local.set({ workspaces, nextId });
  } catch (e) {
    console.error("Error setting workspaces:", e);
  }
}

/* ===== URL HELPER ===== */

/**
 * Sanitizes a list of URLs by ensuring only allowed protocols.
 * Allowed: http, https, and about:blank.
 *
 * @param {Array<string>} urlList - The list of URLs to sanitize.
 * @returns {Array<string>} Sanitized URL list.
 */
function sanitizeUrls(urlList) {
  return urlList.map(url => {
    if (url.startsWith("http://") || url.startsWith("https://") || url === "about:blank") {
      return url;
    }
    console.warn("Blocked or unsupported URL replaced with about:blank:", url);
    return "about:blank";
  });
}

/* ===== DEBOUNCING LOGIC ===== */

/**
 * Schedules an update for a given window ID using debouncing.
 *
 * @param {number} windowId - The window ID to update.
 */
function scheduleWorkspaceUpdate(windowId) {
  if (!windowId) return;
  pendingUpdates.add(windowId);
  if (updateTimer) clearTimeout(updateTimer);
  updateTimer = setTimeout(processPendingUpdates, DEBOUNCE_DELAY);
}

/**
 * Processes all pending updates for windows.
 */
async function processPendingUpdates() {
  const { workspaces } = await getWorkspaces();
  for (let winId of pendingUpdates) {
    try {
      let tabs = await browser.tabs.query({ windowId: winId });
      updateWorkspaceForWindow(workspaces, winId, tabs);
      await browser.storage.local.set({ workspaces });
      console.info("Updated workspace for window", winId);
    } catch (e) {
      console.error("Error updating workspace for window", winId, e);
    }
  }
  pendingUpdates.clear();
  updateTimer = null;
}

/**
 * Updates workspace entries corresponding to a given window using current tabs.
 *
 * @param {Object} workspaces - The current workspaces object.
 * @param {number} winId - The window ID to update.
 * @param {Array<Object>} tabs - List of tabs in the window.
 */
function updateWorkspaceForWindow(workspaces, winId, tabs) {
  Object.keys(workspaces).forEach(wsId => {
    if (workspaces[wsId].windowId === winId) {
      workspaces[wsId].tabs = tabs.map(tab => tab.url);
      workspaces[wsId].title = (tabs.length > 0 && tabs[tabs.length - 1].title) || "";
    }
  });
}

/* ===== MESSAGE HANDLERS ===== */

/**
 * Handles "getState" messages by retrieving saved workspaces and unsaved windows.
 *
 * @param {Function} sendResponse - Callback to send the response.
 */
async function handleGetState(sendResponse) {
  try {
    let { workspaces } = await getWorkspaces();
    let openWindows = await browser.windows.getAll({ populate: true });
    
    // Saved workspaces are simply the values from storage.
    let savedWorkspaces = Object.values(workspaces);
    
    // Determine unsaved windows by filtering out windows already saved.
    let savedWindowIds = savedWorkspaces.map(ws => ws.windowId).filter(id => id !== null);
    let unsavedWindows = openWindows.filter(win => !savedWindowIds.includes(win.id))
      .map(win => {
        let tabs = win.tabs;
        let label = (tabs && tabs.length > 0) ? tabs[tabs.length - 1].title : "(No Tabs)";
        return { windowId: win.id, title: label, lastActive: windowLastActive[win.id] || 0 };
      });
    
    // Sort unsaved windows by most recent active timestamp.
    unsavedWindows.sort((a, b) => b.lastActive - a.lastActive);
    
    sendResponse({ success: true, saved: savedWorkspaces, unsaved: unsavedWindows });
  } catch (e) {
    console.error("Error in getState:", e);
    sendResponse({ success: false, error: e.message });
  }
}

/**
 * Saves an open window as a new workspace.
 *
 * @param {number} windowId - The ID of the window to save.
 * @param {Function} sendResponse - Callback to send the response.
 */
async function handleSaveWindow(windowId, sendResponse) {
  try {
    let tabs = await browser.tabs.query({ windowId });
    if (!tabs || tabs.length === 0) {
      sendResponse({ success: false, error: "Window has no tabs." });
      return;
    }
    let { workspaces, nextId } = await getWorkspaces();
    let newWorkspace = {
      id: nextId,
      windowId: windowId,
      tabs: tabs.map(tab => tab.url),
      title: tabs[tabs.length - 1].title || ""
    };
    workspaces[nextId] = newWorkspace;
    nextId++;
    await setWorkspaces(workspaces, nextId);
    console.info(`Saved window ${windowId} as workspace ${newWorkspace.id}`);
    sendResponse({ success: true, workspace: newWorkspace });
  } catch (e) {
    console.error("Error saving window", windowId, e);
    sendResponse({ success: false, error: e.message });
  }
}

/**
 * Opens (or focuses) a saved workspace.
 *
 * @param {number} workspaceId - The ID of the workspace to open or focus.
 * @param {Function} sendResponse - Callback to send the response.
 */
async function handleOpenWorkspace(workspaceId, sendResponse) {
  try {
    let { workspaces } = await getWorkspaces();
    let workspace = workspaces[workspaceId];
    if (!workspace) {
      sendResponse({ success: false, error: "Workspace not found." });
      return;
    }
    // Attempt to focus the workspace's window if available.
    if (workspace.windowId) {
      try {
        await browser.windows.update(workspace.windowId, { focused: true });
        console.info("Focused window", workspace.windowId);
        sendResponse({ success: true, message: "Window focused." });
        return;
      } catch (focusError) {
        console.warn("Window not found; reopening workspace.", focusError);
      }
    }
    // If not focused or already closed, open a new window.
    let sanitizedUrls = sanitizeUrls(workspace.tabs);
    let newWin = await browser.windows.create({ url: sanitizedUrls });
    workspace.windowId = newWin.id;
    workspaces[workspaceId] = workspace;
    await browser.storage.local.set({ workspaces });
    console.info("Opened workspace", workspaceId, "in new window", newWin.id);
    sendResponse({ success: true, message: "New window opened.", windowId: newWin.id });
  } catch (e) {
    console.error("Error opening workspace", workspaceId, e);
    sendResponse({ success: false, error: e.message });
  }
}

/**
 * Deletes a saved workspace.
 *
 * @param {number} workspaceId - The ID of the workspace to delete.
 * @param {Function} sendResponse - Callback to send the response.
 */
async function handleDeleteWorkspace(workspaceId, sendResponse) {
  try {
    let { workspaces, nextId } = await getWorkspaces();
    if (!workspaces[workspaceId]) {
      sendResponse({ success: false, error: "Workspace not found." });
      return;
    }
    delete workspaces[workspaceId];
    await browser.storage.local.set({ workspaces, nextId });
    console.info("Deleted workspace", workspaceId);
    sendResponse({ success: true });
  } catch (e) {
    console.error("Error deleting workspace", workspaceId, e);
    sendResponse({ success: false, error: e.message });
  }
}

/* ===== MESSAGE LISTENER ===== */

/**
 * Main message listener that routes popup commands to the appropriate handlers.
 */
browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  switch (msg.action) {
    case "getState":
      handleGetState(sendResponse);
      break;
    case "saveWindow":
      handleSaveWindow(msg.windowId, sendResponse);
      break;
    case "openWorkspace":
      handleOpenWorkspace(msg.workspaceId, sendResponse);
      break;
    case "focusWindow":
      focusWindow(msg.windowId, sendResponse);
      break;
    case "deleteWorkspace":
      handleDeleteWorkspace(msg.workspaceId, sendResponse);
      break;
    default:
      console.warn("Unknown action:", msg.action);
      sendResponse({ success: false, error: "Unknown action" });
  }
  // Return true to indicate asynchronous response.
  return true;
});

/**
 * Focuses the specified window.
 *
 * @param {number} windowId - The ID of the window to focus.
 * @param {Function} sendResponse - Callback to send the response.
 */
function focusWindow(windowId, sendResponse) {
  browser.windows.update(windowId, { focused: true })
    .then(() => sendResponse({ success: true }))
    .catch(err => sendResponse({ success: false, error: err.message }));
}

/* ===== EVENT LISTENER REGISTRATION ===== */

/**
 * Registers tab event listeners to trigger workspace updates.
 */
function registerTabListeners() {
  browser.tabs.onCreated.addListener(tab => scheduleWorkspaceUpdate(tab.windowId));
  browser.tabs.onRemoved.addListener((tabId, removeInfo) => scheduleWorkspaceUpdate(removeInfo.windowId));
  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.title) scheduleWorkspaceUpdate(tab.windowId);
  });
  browser.tabs.onMoved.addListener((tabId, moveInfo) => scheduleWorkspaceUpdate(moveInfo.windowId));
  browser.tabs.onAttached.addListener((tabId, attachInfo) => scheduleWorkspaceUpdate(attachInfo.newWindowId));
  browser.tabs.onDetached.addListener((tabId, detachInfo) => scheduleWorkspaceUpdate(detachInfo.oldWindowId));
}

/**
 * Registers window event listeners to manage workspace state.
 */
function registerWindowListeners() {
  browser.windows.onCreated.addListener(win => {
    console.info("Window created", win.id);
  });
  
  browser.windows.onRemoved.addListener(windowId => {
    markWorkspaceClosed(windowId);
  });
  
  browser.windows.onFocusChanged.addListener(windowId => {
    if (windowId > 0) {
      windowLastActive[windowId] = Date.now();
      console.info("Updated last active time for window", windowId);
    }
  });
}

/**
 * Marks workspaces as closed when their window is removed.
 *
 * @param {number} windowId - The ID of the closed window.
 */
function markWorkspaceClosed(windowId) {
  getWorkspaces().then(({ workspaces, nextId }) => {
    let updated = false;
    Object.keys(workspaces).forEach(wsId => {
      if (workspaces[wsId].windowId === windowId) {
        workspaces[wsId].windowId = null;
        updated = true;
      }
    });
    if (updated) {
      browser.storage.local.set({ workspaces, nextId });
      console.info("Marked workspace as closed for window", windowId);
    }
  });
}

// Register listeners.
registerTabListeners();
registerWindowListeners();