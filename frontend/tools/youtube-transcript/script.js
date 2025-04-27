// --- DOM Elements ---
const urlInput = document.getElementById("url");
// const cookiesInput = document.getElementById("cookies"); // Removed, using CookieManager
const getTranscriptBtn = document.getElementById("getTranscriptBtn");
const transcriptSection = document.getElementById("transcriptSection");
const transcriptOutput = document.getElementById("transcriptOutput");
const copyTranscriptBtn = document.getElementById("copyTranscriptBtn");
const transcriptLoading = document.getElementById("transcriptLoading");
const errorDisplay = document.getElementById("errorDisplay"); // Main error display
const transcriptErrorDisplay = document.getElementById(
  "transcriptErrorDisplay"
); // Specific transcript error display

// --- Initialize Cookie Manager ---
// Ensure CookieManager class is available (loaded via script tag in HTML)
let cookieManager;
if (typeof CookieManager !== "undefined") {
  cookieManager = new CookieManager("cookieManagerContainer");
} else {
  console.error(
    "CookieManager class not found. Make sure CookieManager.js is loaded before this script."
  );
  // Optionally, disable cookie functionality or show an error
}

// --- Utility Functions ---
function setLoading(button, isLoading) {
  const spinner = button.querySelector(".spinner-border");
  if (isLoading) {
    button.disabled = true;
    spinner?.classList.remove("d-none"); // Use Bootstrap class
  } else {
    button.disabled = false;
    spinner?.classList.add("d-none"); // Use Bootstrap class
  }
}

function showError(message, displayElement = errorDisplay) {
  displayElement.textContent = message;
  displayElement.classList.remove("d-none"); // Use Bootstrap class
  // Hide after some time
  setTimeout(() => {
    displayElement.classList.add("d-none"); // Use Bootstrap class
  }, 5000);
}

function resetUI() {
  transcriptSection.style.display = "none";
  transcriptOutput.value = "";
  copyTranscriptBtn.disabled = true;
  copyTranscriptBtn.textContent = "Copy Transcript"; // Reset button text
  transcriptLoading.classList.add("d-none"); // Use Bootstrap class
  errorDisplay.classList.add("d-none"); // Use Bootstrap class
  transcriptErrorDisplay.classList.add("d-none"); // Use Bootstrap class
}

// --- Event Listeners ---
urlInput.addEventListener("input", resetUI); // Reset if URL changes

getTranscriptBtn.addEventListener("click", async () => {
  const url = urlInput.value.trim();
  // Get cookies from the manager instance
  const cookies = cookieManager ? cookieManager.getCookies() : "";

  if (!url) {
    showError("Please enter a YouTube URL.");
    return;
  }

  resetUI(); // Reset UI before new request
  setLoading(getTranscriptBtn, true);
  transcriptLoading.classList.remove("d-none"); // Show loading spinner
  transcriptSection.classList.remove("d-none"); // Show transcript section container

  try {
    const response = await fetch("/tool/youtube-transcript/get_transcript", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `url=${encodeURIComponent(url)}${
        cookies ? `&cookies=${encodeURIComponent(cookies)}` : ""
      }`,
    });
    const data = await response.json();

    if (!response.ok || data.status === "error") {
      throw new Error(
        data.error || `Failed to get transcript (status ${response.status})`
      );
    }

    transcriptOutput.value = data.transcript;
    copyTranscriptBtn.disabled = false; // Enable copy button
  } catch (error) {
    console.error("Error fetching transcript:", error);
    showError(
      `Error fetching transcript: ${error.message}`,
      transcriptErrorDisplay
    );
    transcriptSection.classList.remove("d-none"); // Keep section visible to show error
    transcriptOutput.value = ""; // Clear output on error
    copyTranscriptBtn.disabled = true; // Disable copy button on error
  } finally {
    setLoading(getTranscriptBtn, false);
    transcriptLoading.classList.add("d-none"); // Hide loading spinner
  }
});

copyTranscriptBtn.addEventListener("click", () => {
  if (!transcriptOutput.value) return;

  navigator.clipboard
    .writeText(transcriptOutput.value)
    .then(() => {
      // Success feedback
      copyTranscriptBtn.textContent = "Copied!";
      copyTranscriptBtn.classList.add("btn-success");
      copyTranscriptBtn.classList.remove("btn-outline-secondary");
      setTimeout(() => {
        copyTranscriptBtn.textContent = "Copy Transcript";
        copyTranscriptBtn.classList.remove("btn-success");
        copyTranscriptBtn.classList.add("btn-outline-secondary");
      }, 2000); // Reset after 2 seconds
    })
    .catch((err) => {
      console.error("Failed to copy transcript: ", err);
      showError(
        "Failed to copy transcript to clipboard.",
        transcriptErrorDisplay
      );
    });
});
