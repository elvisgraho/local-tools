class CookieManager {
  constructor(containerId, localStorageKey = "youtubeUserCookies") {
    this.container = document.getElementById(containerId);
    this.localStorageKey = localStorageKey;
    if (!this.container) {
      console.error(
        `CookieManager: Container element with ID "${containerId}" not found.`
      );
      return;
    }
    this.render();
    this.elements = {
      textarea: this.container.querySelector(".cookie-textarea"),
      toggleButton: this.container.querySelector(".cookie-toggle-button"),
    };
    this.loadCookies();
    this.attachEventListeners();
  }

  render() {
    const collapseId = `cookieCollapse_${Math.random()
      .toString(36)
      .substring(2, 9)}`; // Unique ID for collapse
    this.container.innerHTML = `
            <div class="mb-3">
                <button class="btn btn-outline-secondary btn-sm cookie-toggle-button" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}" aria-expanded="false" aria-controls="${collapseId}">
                    <i class="bi bi-key me-1"></i> Configure Cookies (Optional)
                </button>
            </div>
            <div class="collapse mb-3" id="${collapseId}">
                 <div class="card card-body bg-light">
                    <label class="form-label" for="globalCookiesTextarea">YouTube Cookies</label>
                    <textarea class="form-control cookie-textarea" id="globalCookiesTextarea" rows="4" placeholder="Paste your YouTube cookies here (e.g., from a cookies.txt file). Saved automatically."></textarea>
                    <div class="form-text mt-1">
                        Required for age-restricted or private videos. Browser security prevents automatically grabbing cookies from youtube.com. Please use a browser extension (like 'Get cookies.txt LOCALLY') to export cookies, then paste the content here. Cookies are saved in your browser's local storage for future use. See <a href="https://github.com/yt-dlp/yt-dlp/wiki/FAQ#how-do-i-pass-cookies-to-yt-dlp" target="_blank" rel="noopener noreferrer">yt-dlp docs</a> for details.
                    </div>
                </div>
            </div>
        `;
  }

  attachEventListeners() {
    if (this.elements.textarea) {
      // Save on input for immediate persistence
      this.elements.textarea.addEventListener("input", () => {
        this.saveCookies();
      });
    }
    // Optional: Add listener to button if needed in future
    // if (this.elements.toggleButton) { ... }
  }

  saveCookies() {
    if (this.elements.textarea) {
      try {
        localStorage.setItem(
          this.localStorageKey,
          this.elements.textarea.value
        );
        // console.log('Cookies saved to local storage.');
      } catch (e) {
        console.error("Error saving cookies to local storage:", e);
      }
    }
  }

  loadCookies() {
    if (this.elements.textarea) {
      try {
        const savedCookies = localStorage.getItem(this.localStorageKey);
        if (savedCookies !== null) {
          // Check for null explicitly
          this.elements.textarea.value = savedCookies;
          // console.log('Cookies loaded from local storage.');
        } else {
          // console.log('No cookies found in local storage.');
          this.elements.textarea.value = ""; // Ensure textarea is empty if nothing is saved
        }
      } catch (e) {
        console.error("Error loading cookies from local storage:", e);
        this.elements.textarea.value = ""; // Clear on error
      }
    }
  }

  getCookies() {
    return this.elements.textarea ? this.elements.textarea.value.trim() : "";
  }

  // Optional: Method to clear cookies if needed
  clearCookies() {
    if (this.elements.textarea) {
      this.elements.textarea.value = "";
    }
    try {
      localStorage.removeItem(this.localStorageKey);
      // console.log('Cookies cleared from local storage.');
    } catch (e) {
      console.error("Error clearing cookies from local storage:", e);
    }
  }
}

// Export if using modules, otherwise it's globally available via script tag
// export default CookieManager; // Uncomment if using ES modules
