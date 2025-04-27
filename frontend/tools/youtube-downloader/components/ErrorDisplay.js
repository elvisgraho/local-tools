class ErrorDisplay {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) {
      console.error(`Container element with ID "${containerId}" not found.`);
      return;
    }
    this.render();
    this.element = this.container.querySelector(".alert"); // Use .alert selector
    this.hide(); // Initially hide the display
  }

  render() {
    this.container.innerHTML = `
            <div class="alert alert-danger d-none mt-3" role="alert"></div>
        `;
    this.element = this.container.querySelector(".alert"); // Use .alert selector
  }

  show(message) {
    this.element.textContent = message;
    this.element.classList.remove("d-none"); // Use Bootstrap class
  }

  hide() {
    this.element.textContent = "";
    this.element.classList.add("d-none"); // Use Bootstrap class
  }
}

export default ErrorDisplay;
