# Local Tools

A plug-and-play platform for various local development tools, accessible via a web interface.

## Features

Currently includes the following tools:

- **Image Resizer:** Resize images to specific dimensions.
- **Image Converter:** Convert images between different formats (e.g., PNG, JPG, WEBP).
- **Image Compressor:** Compress images to reduce file size.
- **YouTube Downloader:** Download YouTube videos or audio (MP3). Supports various quality options.
- **YouTube Transcript:** Fetch the transcript for a YouTube video.

## Setup

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/elvisgraho/local-tools
    cd local-tools
    ```

2.  **Install Dependencies:**
    Ensure you have Python 3.9+ installed.

    ```bash
    pip install -r requirements.txt
    ```

## Running Locally

1.  **Ensure FFmpeg is installed:** Some tools (like the YouTube Downloader for MP3 conversion or merging formats) require FFmpeg. Install it via your system's package manager (e.g., `apt-get install ffmpeg`, `brew install ffmpeg`). The application will indicate if FFmpeg is detected.

2.  **Run the Flask application:**

    - **Linux/macOS:**
      ```bash
      export FLASK_APP=backend/app.py
      export FLASK_RUN_HOST=0.0.0.0
      flask run
      ```
    - **Windows (Command Prompt):**
      ```cmd
      set FLASK_APP=backend/app.py
      set FLASK_RUN_HOST=0.0.0.0
      flask run
      ```
    - **Windows (PowerShell):**
      ```powershell
      $env:FLASK_APP = "backend/app.py"; $env:FLASK_RUN_HOST = "0.0.0.0"; flask run
      ```

3.  Open your web browser and navigate to `http://localhost:5000`.

## Running via Docker

This is the recommended method as it includes all necessary dependencies (Python, FFmpeg, etc.).

1.  **Build the Docker image:**

    ```bash
    docker build -t local-tools .
    ```

2.  **Run the Docker container:**

    ```bash
    docker run -p 5000:5000 local-tools
    ```

3.  Open your web browser and navigate to `http://localhost:5000`.

## Cookie Handling (YouTube Tools)

- The YouTube Downloader and Transcript tools may require YouTube cookies for age-restricted or private videos.
- A shared "Configure Cookies" section is available in both tools.
- Due to browser security limitations, cookies cannot be fetched automatically. You need to use a browser extension (e.g., "Get cookies.txt LOCALLY") to export your cookies from youtube.com and paste the content into the text area.
- Entered cookies are automatically saved in your browser's local storage for reuse across both tools.

## Adding New Tools

To add a new tool:

1.  Create a new Python file for the backend logic in the `backend/tools` directory. Implement a class with `register_routes(app)` and `get_info()` methods (see existing tools for examples).
2.  Register the tool's class in `backend/app.py`.
3.  Create a new directory for the frontend UI in the `frontend/tools` directory (e.g., `frontend/tools/new-tool/`). Add an `index.html` and necessary CSS/JS files.
4.  Add the tool to the `tools` list in `templates/index.html` so it appears on the main page.
5.  Ensure any new Python dependencies are added to `requirements.txt`.
6.  Rebuild the Docker image if running via Docker (`docker build -t local-tools .`).
