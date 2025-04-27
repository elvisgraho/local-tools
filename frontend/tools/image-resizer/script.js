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
  const widthInput = document.getElementById("width");
  const heightInput = document.getElementById("height");
  const maintainAspectCheckbox = document.getElementById("maintain-aspect");
  const statusArea = document.getElementById("status-area");
  const statusMessage = document.getElementById("status-message");
  const downloadLink = document.getElementById("download-link");
  const errorArea = document.getElementById("error-area");
  const submitButton = document.getElementById("submit-button");

  let selectedFile = null;
  let originalWidth = null;
  let originalHeight = null;
  let originalAspectRatio = null;
  let isUpdatingAspectRatio = false; // Flag to prevent infinite loops

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
    clearStatus();

    // Read image dimensions and populate inputs
    const reader = new FileReader();
    reader.onload = function (e) {
      const img = new Image();
      img.onload = function () {
        originalWidth = img.naturalWidth;
        originalHeight = img.naturalHeight;
        if (originalHeight > 0) {
          originalAspectRatio = originalWidth / originalHeight;
        } else {
          originalAspectRatio = null; // Avoid division by zero
        }
        widthInput.value = originalWidth;
        heightInput.value = originalHeight;
      };
      img.onerror = function () {
        showError("Could not read image dimensions.");
        clearFile(); // Clear if dimensions can't be read
      };
      img.src = e.target.result;
    };
    reader.onerror = function () {
      showError("Error reading file.");
      clearFile();
    };
    reader.readAsDataURL(file);
  }

  function clearFile() {
    selectedFile = null;
    fileInput.value = "";
    fileNameDisplay.textContent = "";
    // Reset width/height inputs when clearing
    widthInput.value = "";
    heightInput.value = "";
    // Reset original dimensions
    originalWidth = null;
    originalHeight = null;
    originalAspectRatio = null;
  }

  // --- Form Submission ---
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!selectedFile) {
      showError("Please select a file first.");
      return;
    }
    if (
      !widthInput.value ||
      !heightInput.value ||
      parseInt(widthInput.value) <= 0 ||
      parseInt(heightInput.value) <= 0
    ) {
      showError("Please enter valid positive values for width and height.");
      return;
    }

    clearStatus();
    setLoading(true);

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("width", widthInput.value);
    formData.append("height", heightInput.value);
    formData.append(
      "maintain_aspect_ratio",
      maintainAspectCheckbox.checked ? "true" : "false"
    );

    try {
      // Use relative path for API endpoint
      const response = await fetch("/api/tool/image-resizer/execute", {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        const blob = await response.blob();
        const downloadUrl = URL.createObjectURL(blob);
        const contentDisposition = response.headers.get("content-disposition");
        let filename = "resized_image";

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
          "Resizing successful!",
          downloadUrl,
          filename,
          originalSize,
          processedSize
        );
      } else {
        const errorData = await response.json();
        showError(`Resizing failed: ${errorData.error || response.statusText}`);
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

  // --- Aspect Ratio Handling ---
  function updateAspectRatio(changedInput) {
    if (
      isUpdatingAspectRatio ||
      !maintainAspectCheckbox.checked ||
      !originalAspectRatio
    ) {
      return; // Exit if already updating, checkbox unchecked, or no ratio
    }

    isUpdatingAspectRatio = true; // Set flag

    const widthVal = parseInt(widthInput.value);
    const heightVal = parseInt(heightInput.value);

    if (changedInput === widthInput && !isNaN(widthVal) && widthVal > 0) {
      heightInput.value = Math.round(widthVal / originalAspectRatio);
    } else if (
      changedInput === heightInput &&
      !isNaN(heightVal) &&
      heightVal > 0
    ) {
      widthInput.value = Math.round(heightVal * originalAspectRatio);
    }

    // Ensure values are at least 1 if they became 0 after rounding
    if (parseInt(widthInput.value) <= 0) widthInput.value = 1;
    if (parseInt(heightInput.value) <= 0) heightInput.value = 1;

    isUpdatingAspectRatio = false; // Reset flag
  }

  widthInput.addEventListener("input", () => updateAspectRatio(widthInput));
  heightInput.addEventListener("input", () => updateAspectRatio(heightInput));

  // Optional: Trigger update when checkbox is checked if values exist
  maintainAspectCheckbox.addEventListener("change", () => {
    if (
      maintainAspectCheckbox.checked &&
      widthInput.value &&
      originalAspectRatio
    ) {
      // Recalculate height based on current width when checkbox is enabled
      updateAspectRatio(widthInput);
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
    statusMessage.textContent = isLoading ? "Resizing..." : "";
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
});
