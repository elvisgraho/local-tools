from flask import request, send_file, jsonify, Response, Blueprint
import yt_dlp
import os
import tempfile
from pathlib import Path
import subprocess
import sys
import json
import time
import threading
from typing import Optional
import re
import atexit # Import atexit for cleanup
import tempfile # Ensure tempfile is imported

# Configure the download directory (relative to the backend directory)
DOWNLOAD_DIR = Path("../downloads")
DOWNLOAD_DIR.mkdir(exist_ok=True)

# Store download progress - structure will be updated by the hook
download_progress = {}

def my_progress_hook(d):
    # Attempt to get video_id from info_dict first
    video_id = d.get('info_dict', {}).get('id')

    # Fallback: If info_dict not present (e.g., early hook call), try filename
    if not video_id and 'filename' in d:
         # yt-dlp often uses the final filename in hooks even before download finishes
         # We might need a way to map filename back to video_id if ID isn't in info_dict yet
         # For now, assume ID is usually available when 'downloading' status occurs
         pass # Placeholder for more complex filename-to-ID mapping if needed

    # If we have an ID and it's being tracked
    if video_id and video_id in download_progress:
        current_status = download_progress[video_id]
        hook_status = d['status']

        if hook_status == 'downloading':
            total_bytes = d.get('total_bytes') or d.get('total_bytes_estimate')
            downloaded_bytes = d.get('downloaded_bytes')
            speed = d.get('speed')
            eta = d.get('eta')

            if total_bytes and downloaded_bytes is not None: # Ensure downloaded_bytes is not None
                current_status['progress'] = round((downloaded_bytes / total_bytes) * 100, 1)
            else:
                # Keep previous progress or 0 if unknown
                current_status['progress'] = current_status.get('progress', 0)

            current_status['speed'] = f"{speed / 1024 / 1024:.2f} MB/s" if speed else "N/A"
            # Format ETA nicely
            if eta is not None:
                 minutes, seconds = divmod(int(eta), 60)
                 current_status['eta'] = f"{minutes:02d}:{seconds:02d}"
            else:
                 current_status['eta'] = "N/A"

            current_status['status'] = 'downloading'

        elif hook_status == 'finished':
            # This hook might fire before post-processing. Mark progress 100%.
            # The final 'completed' status is set after ydl.download() finishes successfully.
            current_status['progress'] = 100
            # Store the temporary filename from the hook if available
            if 'filename' in d:
                 current_status['_temp_filename'] = d['filename']
            # Don't set status to 'completed' here yet, wait for thread confirmation

        elif hook_status == 'error':
            current_status['status'] = 'error'
            current_status['error'] = d.get('error', 'yt-dlp download error') # Get specific error if provided
            current_status['progress'] = 0 # Reset progress on error

        # Update the global dictionary (ensure thread safety if scaling needed, but ok for now)
        download_progress[video_id] = current_status
    # else:
        # Optional: Handle cases where hook is called for an untracked ID
        # print(f"Warning: Progress hook called for an untracked ID. Data: {d}")


def check_ffmpeg_installed():
    """Check if ffmpeg is installed and available in PATH"""
    try:
        # Use shell=True on Windows if PATH issues persist, but False is safer
        subprocess.run(['ffmpeg', '-version'], capture_output=True, check=True, text=True)
        return True
    except (subprocess.SubprocessError, FileNotFoundError):
        return False

def write_cookies_to_temp_file(cookies_string: str) -> Optional[str]:
    """Writes a cookie string to a temporary file and returns the path."""
    if not cookies_string:
        return None
    try:
        # Use NamedTemporaryFile so we can get a path and keep the file open/managed
        # delete=False means we'll manually clean it up later
        temp_file = tempfile.NamedTemporaryFile(mode='w+', delete=False, encoding='utf-8')
        temp_file.write(cookies_string)
        temp_file.close() # Close the file so yt-dlp can access it
        # Register the file for deletion on script exit
        atexit.register(os.remove, temp_file.name)
        return temp_file.name
    except Exception as e:
        print(f"Error writing cookies to temp file: {e}")
        return None

