// background.js
// Workspace Manager Background Script
// This script handles workspace data storage, event listeners for tab/window changes,
// message passing to/from the popup, and includes debouncing logic to batch rapid updates.

const DEBOUNCE_DELAY = 800;
let pendingUpdates = new Set();
let updateTimer = null;

// Global object to track the last active timestamp for each window.
let windowLastActive = {};

// Helper functions for storage access
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

async function setWorkspaces(workspaces, nextId) {
  try {
    await browser.storage.local.set({ workspaces, nextId });
  } catch (e) {
    console.error("Error setting workspaces:", e);
  }
}

/**
 * Sanitizes a list of URLs.
 * Only http, https, and about:blank are allowed; all others are replaced.
 *
 * @param {Array<string>} urlList - The list of URLs to sanitize.
 * @returns {Array<string>} A sanitized list of URLs.
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

/**
 * Schedules a workspace update for a given window using debouncing.
 *
 * @param {number} windowId - The ID of the window to update.
 */
function scheduleWorkspaceUpdate(windowId) {
  if (!windowId) return;
  pendingUpdates.add(windowId);
  if (updateTimer) clearTimeout(updateTimer);
  updateTimer = setTimeout(processUpdates, DEBOUNCE_DELAY);
}

/**
 * Processes all pending workspace updates.
 */
async function processUpdates() {
  const { workspaces } = await getWorkspaces();
  for (let winId of pendingUpdates) {
    try {
      let tabs = await browser.tabs.query({ windowId: winId });
      // Update any workspace that corresponds to this window
      Object.keys(workspaces).forEach(wsId => {
        if (workspaces[wsId].windowId === winId) {
          workspaces[wsId].tabs = tabs.map(tab => tab.url);
          if (tabs.length > 0) {
            // Label is the title of the last tab
            workspaces[wsId].title = tabs[tabs.length - 1].title || "";
          }
        }
      });
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
 * Handles a message from the popup.
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
      // Focusing an unsaved window
      browser.windows.update(msg.windowId, { focused: true })
        .then(() => sendResponse({ success: true }))
        .catch(err => sendResponse({ success: false, error: err.message }));
      break;
    case "deleteWorkspace":
      handleDeleteWorkspace(msg.workspaceId, sendResponse);
      break;
    default:
      console.warn("Unknown action:", msg.action);
      sendResponse({ success: false, error: "Unknown action" });
  }
  // Return true to indicate sendResponse will be called asynchronously.
  return true;
});

/**
 * Retrieves saved and unsaved windows, then sends state to the popup.
 *
 * @param {Function} sendResponse - The callback to send the response.
 */
async function handleGetState(sendResponse) {
  try {
    let { workspaces } = await getWorkspaces();
    // Get current open windows
    let openWindows = await browser.windows.getAll({ populate: true });
    
    // Prepare saved workspace list
    let savedWorkspaces = Object.values(workspaces);
    
    // Unsaved windows: open windows not in any workspace.windowId
    let savedWindowIds = savedWorkspaces.map(ws => ws.windowId).filter(id => id !== null);
    let unsavedWindows = openWindows.filter(win => !savedWindowIds.includes(win.id))
      .map(win => {
        let tabs = win.tabs;
        let label = tabs && tabs.length > 0 ? tabs[tabs.length - 1].title : "(No Tabs)";
        // Attach last active timestamp from our global store (or 0 if not set)
        return { windowId: win.id, title: label, lastActive: windowLastActive[win.id] || 0 };
      });
    
    // Order unsaved windows by last active time (most recent first)
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
 * @param {Function} sendResponse - The callback to send the response.
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
 * @param {number} workspaceId - The workspace ID to open/focus.
 * @param {Function} sendResponse - The callback to send the response.
 */
async function handleOpenWorkspace(workspaceId, sendResponse) {
  try {
    let { workspaces } = await getWorkspaces();
    let workspace = workspaces[workspaceId];
    if (!workspace) {
      sendResponse({ success: false, error: "Workspace not found." });
      return;
    }
    // Try to focus if the window is still open
    if (workspace.windowId) {
      try {
        await browser.windows.update(workspace.windowId, { focused: true });
        console.info("Focused window", workspace.windowId);
        sendResponse({ success: true, message: "Window focused." });
        return;
      } catch (focusError) {
        console.warn("Window not found; reopening workspace.", focusError);
        // Fall through to create a new window
      }
    }
    // Create new window with sanitized URLs
    let sanitizedUrls = sanitizeUrls(workspace.tabs);
    let newWin = await browser.windows.create({ url: sanitizedUrls });
    workspace.windowId = newWin.id;
    // Update saved workspace with new windowId
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
 * @param {number} workspaceId - The workspace ID to delete.
 * @param {Function} sendResponse - The callback to send the response.
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

/* Event Listeners for automatic updates */

// When a tab is created, updated, removed, moved, or attached/detached,
// schedule an update for the corresponding window.
browser.tabs.onCreated.addListener(tab => {
  scheduleWorkspaceUpdate(tab.windowId);
});

browser.tabs.onRemoved.addListener((tabId, removeInfo) => {
  scheduleWorkspaceUpdate(removeInfo.windowId);
});

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.title) {
    scheduleWorkspaceUpdate(tab.windowId);
  }
});

browser.tabs.onMoved.addListener((tabId, moveInfo) => {
  scheduleWorkspaceUpdate(moveInfo.windowId);
});

browser.tabs.onAttached.addListener((tabId, attachInfo) => {
  scheduleWorkspaceUpdate(attachInfo.newWindowId);
});

browser.tabs.onDetached.addListener((tabId, detachInfo) => {
  scheduleWorkspaceUpdate(detachInfo.oldWindowId);
});

// When a window is created or removed, update state accordingly.
browser.windows.onCreated.addListener(window => {
  console.info("Window created", window.id);
});

browser.windows.onRemoved.addListener(windowId => {
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
});

// Listen for window focus changes to update last active timestamps.
browser.windows.onFocusChanged.addListener(windowId => {
  if (windowId > 0) { // windowId == -1 means no window is focused
    windowLastActive[windowId] = Date.now();
    console.info("Updated last active time for window", windowId);
  }
});