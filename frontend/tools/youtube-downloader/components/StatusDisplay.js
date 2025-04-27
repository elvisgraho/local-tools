class StatusDisplay {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      console.error(`Container element with ID "${containerId}" not found.`);
      return;
    }
    this.render();
    this.elements = {
      progressContainer: this.container.querySelector(".progress"), // The outer container
      progressBar: this.container.querySelector(".progress-bar"), // The inner bar
      statusText: this.container.querySelector(".status-text"),
    };
    this.hide(); // Initially hide the display
  }

  render() {
    this.container.innerHTML = `
            <div class="box">
                <div class="progress mt-4 mb-2" role="progressbar" aria-label="Download progress" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100" style="height: 25px;">
                    <div class="progress-bar progress-bar-striped progress-bar-animated" style="width: 0%">0%</div>
                </div>
                <p class="text-center text-muted small status-text mb-0"></p>
            </div>
        `;
  }

  update(statusData) {
    if (!statusData) {
      this.hide();
      return;
    }

    const percent = Math.round(statusData.progress || 0);
    const status = statusData.status || "N/A";
    const error = statusData.error;

    // Update progress bar visibility and value
    if (
      percent > 0 ||
      ["downloading", "merging", "completed", "error"].includes(status)
    ) {
      this.elements.progressContainer.classList.remove("d-none"); // Show container
      this.elements.progressBar.style.width = `${percent}%`;
      this.elements.progressBar.textContent = `${percent}%`;
      this.elements.progressBar.setAttribute("aria-valuenow", percent);
    } else {
      this.elements.progressContainer.classList.add("d-none"); // Hide container
    }

    // Update status text
    let statusMessage = `Status: ${status}`;
    if (statusData.speed && statusData.speed !== "0") {
      statusMessage += ` | Speed: ${statusData.speed}`;
    }
    if (statusData.eta && statusData.eta !== "0") {
      statusMessage += ` | ETA: ${statusData.eta}`;
    }
    if (error) {
      statusMessage = `Error: ${error}`;
      // Use Bootstrap background color for error
      this.elements.progressBar.classList.add("bg-danger");
      this.elements.progressBar.classList.remove(
        "progress-bar-striped",
        "progress-bar-animated"
      );
    } else {
      this.elements.progressBar.classList.remove("bg-danger");
      // Ensure progress bar styling is correct for non-error states
      if (status === "completed") {
        this.elements.progressBar.classList.remove(
          "progress-bar-striped",
          "progress-bar-animated"
        );
        this.elements.progressBar.classList.add("bg-success");
      } else if (status === "downloading" || status === "merging") {
        this.elements.progressBar.classList.add(
          "progress-bar-striped",
          "progress-bar-animated"
        );
        this.elements.progressBar.classList.remove("bg-success", "bg-danger"); // Remove other states
      } else {
        // Default state (e.g., starting)
        this.elements.progressBar.classList.add(
          "progress-bar-striped",
          "progress-bar-animated"
        );
        this.elements.progressBar.classList.remove("bg-success", "bg-danger");
      }
    }
    this.elements.statusText.textContent = statusMessage;

    this.show();
  }

  show() {
    this.container.classList.remove("d-none");
  }

  hide() {
    this.container.classList.add("d-none");
  }

  reset() {
    this.elements.progressBar.style.width = "0%";
    this.elements.progressBar.textContent = "0%";
    this.elements.progressBar.setAttribute("aria-valuenow", 0);
    this.elements.progressBar.classList.remove("bg-danger", "bg-success");
    this.elements.progressBar.classList.add(
      "progress-bar-striped",
      "progress-bar-animated"
    ); // Reset animation/stripes
    this.elements.progressContainer.classList.add("d-none"); // Hide container
    this.elements.statusText.textContent = "";
    this.hide();
  }
}

export default StatusDisplay;