def get_video_info(url, cookies_file: Optional[str] = None):
    """Get video information using yt-dlp"""
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'skip_download': True, # Ensure we only fetch info
    }

    if cookies_file:
         ydl_opts['cookiefile'] = cookies_file
    # else: # Removed fallback to prevent errors when cookiefile is provided
    #      ydl_opts['cookiesfrombrowser'] = ('brave',)

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        try:
            info = ydl.extract_info(url, download=False)

            # Extract available formats with detailed information
            available_formats = []
            seen_formats = set() # Avoid duplicates

            for f in info.get('formats', []):
                # Ensure necessary keys exist and format is somewhat useful (has height or is audio-only)
                if (f.get('height') or f.get('acodec') != 'none') and f.get('format_id'):
                    # Create a unique key for the format to avoid duplicates
                    format_key = (f.get('height'), f.get('fps'), f.get('vcodec'), f.get('acodec'), f.get('ext'))
                    if format_key in seen_formats:
                        continue
                    seen_formats.add(format_key)

                    format_info = {
                        'height': f.get('height'), # Can be None for audio
                        'ext': f.get('ext', ''),
                        'format_note': f.get('format_note', ''),
                        'format_id': f.get('format_id'),
                        'acodec': f.get('acodec', 'none'),
                        'vcodec': f.get('vcodec', 'none'),
                        'filesize': f.get('filesize') or f.get('filesize_approx'), # Use estimate if exact is missing
                        'fps': f.get('fps'), # Can be None
                    }
                    available_formats.append(format_info)

            # Sort formats: Best video (height, fps, filesize) first, then audio
            available_formats.sort(key=lambda x: (
                -x['height'] if x['height'] else 0, # Height descending (treat None as 0)
                -x['fps'] if x['fps'] else 0,       # FPS descending (treat None as 0)
                -x['filesize'] if x['filesize'] else 0, # Filesize descending (treat None as 0)
                x['vcodec'] == 'none' # Put audio-only formats last
            ))

            # Create format options for the dropdown
            format_options = []
            seen_heights = set()

            # Add 'best' option first
            format_options.append({
                'height': 'best', 'format_id': 'best', 'ext': 'mp4',
                'format_note': 'Best Available', 'fps': None,
                'has_audio': True, 'has_video': True
            })

            for fmt in available_formats:
                 # Only add video options with height, avoid duplicates
                 height = fmt['height']
                 if height and height not in seen_heights:
                     seen_heights.add(height)
                     format_options.append({
                         'height': height,
                         'format_id': fmt['format_id'], # Keep format_id for potential future use
                         'ext': fmt['ext'],
                         'format_note': fmt['format_note'],
                         'fps': fmt['fps'],
                         'has_audio': fmt['acodec'] != 'none',
                         'has_video': fmt['vcodec'] != 'none'
                     })

            return {
                'id': info.get('id', ''),
                'title': info.get('title', 'Unknown Title'),
                'thumbnail': info.get('thumbnail', ''),
                'duration': info.get('duration', 0),
                'available_formats': format_options,
                'ffmpeg_installed': check_ffmpeg_installed()
            }
        except Exception as e:
            print(f"Error getting video info for {url}: {e}")
            return {'error': f'Failed to get video info: {str(e)}'}


