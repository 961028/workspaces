// background.js

// --- Message Listener ---
browser.runtime.onMessage.addListener((request, sender) => {
    log("Received message:", request, "from sender:", sender);
    switch (request.command) {
      case COMMANDS.SAVE:
        log("Handling 'save' command for workspace:", request.name);
        return saveWorkspace(request.name);
      case COMMANDS.OPEN:
        log("Handling 'open' command for workspace:", request.name);
        return openWorkspace(request.name);
      case COMMANDS.DELETE:
        log("Handling 'delete' command for workspace:", request.name);
        return deleteWorkspace(request.name);
      default:
        log("Unknown command received:", request.command);
        return;
    }
  });
  
  // --- Tab Event Listeners ---
  browser.tabs.onCreated.addListener(tab => {
    log("Tab created:", tab);
    if (tab && tab.windowId) {
      log(`Tab created in windowId: ${tab.windowId}. Scheduling workspace update...`);
      debounceForWindow(tab.windowId, updateWorkspaceForWindow, DEBOUNCE_DELAY);
    }
  });
  
  browser.tabs.onRemoved.addListener((tabId, removeInfo) => {
    log(`Tab removed. Tab ID: ${tabId}`, removeInfo);
    if (removeInfo && removeInfo.windowId) {
      if (removeInfo.isWindowClosing) {
        log(`Tab removal due to window closing. Skipping workspace update for windowId: ${removeInfo.windowId}`);
      } else {
        log(`Tab removed from windowId: ${removeInfo.windowId}. Scheduling workspace update...`);
        debounceForWindow(removeInfo.windowId, updateWorkspaceForWindow, DEBOUNCE_DELAY);
      }
    }
  });
  
  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    log(`Tab updated. Tab ID: ${tabId}`, changeInfo, tab);
    if (tab && tab.windowId) {
      log(`Tab updated in windowId: ${tab.windowId}. Scheduling workspace update...`);
      debounceForWindow(tab.windowId, updateWorkspaceForWindow, DEBOUNCE_DELAY);
    }
  });
  
  browser.tabs.onMoved.addListener((tabId, moveInfo) => {
    log(`Tab moved within window ${moveInfo.windowId}: Tab ID ${tabId} moved from index ${moveInfo.fromIndex} to ${moveInfo.toIndex}`);
    debounceForWindow(moveInfo.windowId, updateWorkspaceForWindow, DEBOUNCE_DELAY);
  });
  
  browser.tabs.onDetached.addListener((tabId, detachInfo) => {
    log(`Tab detached from window ${detachInfo.oldWindowId}: Tab ID ${tabId} detached from position ${detachInfo.oldPosition}`);
    debounceForWindow(detachInfo.oldWindowId, updateWorkspaceForWindow, DEBOUNCE_DELAY);
  });
  
  browser.tabs.onAttached.addListener((tabId, attachInfo) => {
    log(`Tab attached to window ${attachInfo.newWindowId}: Tab ID ${tabId} attached at position ${attachInfo.newPosition}`);
    debounceForWindow(attachInfo.newWindowId, updateWorkspaceForWindow, DEBOUNCE_DELAY);
  });
  