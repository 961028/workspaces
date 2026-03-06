/**
 * Shared test setup: creates a fresh `browser.*` mock for every test.
 * Import with: const { createBrowserMock, installBrowserMock } = require('./setup');
 */

function createEventTarget() {
	const listeners = [];
	return {
		addListener: jest.fn((fn) => listeners.push(fn)),
		removeListener: jest.fn((fn) => {
			const i = listeners.indexOf(fn);
			if (i >= 0) listeners.splice(i, 1);
		}),
		_fire: (...args) => listeners.forEach((fn) => fn(...args)),
		_listeners: listeners,
	};
}

function createBrowserMock() {
	return {
		storage: {
			local: {
				get: jest.fn().mockResolvedValue({}),
				set: jest.fn().mockResolvedValue(undefined),
			},
		},
		tabs: {
			query: jest.fn().mockResolvedValue([]),
			move: jest.fn().mockResolvedValue(undefined),
			group: jest.fn().mockResolvedValue(1),
			onCreated: createEventTarget(),
			onRemoved: createEventTarget(),
			onUpdated: createEventTarget(),
			onMoved: createEventTarget(),
			onAttached: createEventTarget(),
			onDetached: createEventTarget(),
			onActivated: createEventTarget(),
		},
		windows: {
			getAll: jest.fn().mockResolvedValue([]),
			create: jest.fn().mockResolvedValue({ id: 100, tabs: [] }),
			update: jest.fn().mockResolvedValue({}),
			get: jest.fn().mockResolvedValue({ id: 1 }),
			getLastFocused: jest.fn().mockResolvedValue({ id: 1 }),
			getCurrent: jest.fn().mockResolvedValue({ id: 1 }),
			onRemoved: createEventTarget(),
			onFocusChanged: createEventTarget(),
			WINDOW_ID_NONE: -1,
		},
		tabGroups: {
			query: jest.fn().mockResolvedValue([]),
			update: jest.fn().mockResolvedValue({}),
			onCreated: createEventTarget(),
			onUpdated: createEventTarget(),
			onMoved: createEventTarget(),
			onRemoved: createEventTarget(),
		},
		runtime: {
			sendMessage: jest.fn().mockResolvedValue({ success: true }),
			onMessage: createEventTarget(),
			onInstalled: createEventTarget(),
			onStartup: createEventTarget(),
			getURL: jest.fn((path) => `moz-extension://fake-id/${path}`),
		},
		contextMenus: {
			create: jest.fn(),
			removeAll: jest.fn().mockResolvedValue(undefined),
			refresh: jest.fn(),
			onShown: createEventTarget(),
			onClicked: createEventTarget(),
		},
		theme: {
			getCurrent: jest.fn().mockResolvedValue({ colors: {} }),
			onUpdated: createEventTarget(),
		},
	};
}

function installBrowserMock(mock) {
	global.browser = mock;
}

module.exports = { createBrowserMock, installBrowserMock, createEventTarget };