def download_video_thread(video_id, url, format_type='mp4', quality='best', cookies_file: Optional[str] = None):
    """Target function for download thread"""
    if video_id not in download_progress:
        print(f"Error: Progress entry not found for {video_id}")
        return

    # Update status to starting
    download_progress[video_id]['status'] = 'starting'

    # Use TemporaryDirectory for robust cleanup
    with tempfile.TemporaryDirectory() as temp_dir:
        base_ydl_opts = {
            'outtmpl': os.path.join(temp_dir, '%(id)s.%(ext)s'), # Use ID for temp name
            'progress_hooks': [my_progress_hook],
            'ignoreerrors': True, # Let hook handle 'error' status
            'no_warnings': True,
            'quiet': False, # Ensure hooks receive messages, but avoid excessive stdout
            'noprogress': False, # Ensure progress is reported
            # 'cookiesfrombrowser': ('chrome',), # Remove or adjust this when using --cookies
            # 'verbose': True,
        }

        if cookies_file:
            base_ydl_opts['cookiefile'] = cookies_file
        # else: # Removed fallback to prevent errors when cookiefile is provided
        #     # Fallback to Brave cookies if no file provided
        #     base_ydl_opts['cookiesfrombrowser'] = ('brave',)


        if format_type == 'mp3':
            ydl_opts = {
                **base_ydl_opts,
                'format': 'bestaudio/best',
                'postprocessors': [{
                    'key': 'FFmpegExtractAudio',
                    'preferredcodec': 'mp3',
                    'preferredquality': '192', # Standard MP3 quality
                }],
                # Ensure final extension is mp3 after postprocessing
                'outtmpl': os.path.join(temp_dir, '%(id)s.%(ext)s'), # yt-dlp handles final naming with postproc
            }
        else: # mp4 or other video
            video_format = 'best[ext=mp4]/best' # Default best mp4 or any best
            if quality != 'best':
                 # Specific quality, prefer mp4 container
                 video_format = f'bestvideo[height<={quality}][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<={quality}]+bestaudio/best[height<={quality}][ext=mp4]/best[height<={quality}]'

            ydl_opts = {
                 **base_ydl_opts,
                 'format': video_format,
                 'merge_output_format': 'mp4', # Ensure merged files are mp4 if possible
            }

        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                # Re-extract info just before download to get potentially updated title/metadata
                # Use skip_download=True to avoid downloading here
                info = ydl.extract_info(url, download=False)
                title = info.get('title', video_id) # Use title for final filename

                # Start the actual download
                retcode = ydl.download([url]) # Pass URL in a list

                # Check status set by hook or if download method indicated failure (though ignoreerrors is True)
                if download_progress[video_id]['status'] == 'error':
                     raise Exception(download_progress[video_id].get('error', 'Unknown download error during processing'))

                # Find the downloaded file (hook should provide _temp_filename)
                temp_filename_str = download_progress[video_id].get('_temp_filename')
                downloaded_file = None

                if temp_filename_str and Path(temp_filename_str).exists():
                     downloaded_file = Path(temp_filename_str)
                     # Correct the extension if it's mp3 format but hook reported temp name like .webm
                     if format_type == 'mp3' and downloaded_file.suffix != '.mp3':
                          expected_mp3_path = downloaded_file.with_suffix('.mp3')
                          if expected_mp3_path.exists():
                               downloaded_file = expected_mp3_path
                          # else: keep original if .mp3 doesn't exist (shouldn't happen with postprocessor)

                else:
                     # Fallback: search for the file in temp_dir based on ID if hook didn't provide path
                     print(f"Warning: Hook did not provide filename for {video_id}. Searching temp dir...")
                     possible_files = list(Path(temp_dir).glob(f"{video_id}.*"))
                     if possible_files:
                          # Select the most likely file (mp4 or mp3)
                          preferred_ext = '.mp3' if format_type == 'mp3' else '.mp4'
                          for f in possible_files:
                               if f.suffix == preferred_ext:
                                    downloaded_file = f
                                    break
                          if not downloaded_file:
                               downloaded_file = possible_files[0] # Take first match otherwise

                if not downloaded_file or not downloaded_file.exists():
                     print(f"Error: Could not find downloaded file for {video_id} in {temp_dir}. Files: {list(Path(temp_dir).glob('*'))}")
                     raise FileNotFoundError(f"Downloaded file for {video_id} missing after processing.")

                # Construct final filename (using sanitized title)
                sanitized_title = "".join(c if c.isalnum() or c in (' ', '-', '_') else '_' for c in title).strip()
                final_filename = f"{sanitized_title}{downloaded_file.suffix}"
                final_path = DOWNLOAD_DIR / final_filename

                # Move the file from temp to final destination
                downloaded_file.rename(final_path)

                # Update progress dictionary with final details
                download_progress[video_id]['filename'] = str(final_path)
                download_progress[video_id]['status'] = "completed"
                download_progress[video_id]['progress'] = 100 # Ensure 100% on success
                print(f"Download complete for {video_id}: {final_path}")

        except Exception as e:
            error_msg = str(e)
            print(f"Download thread failed for {video_id}: {error_msg}")
            if video_id in download_progress:
                download_progress[video_id]['status'] = 'error'
                # Try to get a more specific error from yt-dlp if possible
                if isinstance(e, yt_dlp.utils.DownloadError):
                     error_msg = f"yt-dlp: {error_msg}"
                download_progress[video_id]['error'] = error_msg
                download_progress[video_id]['progress'] = 0 # Ensure progress is 0 on error
        # TemporaryDirectory cleans itself up automatically when exiting 'with' block


