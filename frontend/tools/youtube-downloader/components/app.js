import InputForm from "./InputForm.js";
import VideoInfoDisplay from "./VideoInfoDisplay.js";
import StatusDisplay from "./StatusDisplay.js";
import ErrorDisplay from "./ErrorDisplay.js";

document.addEventListener("DOMContentLoaded", () => {
  const appContainer = document.getElementById("app-container");

  // Create container elements for each component
  appContainer.innerHTML = `
        <div id="input-form-container"></div>
        <div id="error-display-container"></div>
        <div id="video-info-container"></div>
        <div id="status-display-container"></div>
    `;

  const inputForm = new InputForm("input-form-container");
  const videoInfoDisplay = new VideoInfoDisplay("video-info-container");
  const statusDisplay = new StatusDisplay("status-display-container");
  const errorDisplay = new ErrorDisplay("error-display-container");

  // --- Initialize Cookie Manager ---
  // Assumes CookieManager.js is loaded via index.html
  // The container 'cookieManagerDownloaderContainer' is rendered by InputForm.js
  let cookieManager;
  if (typeof CookieManager !== "undefined") {
    // Wait a tiny bit for InputForm to render its container
    setTimeout(() => {
      cookieManager = new CookieManager("cookieManagerDownloaderContainer");
    }, 50); // Small delay might be needed
  } else {
    console.error(
      "CookieManager class not found. Make sure CookieManager.js is loaded."
    );
  }

  let currentVideoId = null;
  let progressInterval = null;

  // Event listener for Get Video Info button
  inputForm.onGetInfoClick(async () => {
    const url = inputForm.url;
    // Get cookies from the manager instance
    const cookies = cookieManager ? cookieManager.getCookies() : "";

    if (!url) {
      errorDisplay.show("Please enter a YouTube URL.");
      return;
    }

    // Reset previous states
    errorDisplay.hide();
    videoInfoDisplay.hide();
    statusDisplay.hide();
    inputForm.setGetInfoButtonLoading(true);

    try {
      const response = await fetch("/tool/youtube-downloader/get_info", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `url=${encodeURIComponent(url)}${
          cookies ? `&cookies=${encodeURIComponent(cookies)}` : ""
        }`,
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        throw new Error(
          data.error || `Failed to fetch info (status ${response.status})`
        );
      }

      currentVideoId = data.id;
      inputForm.setQualityOptions(data.available_formats);
      videoInfoDisplay.update(data);

      // Check FFmpeg status (assuming a separate component or function for this later)
      // For now, just log the status from the info response
      console.log("FFmpeg installed:", data.ffmpeg_installed);
    } catch (error) {
      console.error("Error fetching video info:", error);
      errorDisplay.show(`Error fetching video info: ${error.message}`);
      videoInfoDisplay.hide();
      statusDisplay.hide();
    } finally {
      inputForm.setGetInfoButtonLoading(false);
    }
  });

  // Event listener for Download button
  videoInfoDisplay.onDownloadClick(async () => {
    if (!currentVideoId) {
      errorDisplay.show("Please get video info first.");
      return;
    }

    const url = inputForm.url;
    const format = inputForm.format;
    const quality = inputForm.quality;
    // Get cookies from the manager instance
    const cookies = cookieManager ? cookieManager.getCookies() : "";

    // Reset previous states
    errorDisplay.hide();
    statusDisplay.reset(); // Reset status display

    videoInfoDisplay.setDownloadButtonLoading(true);
    statusDisplay.update({ status: "Starting download..." }); // Initial status message

    try {
      const startResponse = await fetch("/tool/youtube-downloader/download", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `url=${encodeURIComponent(
          url
        )}&format=${format}&quality=${quality}${
          cookies ? `&cookies=${encodeURIComponent(cookies)}` : ""
        }`,
      });

      const startData = await startResponse.json();

      if (!startResponse.ok || startData.error) {
        throw new Error(
          startData.error ||
            `Failed to start download (status ${startResponse.status})`
        );
      }

      // Start polling for progress
      pollProgress(currentVideoId);
    } catch (error) {
      console.error("Error starting download:", error);
      errorDisplay.show(`Error: ${error.message}`);
      videoInfoDisplay.setDownloadButtonLoading(false);
      statusDisplay.hide(); // Hide status on start error
    }
  });

  // --- Progress Polling ---
  function pollProgress(videoId) {
    if (progressInterval) {
      clearInterval(progressInterval); // Clear any existing interval
    }

    progressInterval = setInterval(async () => {
      try {
        const progressResponse = await fetch(
          `/tool/youtube-downloader/progress/${videoId}`
        );
        if (!progressResponse.ok) {
          console.warn(
            `Progress check failed (status ${progressResponse.status})`
          );
          // Optionally stop polling on repeated errors
          return;
        }
        const progressData = await progressResponse.json();

        if (progressData.error && progressData.status !== "error") {
          if (
            progressData.error !==
            "Video ID not found or download not initiated."
          ) {
            console.warn("Progress polling error:", progressData.error);
          }
          // Don't stop polling unless it's a fatal download error status
          if (progressData.status !== "error") return;
        }

        statusDisplay.update(progressData);

        // Check for completion or error
        if (progressData.status === "completed") {
          clearInterval(progressInterval);
          progressInterval = null;
          statusDisplay.update({
            status:
              "Download complete! Your download will start automatically.",
            progress: 100,
          });
          videoInfoDisplay.setDownloadButtonLoading(false);
          // Trigger file download via the new endpoint
          setTimeout(() => {
            window.location.href = `/tool/youtube-downloader/get_file/${videoId}`;
            // Optionally reset UI after download attempt
            setTimeout(() => {
              inputForm.reset();
              videoInfoDisplay.hide();
              statusDisplay.hide();
              errorDisplay.hide();
            }, 3000);
          }, 1000);
        } else if (progressData.status === "error") {
          clearInterval(progressInterval);
          progressInterval = null;
          errorDisplay.show(
            `Download failed: ${progressData.error || "Unknown error"}`
          );
          statusDisplay.update(progressData); // Update status display with error
          videoInfoDisplay.setDownloadButtonLoading(false);
        }
      } catch (error) {
        console.error("Error fetching progress:", error);
        // Optionally stop polling on network errors
        // clearInterval(progressInterval);
        // progressInterval = null;
        // errorDisplay.show("Network error checking progress.");
        // videoInfoDisplay.setDownloadButtonLoading(false);
      }
    }, 1500); // Poll every 1.5 seconds
  }

  // Initial FFmpeg check (can be integrated into a component later)
  async function checkFFmpegOnLoad() {
    try {
      const response = await fetch("/tool/youtube-downloader/check_ffmpeg");
      const data = await response.json();
      console.log("FFmpeg installed on load:", data.installed);
      // Update a status indicator on the page if needed
    } catch (error) {
      console.error("Error checking FFmpeg status on load:", error);
    }
  }

  checkFFmpegOnLoad();
});
