/**
 * Tests for options/options.js
 *
 * Uses jsdom (via Jest) for DOM manipulation tests.
 * @jest-environment jsdom
 */
const fs = require("fs");
const path = require("path");
const {createBrowserMock} = require("./setup");

function loadOptionsPage(browserMock) {
	// Set up the DOM from options.html
	const html = fs.readFileSync(
		path.join(__dirname, "..", "options", "options.html"),
		"utf-8",
	);
	document.documentElement.innerHTML = html;

	// Install browser mock
	global.browser = browserMock;

	// Execute options.js and expose functions to global scope
	const code = fs.readFileSync(
		path.join(__dirname, "..", "options", "options.js"),
		"utf-8",
	);
	const expose = `
globalThis.showStatus = showStatus;
globalThis.processImportData = processImportData;
globalThis.exportWorkspaces = exportWorkspaces;
globalThis.EXPORT_FILENAME = EXPORT_FILENAME;
`;
	(0, eval)(code + expose);
}

describe("options.js", () => {
	let browserMock;

	beforeEach(() => {
		browserMock = createBrowserMock();
		// Reset DOM
		document.documentElement.innerHTML = "";
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
		delete global.browser;
	});

	// ─── 3.1 showStatus ─────────────────────────────────────────────
	describe("showStatus()", () => {
		beforeEach(() => {
			loadOptionsPage(browserMock);
		});

		test("sets #status element text", () => {
			showStatus("Test message", false);
			expect(document.getElementById("status").textContent).toBe(
				"Test message",
			);
		});

		test("sets color red for errors", () => {
			showStatus("Error!", true);
			expect(document.getElementById("status").style.color).toBe("red");
		});

		test("sets color green for success", () => {
			showStatus("OK", false);
			expect(document.getElementById("status").style.color).toBe("green");
		});

		test("clears message after 3 seconds", () => {
			showStatus("Temp", false);
			expect(document.getElementById("status").textContent).toBe("Temp");
			jest.advanceTimersByTime(3000);
			expect(document.getElementById("status").textContent).toBe("");
		});

		test("does nothing when #status element is missing", () => {
			document.getElementById("status").remove();
			expect(() => showStatus("Test", false)).not.toThrow();
		});
	});

	// ─── 3.2 processImportData ──────────────────────────────────────
	describe("processImportData()", () => {
		beforeEach(() => {
			loadOptionsPage(browserMock);
		});

		test("sends importWorkspaces message for valid JSON", async () => {
			browserMock.runtime.sendMessage.mockResolvedValue({
				success: true,
			});
			const validData = JSON.stringify({workspaces: {}, nextId: 1});
			await processImportData(validData);
			expect(browserMock.runtime.sendMessage).toHaveBeenCalledWith({
				action: "importWorkspaces",
				data: {workspaces: {}, nextId: 1},
			});
		});

		test("shows success status for valid import", async () => {
			browserMock.runtime.sendMessage.mockResolvedValue({
				success: true,
			});
			await processImportData(
				JSON.stringify({workspaces: {}, nextId: 1}),
			);
			expect(document.getElementById("status").textContent).toBe(
				"Import successful.",
			);
			expect(document.getElementById("status").style.color).toBe("green");
		});

		test("shows error status when background returns failure", async () => {
			browserMock.runtime.sendMessage.mockResolvedValue({
				success: false,
				error: "Invalid import data.",
			});
			await processImportData(
				JSON.stringify({workspaces: {}, nextId: 1}),
			);
			expect(document.getElementById("status").textContent).toBe(
				"Invalid import data.",
			);
			expect(document.getElementById("status").style.color).toBe("red");
		});

		test("shows error for malformed JSON", async () => {
			await processImportData("not valid json {{{");
			const statusEl = document.getElementById("status");
			expect(statusEl.style.color).toBe("red");
			expect(statusEl.textContent.length).toBeGreaterThan(0);
		});

		test("shows generic error when sendMessage rejects", async () => {
			browserMock.runtime.sendMessage.mockRejectedValue(
				new Error("connection lost"),
			);
			await processImportData(
				JSON.stringify({workspaces: {}, nextId: 1}),
			);
			const statusEl = document.getElementById("status");
			expect(statusEl.style.color).toBe("red");
			expect(statusEl.textContent).toBe("connection lost");
		});
	});

	// ─── 3.3 exportWorkspaces ───────────────────────────────────────
	describe("exportWorkspaces()", () => {
		beforeEach(() => {
			global.URL.createObjectURL = jest.fn(() => "blob:fake");
			global.URL.revokeObjectURL = jest.fn();
			loadOptionsPage(browserMock);
		});

		test("export button is wired up", () => {
			expect(document.getElementById("export-btn")).toBeTruthy();
		});

		test("sends exportWorkspaces message and triggers download", async () => {
			browserMock.runtime.sendMessage.mockResolvedValue({
				success: true,
				data: {workspaces: {1: {id: 1}}, nextId: 2},
			});
			await exportWorkspaces();
			expect(browserMock.runtime.sendMessage).toHaveBeenCalledWith({
				action: "exportWorkspaces",
			});
			expect(global.URL.createObjectURL).toHaveBeenCalled();
			expect(global.URL.revokeObjectURL).toHaveBeenCalled();
		});

		test("shows success status after export", async () => {
			browserMock.runtime.sendMessage.mockResolvedValue({
				success: true,
				data: {workspaces: {}, nextId: 1},
			});
			await exportWorkspaces();
			expect(document.getElementById("status").textContent).toBe(
				"Export successful.",
			);
		});

		test("shows error when export fails", async () => {
			browserMock.runtime.sendMessage.mockResolvedValue({
				success: false,
				error: "Storage error",
			});
			await exportWorkspaces();
			expect(document.getElementById("status").textContent).toBe(
				"Storage error",
			);
			expect(document.getElementById("status").style.color).toBe("red");
		});

		test("shows error when sendMessage rejects", async () => {
			browserMock.runtime.sendMessage.mockRejectedValue(
				new Error("disconnected"),
			);
			await exportWorkspaces();
			expect(document.getElementById("status").textContent).toBe(
				"disconnected",
			);
			expect(document.getElementById("status").style.color).toBe("red");
		});
	});

	// ─── 3.4 DOMContentLoaded wiring ────────────────────────────────
	describe("DOMContentLoaded wiring", () => {
		test("export button exists after load", () => {
			loadOptionsPage(browserMock);
			expect(document.getElementById("export-btn")).toBeTruthy();
		});

		test("import button exists after load", () => {
			loadOptionsPage(browserMock);
			expect(document.getElementById("import-btn")).toBeTruthy();
		});

		test("file input exists and is hidden", () => {
			loadOptionsPage(browserMock);
			const fileInput = document.getElementById("import-file");
			expect(fileInput).toBeTruthy();
			expect(fileInput.style.display).toBe("none");
		});

		test("import button triggers file input click", () => {
			loadOptionsPage(browserMock);
			document.dispatchEvent(new Event("DOMContentLoaded"));

			const importBtn = document.getElementById("import-btn");
			const fileInput = document.getElementById("import-file");
			const clickSpy = jest.spyOn(fileInput, "click");

			importBtn.click();
			expect(clickSpy).toHaveBeenCalled();
		});
	});
});