# Function to get transcript (adapted from crawl_yt.py)


# Create a Blueprint for the YouTube Downloader tool
youtube_downloader_bp = Blueprint('youtube_downloader', __name__)

@youtube_downloader_bp.route('/check_ffmpeg')
def check_ffmpeg_route():
    """Check if ffmpeg is installed and return status"""
    return jsonify({'installed': check_ffmpeg_installed()})

@youtube_downloader_bp.route('/get_info', methods=['POST'])
def get_info_route():
    """Get video info for the frontend"""
    url = request.form.get('url')
    cookies_string = request.form.get('cookies') # Get cookies string
    if not url:
        return jsonify({'error': 'URL is required'}), 400

    video_id_temp = None
    cookies_file = None

    try:
        if cookies_string:
             cookies_file = write_cookies_to_temp_file(cookies_string)
             if not cookies_file:
                 raise Exception("Failed to write cookies to a temporary file.")

        # Attempt to pre-extract ID (optional, but can help with progress tracking init)
        ydl_opts_id = {'quiet': True, 'no_warnings': True, 'skip_download': True, 'extract_flat': True}
        if cookies_file:
             ydl_opts_id['cookiefile'] = cookies_file

        with yt_dlp.YoutubeDL(ydl_opts_id) as ydl_id:
            try:
                info_id_only = ydl_id.extract_info(url, download=False)
                video_id_temp = info_id_only.get('id')
                if video_id_temp and video_id_temp in download_progress:
                     print(f"Re-fetching info for known ID: {video_id_temp}. Progress state will be updated.")
            except Exception as id_extract_err:
                 print(f"Warning: Could not pre-extract ID for {url}: {id_extract_err}")

        info = get_video_info(url, cookies_file) # Pass cookies_file to get_video_info

        if 'error' in info:
             raise Exception(info['error'])

        video_id = info.get('id')
        if not video_id:
             raise Exception("Could not extract video ID from the provided URL.")

        # Store essential info in download_progress upon successful info fetch
        download_progress[video_id] = {
            'video_id': video_id,
            'url': url,
            'title': info.get('title', 'Unknown Title'),
            'status': 'info_loaded',
            'progress': 0,
            'speed': 'N/A',
            'eta': 'N/A',
            'filename': None,
            'error': None,
            '_temp_filename': None
        }
        print(f"Stored info for {video_id} in progress tracker.")

        return jsonify(info)

    except Exception as e:
        error_msg = f"Failed to get video info: {str(e)}"
        print(f"Error in /get_info for {url}: {error_msg}")
        if video_id_temp and video_id_temp in download_progress:
             download_progress[video_id_temp]['status'] = 'error'
             download_progress[video_id_temp]['error'] = error_msg
        return jsonify({'error': error_msg}), 500
    finally:
         # Clean up the temporary cookie file if it was created
         if cookies_file and os.path.exists(cookies_file):
             try:
                 os.remove(cookies_file)
             except Exception as cleanup_e:
                 print(f"Error cleaning up cookie file {cookies_file}: {cleanup_e}")


@youtube_downloader_bp.route('/progress/<video_id>')
def get_progress_route(video_id):
    """Get download progress for a video"""
    if video_id in download_progress:
        return jsonify(download_progress[video_id])
    return jsonify({'status': 'not_found', 'error': 'Video ID not found or download not initiated.'}), 404

