class InputForm {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      console.error(`Container element with ID "${containerId}" not found.`);
      return;
    }
    this.render();
    this.attachEventListeners();
  }

  render() {
    this.container.innerHTML = `
            <div class="mb-3">
                <label class="form-label" for="url">YouTube URL</label>
                <input class="form-control" type="text" id="url" placeholder="Enter YouTube video or playlist URL">
            </div>

            <div class="row g-3 mb-3">
                <div class="col-md">
                    <label class="form-label" for="format">Format</label>
                    <select class="form-select" id="format">
                        <option value="mp4">MP4 (Video)</option>
                        <option value="mp3">MP3 (Audio)</option>
                    </select>
                </div>

                <div class="col-md">
                    <label class="form-label" for="quality">Quality</label>
                    <select class="form-select" id="quality" disabled>
                        <option value="">Enter URL first</option>
                    </select>
                </div>
            </div>

            <!-- Placeholder for Cookie Manager -->
            <div id="cookieManagerDownloaderContainer"></div>

            <div class="d-grid gap-2">
                <button class="btn btn-primary" type="button" id="getInfoBtn">
                    <span class="spinner-border spinner-border-sm me-2 d-none" role="status" aria-hidden="true"></span>
                    <span class="button-text">Get Video Info</span>
                </button>
            </div>
        `;
    this.elements = {
      urlInput: this.container.querySelector("#url"),
      formatSelect: this.container.querySelector("#format"),
      qualitySelect: this.container.querySelector("#quality"),
      // cookiesInput: this.container.querySelector("#cookies"), // Removed, using CookieManager
      getInfoBtn: this.container.querySelector("#getInfoBtn"),
      // Add spinner reference
      getInfoSpinner: this.container.querySelector(
        "#getInfoBtn .spinner-border"
      ),
      getInfoBtnText: this.container.querySelector("#getInfoBtn .button-text"), // Select the text span
    };
  }

  attachEventListeners() {
    // Disable quality select when MP3 is chosen
    this.elements.formatSelect.addEventListener("change", () => {
      const isMp3 = this.elements.formatSelect.value === "mp3";
      this.elements.qualitySelect.disabled = isMp3;
      // If switching to mp3, maybe select 'best' or clear quality?
      // For now, just disable/enable.
    });
  }

  get url() {
    return this.elements.urlInput.value.trim();
  }

  get format() {
    return this.elements.formatSelect.value;
  }

  get quality() {
    return this.elements.qualitySelect.value;
  }

  // Removed get cookies() getter

  setQualityOptions(formats) {
    this.elements.qualitySelect.innerHTML = ""; // Clear previous options

    // Always add a 'best' option first
    const bestOption = document.createElement("option");
    bestOption.value = "best";
    bestOption.textContent = "Best Available";
    this.elements.qualitySelect.appendChild(bestOption);

    if (formats && formats.length > 0) {
      // Filter out audio-only/video-only formats if MP4 is selected, keep all for 'best'
      const filteredFormats =
        this.elements.formatSelect.value === "mp4"
          ? formats.filter(
              (f) => f.has_audio && f.has_video && f.height !== "best"
            ) // Only combined video/audio for MP4 selection
          : []; // No specific quality options needed if MP3 selected (handled by backend)

      // Sort by height descending (numeric part)
      filteredFormats.sort((a, b) => {
        const heightA = parseInt(a.height, 10) || 0;
        const heightB = parseInt(b.height, 10) || 0;
        return heightB - heightA;
      });

      filteredFormats.forEach((format) => {
        const option = document.createElement("option");
        // Use a consistent identifier, like format_id or a combination
        option.value =
          format.format_id || `${format.height}p${format.fps || ""}`;

        let formatText = `${format.height}p`;
        if (format.fps > 30) formatText += ` ${format.fps}fps`; // Show FPS if > 30
        if (
          format.format_note &&
          format.format_note !== "unknown" &&
          format.format_note !== `${format.height}p`
        ) {
          formatText += ` (${format.format_note})`; // Add note like HDR, etc.
        }
        // Add file size if available
        if (format.filesize_approx > 0) {
          const sizeMB = (format.filesize_approx / 1024 / 1024).toFixed(1);
          formatText += ` [~${sizeMB} MB]`;
        }

        option.textContent = formatText;
        this.elements.qualitySelect.appendChild(option);
      });
    }

    // Disable quality selection if MP3 is chosen
    this.elements.qualitySelect.disabled =
      this.elements.formatSelect.value === "mp3";
  }

  setGetInfoButtonLoading(isLoading) {
    const button = this.elements.getInfoBtn;
    const spinner = this.elements.getInfoSpinner;
    const buttonText = this.elements.getInfoBtnText; // Use the specific text span

    if (isLoading) {
      button.disabled = true;
      spinner?.classList.remove("d-none");
      if (buttonText) buttonText.textContent = "Loading...";
    } else {
      button.disabled = false;
      spinner?.classList.add("d-none");
      if (buttonText) buttonText.textContent = "Get Video Info";
    }
  }

  onGetInfoClick(handler) {
    this.elements.getInfoBtn.addEventListener("click", handler);
  }

  reset() {
    this.elements.urlInput.value = "";
    this.elements.formatSelect.value = "mp4";
    this.elements.qualitySelect.innerHTML =
      '<option value="">Enter URL first</option>';
    this.elements.qualitySelect.disabled = true;
    // this.elements.cookiesInput.value = ""; // Removed cookie reset
    this.setGetInfoButtonLoading(false);
  }
}

export default InputForm;
