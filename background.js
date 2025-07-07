// background.js
// This script runs in the background and handles communication between the extension and the active tab.

// Listen for messages from the extension's components (e.g., the side panel)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Check if the requested action is to get the text from the page
  if (message.action === 'getText') {
    // Find the currently active tab in the current window
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      // Ensure an active tab was found
      if (activeTab) {
        // Execute a script on the active tab to extract the puzzle HTML
        chrome.scripting.executeScript({
          target: { tabId: activeTab.id },
          // The function to execute on the page
          func: () => {
            // Using outerHTML to get the full HTML structure of the main puzzle area
            return document.querySelector('main')?.outerHTML;
          }
        }, (injectionResults) => {
          // This callback handles the result of the script execution
          if (chrome.runtime.lastError) {
            // If an error occurred (e.g., no permission), send back an error message
            console.error(chrome.runtime.lastError);
            sendResponse({ error: chrome.runtime.lastError.message });
            return;
          }
          // The result is an array; we get the result from the first (and only) frame
          const result = injectionResults[0].result;
          if (result) {
            // If text was found, send it in the response
            sendResponse({ text: result });
          } else {
            // If no text was found, send back a specific error message
            sendResponse({ error: "Could not find puzzle text on the page." });
          }
        });
      } else {
        // If no active tab could be identified, send back an error
        sendResponse({ error: "No active tab found." });
      }
    });
    // Return true to indicate that the response will be sent asynchronously
    return true;
  }
});

// Add a listener to open the side panel when the extension's icon is clicked.
// This provides a clear entry point for the user to interact with the extension.
chrome.action.onClicked.addListener((tab) => {
  chrome.sidePanel.open({ windowId: tab.windowId });
});