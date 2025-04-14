// background.js
// Workspace Manager Background Script
// Manages workspace data, listens to tab/window events, processes messages,
// and creates a context menu with "Rename Workspace" and "Unsave Workspace" options.

const DEBOUNCE_DELAY = 800;
let pendingUpdates = new Set();
let updateTimer = null;

// Global object to track the last active timestamp for each window.
let windowLastActive = {};

// Global variable to track which workspace (ID) is the target of a context-menu action.
let currentContextWorkspaceId = null;

/* ===== STORAGE HELPERS ===== */

/**
 * Retrieves workspaces and the next available ID from storage.
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
 * Sanitizes a list of URLs by allowing only http, https, and about:blank.
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
 * Schedules an update for the given window using debouncing.
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
 * Processes all pending workspace updates.
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
 * Updates a workspace's data for a given window.
 *
 * @param {Object} workspaces - The current workspaces object.
 * @param {number} winId - The window ID to update.
 * @param {Array<Object>} tabs - List of tabs in the window.
 */
function updateWorkspaceForWindow(workspaces, winId, tabs) {
  const activeTab = tabs.find(tab => tab.active) || tabs[tabs.length - 1];
  Object.keys(workspaces).forEach(wsId => {
    if (workspaces[wsId].windowId === winId) {
      workspaces[wsId].tabs = tabs.map(tab => tab.url);
      workspaces[wsId].title = activeTab ? activeTab.title : "";
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
    let savedWorkspaces = Object.values(workspaces);
    let savedWindowIds = savedWorkspaces.map(ws => ws.windowId).filter(id => id !== null);
    let unsavedWindows = openWindows.filter(win => !savedWindowIds.includes(win.id))
      .map(win => {
        let tabs = win.tabs;
        const activeTab = tabs.find(tab => tab.active) || tabs[0];
        let label = activeTab && activeTab.title ? activeTab.title : "(No Tabs)";
        return { windowId: win.id, title: label, lastActive: windowLastActive[win.id] || 0 };
      });
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
    let activeTab = tabs.find(tab => tab.active) || tabs[0];
    let newWorkspace = {
      id: nextId,
      windowId: windowId,
      tabs: tabs.map(tab => tab.url),
      title: activeTab && activeTab.title ? activeTab.title : ""
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
 * @param {number} workspaceId - The workspace ID to open/focus.
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
 * Deletes (unsaves) a workspace.
 *
 * @param {number} workspaceId - The workspace ID to unsave.
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
    console.info("Deleted (unsaved) workspace", workspaceId);
    sendResponse({ success: true });
  } catch (e) {
    console.error("Error deleting workspace", workspaceId, e);
    sendResponse({ success: false, error: e.message });
  }
}

/**
 * Renames a workspace.
 *
 * @param {number} workspaceId - The workspace ID to rename.
 * @param {string} newName - The new name for the workspace.
 * @param {Function} sendResponse - Callback to send the response.
 */
async function handleRenameWorkspace(workspaceId, newName, sendResponse) {
  try {
    let { workspaces, nextId } = await getWorkspaces();
    if (!workspaces[workspaceId]) {
      sendResponse({ success: false, error: "Workspace not found." });
      return;
    }
    workspaces[workspaceId].title = newName;
    await browser.storage.local.set({ workspaces, nextId });
    console.info("Renamed workspace", workspaceId, "to", newName);
    sendResponse({ success: true, message: "Workspace renamed." });
  } catch (e) {
    console.error("Error renaming workspace", workspaceId, e);
    sendResponse({ success: false, error: e.message });
  }
}

/* ===== MESSAGE LISTENER ===== */

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
    case "renameWorkspace":
      handleRenameWorkspace(msg.workspaceId, msg.newName, sendResponse);
      break;
    case "setContextWorkspace":
      // From popup: records which workspace was right-clicked.
      currentContextWorkspaceId = msg.workspaceId;
      break;
    default:
      console.warn("Unknown action:", msg.action);
      sendResponse({ success: false, error: "Unknown action" });
  }
  return true;
});

/**
 * Focuses the specified window.
 *
 * @param {number} windowId - The window to focus.
 * @param {Function} sendResponse - Callback to send the response.
 */
function focusWindow(windowId, sendResponse) {
  browser.windows.update(windowId, { focused: true })
    .then(() => sendResponse({ success: true }))
    .catch(err => sendResponse({ success: false, error: err.message }));
}

/* ===== CONTEXT MENU CREATION & HANDLING ===== */

// Create context menu items.
browser.contextMenus.create({
  id: "renameWorkspace",
  title: "Rename Workspace",
  contexts: ["all"]
});
browser.contextMenus.create({
  id: "unsaveWorkspace",
  title: "Unsave Workspace",
  contexts: ["all"]
});

// When a context menu item is clicked, check the stored workspace ID and act.
browser.contextMenus.onClicked.addListener((info, tab) => {
  if (!currentContextWorkspaceId) {
    console.warn("No workspace context available.");
    return;
  }
  switch (info.menuItemId) {
    case "renameWorkspace":
      // Instead of calling prompt here, forward the request to the popup.
      browser.runtime.sendMessage({
        action: "renameWorkspaceRequest",
        workspaceId: currentContextWorkspaceId
      });
      break;
    case "unsaveWorkspace":
      handleDeleteWorkspace(currentContextWorkspaceId, () => {
        console.info("Workspace unsaved.");
      });
      break;
    default:
      console.warn("Unknown context menu item:", info.menuItemId);
  }
  currentContextWorkspaceId = null;
});

/* ===== EVENT LISTENER REGISTRATION ===== */

/**
 * Registers all tab-related event listeners for workspace updates.
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
  browser.tabs.onActivated.addListener(activeInfo => scheduleWorkspaceUpdate(activeInfo.windowId));
}

/**
 * Registers window-related event listeners.
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

registerTabListeners();
registerWindowListeners();
