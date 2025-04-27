// --- Theme Handling ---
window.addEventListener("message", (event) => {
  // IMPORTANT: Add origin check in production for security
  // if (event.origin !== 'expected-origin') return;

  if (event.data && event.data.type === "setTheme") {
    const theme = event.data.theme;
    document.documentElement.setAttribute("data-bs-theme", theme);
    console.log("Iframe theme set to:", theme); // For debugging
  }
});
// --- End Theme Handling ---
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("upload-form");
  const fileInput = document.getElementById("file-input");
  const dropArea = document.getElementById("drop-area");
  const fileNameDisplay = document.getElementById("file-name-display");
  const qualityInput = document.getElementById("quality");
  const qualityOptionDiv = document.getElementById("quality-option"); // Div containing quality input
  const statusArea = document.getElementById("status-area");
  const statusMessage = document.getElementById("status-message");
  const downloadLink = document.getElementById("download-link");
  const errorArea = document.getElementById("error-area");
  const submitButton = document.getElementById("submit-button");

  let selectedFile = null;

  // --- Drag and Drop ---
  dropArea.addEventListener("dragover", (event) => {
    event.preventDefault();
    dropArea.classList.add("highlight");
  });

  dropArea.addEventListener("dragleave", () => {
    dropArea.classList.remove("highlight");
  });

  dropArea.addEventListener("drop", (event) => {
    event.preventDefault();
    dropArea.classList.remove("highlight");
    const files = event.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  });

  // --- Click to Select ---
  dropArea.addEventListener("click", () => {
    fileInput.click();
  });

  fileInput.addEventListener("change", (event) => {
    if (event.target.files.length > 0) {
      handleFile(event.target.files[0]);
    }
  });

  // --- File Handling ---
  function handleFile(file) {
    const allowedTypes = ["image/png", "image/jpeg"];
    if (!allowedTypes.includes(file.type)) {
      showError(
        `Invalid file type: ${file.type}. Please upload PNG or JPG/JPEG.`
      );
      clearFile();
      return;
    }

    selectedFile = file;
    fileNameDisplay.textContent = `Selected file: ${file.name}`;
    // Show/hide quality option based on file type
    qualityOptionDiv.style.display =
      file.type === "image/jpeg" ? "flex" : "none";
    clearStatus();
  }

  function clearFile() {
    selectedFile = null;
    fileInput.value = "";
    fileNameDisplay.textContent = "";
    qualityOptionDiv.style.display = "flex"; // Show quality by default when no file
  }

  // --- Form Submission ---
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!selectedFile) {
      showError("Please select a file first.");
      return;
    }

    clearStatus();
    setLoading(true);

    const formData = new FormData();
    formData.append("file", selectedFile);
    // Only include quality if it's a JPG/JPEG
    if (selectedFile.type === "image/jpeg") {
      formData.append("quality", qualityInput.value);
    }

    try {
      // Use relative path for API endpoint
      const response = await fetch("/api/tool/image-compressor/execute", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const blob = await response.blob();
        const downloadUrl = URL.createObjectURL(blob);
        const contentDisposition = response.headers.get("content-disposition");
        let filename = "compressed_image";

        if (contentDisposition) {
          const filenameMatch = contentDisposition.match(/filename="?(.+)"?/i);
          if (filenameMatch && filenameMatch.length > 1) {
            filename = filenameMatch[1];
          }
        }
        // Ensure the filename keeps the original extension
        const originalExt = selectedFile.name.split(".").pop();
        if (!filename.toLowerCase().endsWith(originalExt.toLowerCase())) {
          filename = `${filename.substring(
            0,
            filename.lastIndexOf(".")
          )}.${originalExt}`;
        }

        // Get size info from headers (backend needs to add these)
        const originalSize = parseInt(
          response.headers.get("X-Original-Size") || "0"
        );
        const processedSize = parseInt(
          response.headers.get("X-Processed-Size") || "0"
        );

        showSuccess(
          "Compression successful!",
          downloadUrl,
          filename,
          originalSize,
          processedSize
        );
      } else {
        const errorData = await response.json();
        showError(
          `Compression failed: ${errorData.error || response.statusText}`
        );
        clearFile();
      }
    } catch (error) {
      console.error("Network or fetch error:", error);
      showError(`An error occurred: ${error.message}`);
      clearFile();
    } finally {
      setLoading(false);
    }
  });

  // --- Helper Function ---
  function formatBytes(bytes, decimals = 2) {
    // Add check for invalid input
    if (isNaN(bytes) || !isFinite(bytes) || bytes < 0) return "N/A";
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  }

  // --- UI Updates (mostly reused functions) ---
  function setLoading(isLoading) {
    submitButton.disabled = isLoading;
    statusMessage.textContent = isLoading ? "Compressing..." : "";
    // Only hide download link when loading starts
    if (isLoading) {
      statusArea.style.display = "block";
      downloadLink.style.display = "none";
      errorArea.style.display = "none";
    }
    // Don't hide statusArea or downloadLink when loading finishes,
    // let showSuccess/showError handle them.
  }

  function showSuccess(message, url, filename, originalSize, processedSize) {
    statusArea.style.display = "block";
    errorArea.style.display = "none";
    // Display size info if available
    const sizeInfo =
      originalSize !== undefined && processedSize !== undefined
        ? ` (Original: ${formatBytes(originalSize)}, New: ${formatBytes(
            processedSize
          )})`
        : "";
    statusMessage.textContent = message + sizeInfo;
    downloadLink.href = url;
    downloadLink.download = filename; // Ensure download attribute is set
    downloadLink.style.display = "block";
  }

  function showError(message) {
    statusArea.style.display = "none";
    errorArea.textContent = message;
    errorArea.style.display = "block";
  }

  function clearStatus() {
    statusMessage.textContent = "";
    downloadLink.href = "#";
    downloadLink.style.display = "none";
    errorArea.textContent = "";
    errorArea.style.display = "none";
    statusArea.style.display = "none";
  }

  // Initial state
  clearStatus();
  qualityOptionDiv.style.display = "flex"; // Show quality initially
});