@youtube_downloader_bp.route('/download', methods=['POST'])
def start_download_route():
    """Start the video download in a separate thread"""
    url = request.form.get('url')
    format_type = request.form.get('format', 'mp4')
    quality = request.form.get('quality', 'best')
    cookies_string = request.form.get('cookies') # Get cookies string

    if not url:
        return jsonify({'error': 'URL is required'}), 400

    cookies_file = None
    try:
        if cookies_string:
             cookies_file = write_cookies_to_temp_file(cookies_string)
             if not cookies_file:
                 raise Exception("Failed to write cookies to a temporary file.")

        # Get video info first to ensure we have the ID and initial data
        # Pass cookies_file to get_video_info here as well
        info = get_video_info(url, cookies_file)
        if 'error' in info:
            return jsonify({'error': info['error']}), 500

        video_id = info.get('id')
        if not video_id:
            return jsonify({'error': 'Could not extract video ID.'}), 500

        # Initialize progress tracking for this video ID
        # This might have been done by get_info_route, but ensure it exists
        if video_id not in download_progress or download_progress[video_id]['status'] in ['completed', 'error']:
             download_progress[video_id] = {
                'video_id': video_id,
                'url': url,
                'title': info.get('title', 'Unknown Title'),
                'status': 'info_loaded',
                'progress': 0,
                'speed': 'N/A',
                'eta': 'N/A',
                'filename': None,
                'error': None,
                '_temp_filename': None
            }
        print(f"Starting download thread for {video_id}...")
        # Pass cookies_file to the download thread
        thread = threading.Thread(
            target=download_video_thread,
            args=(video_id, url, format_type, quality, cookies_file)
        )
        thread.start()

        return jsonify({'status': 'download_started', 'video_id': video_id})

    except Exception as e:
        error_msg = f"Failed to start download: {str(e)}"
        print(f"Error in /download for {url}: {error_msg}")
        # If an error occurs before the thread starts, update progress here
        video_id_temp = None
        try:
             # Attempt to get video ID to update progress if possible
             ydl_opts_id = {'quiet': True, 'no_warnings': True, 'skip_download': True, 'extract_flat': True}
             if cookies_file:
                  ydl_opts_id['cookiefile'] = cookies_file
             # else: # Removed fallback to prevent errors when cookiefile is provided
             #      ydl_opts_id['cookiesfrombrowser'] = ('chrome',)
             with yt_dlp.YoutubeDL(ydl_opts_id) as ydl_id:
                  info_id_only = ydl_id.extract_info(url, download=False)
                  video_id_temp = info_id_only.get('id')
        except Exception:
             pass # Ignore errors during ID extraction for error reporting

        if video_id_temp and video_id_temp in download_progress:
             download_progress[video_id_temp]['status'] = 'error'
             download_progress[video_id_temp]['error'] = error_msg
        return jsonify({'error': error_msg}), 500
    finally:
         # Clean up the temporary cookie file if it was created
         # Note: The download_video_thread will also attempt cleanup, but this handles errors before thread start
         if cookies_file and os.path.exists(cookies_file):
             try:
                 os.remove(cookies_file)
             except Exception as cleanup_e:
                 print(f"Error cleaning up cookie file {cookies_file} after start_download_route: {cleanup_e}")


@youtube_downloader_bp.route('/get_file/<video_id>')
def get_file_route(video_id):
    """Serve the downloaded file"""
    if video_id in download_progress and download_progress[video_id]['status'] == 'completed':
        file_path = download_progress[video_id]['filename']
        if file_path and os.path.exists(file_path):
            # Clean up the progress entry after serving the file
            del download_progress[video_id]
            return send_file(file_path, as_attachment=True)
        else:
            return jsonify({'error': 'File not found.'}), 404
    return jsonify({'error': 'Download not complete or not found.'}), 404



class YouTubeDownloaderTool:
    def register_routes(self, app):
        """Registers the blueprint with the Flask application."""
        app.register_blueprint(youtube_downloader_bp, url_prefix='/tool/youtube-downloader')

    def get_info(self):
        """Returns information about the tool."""
        return {
            'id': 'youtube-downloader',
            'name': 'YouTube Downloader',
            'description': 'Download videos and transcripts from YouTube.',
            'icon': 'bi-youtube' # Bootstrap icon class
        }