class VideoInfoDisplay {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      console.error(`Container element with ID "${containerId}" not found.`);
      return;
    }
    this.render();
    this.elements = {
      thumbnailImg: this.container.querySelector("#thumbnail"),
      titleEl: this.container.querySelector("#title"),
      durationEl: this.container.querySelector("#duration"),
      downloadBtn: this.container.querySelector("#downloadBtn"),
      downloadSpinner: this.container.querySelector(
        "#downloadBtn .spinner-border"
      ), // Added comma
      downloadBtnText: this.container.querySelector(
        "#downloadBtn .button-text"
      ), // Select the text span, removed '+'
    };
    this.hide(); // Initially hide the display
  }

  render() {
    this.container.innerHTML = `
            <div class="box">
                <div class="card mt-4 mb-4 shadow-sm">
                    <div class="row g-0">
                        <div class="col-md-3 d-flex align-items-center justify-content-center p-2">
                            <img id="thumbnail" src="" alt="Video thumbnail" class="img-fluid rounded-start" style="max-height: 120px; object-fit: cover;">
                        </div>
                        <div class="col-md-9">
                            <div class="card-body">
                                <h5 class="card-title" id="title">Video Title</h5>
                                <p class="card-text text-muted" id="duration">Duration: 0:00</p>
                                <button class="btn btn-success w-100" type="button" id="downloadBtn">
                                    <span class="spinner-border spinner-border-sm me-2 d-none" role="status" aria-hidden="true"></span>
                                    <i class="bi bi-download me-1"></i><span class="button-text"> Download</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
  }

  update(videoInfo) {
    if (!videoInfo) {
      this.hide();
      return;
    }
    this.elements.thumbnailImg.src = videoInfo.thumbnail;
    this.elements.titleEl.textContent = videoInfo.title;
    this.elements.durationEl.textContent = `Duration: ${this.formatDuration(
      videoInfo.duration
    )}`;
    this.show();
  }

  formatDuration(seconds) {
    if (!seconds || seconds <= 0) return "N/A";
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = (seconds % 60).toString().padStart(2, "0");
    return `${minutes}:${remainingSeconds}`;
  }

  setDownloadButtonLoading(isLoading) {
    // This will be handled by a separate Button component later
    const button = this.elements.downloadBtn; // Button element
    const spinner = this.elements.downloadSpinner; // Spinner span
    const icon = button.querySelector(".bi-download"); // Icon element
    const buttonText = this.elements.downloadBtnText; // Use the specific text span

    if (isLoading) {
      button.disabled = true;
      spinner?.classList.remove("d-none");
      if (icon) icon.style.display = "none"; // Hide icon
      if (buttonText) buttonText.textContent = " Downloading...";
    } else {
      button.disabled = false; // Re-enable button
      spinner?.classList.add("d-none");
      if (icon) icon.style.display = ""; // Show icon
      if (buttonText) buttonText.textContent = " Download";
    }
  }

  onDownloadClick(handler) {
    this.elements.downloadBtn.addEventListener("click", handler);
  }

  show() {
    this.container.classList.remove("d-none");
  }

  hide() {
    this.container.classList.add("d-none");
  }
}

export default VideoInfoDisplay;
