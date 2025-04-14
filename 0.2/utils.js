// utils.js

// --- Constants ---
const DEBUG = true;
const DEBOUNCE_DELAY = 300;
const COMMANDS = {
  SAVE: "save",
  OPEN: "open",
  DELETE: "delete"
};

// --- Centralized Logging ---
function log(...args) {
  if (DEBUG) {
    console.log(...args);
  }
}

// --- Centralized Error Handling ---
function handleError(error, context) {
  console.error(`Error in ${context}:`, error);
  return { error: error.message };
}

// --- Debounce Functionality ---
const windowDebounceTimers = {};

function debounceForWindow(windowId, func, delay) {
  if (windowDebounceTimers[windowId]) {
    clearTimeout(windowDebounceTimers[windowId]);
  }
  windowDebounceTimers[windowId] = setTimeout(() => {
    log(`Debounce: Executing update for window ${windowId}`);
    func(windowId);
    delete windowDebounceTimers[windowId];
  }, delay);
}