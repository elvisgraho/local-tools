import json
from flask import request, jsonify, Blueprint
import yt_dlp
import os
import tempfile
from typing import Optional
import re
import requests
import atexit

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

def get_transcript_from_url(video_url: str, cookies_file: Optional[str] = None) -> Optional[str]:
    """
    Fetch transcript using yt-dlp's built-in functionality.
    Returns the transcript text or None if failed.
    """
    ydl_opts = {
        'skip_download': True,
        'writesubtitles': True,
        'writeautomaticsub': True,
        'subtitleslangs': ['en'],
        'quiet': True, # Suppress yt-dlp output to stdout
        # Attempt to use Brave cookies if no explicit cookies file is provided
        # This might only work when running the script outside of Docker
        # 'cookiesfrombrowser': ('brave',), # Removed to prevent errors when cookiefile is provided
    }

    if cookies_file:
         ydl_opts['cookiefile'] = cookies_file # Use --cookies option if provided (overrides browser)


    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(video_url, download=False)

            subtitle_url = None
            # Check for manual captions first, then automatic captions
            if 'subtitles' in info and 'en' in info['subtitles']:
                # Find the first non-JSON format if possible, otherwise take the first one
                for fmt in info['subtitles']['en']:
                    if fmt.get('ext') != 'json':
                         subtitle_url = fmt.get('url')
                         break
                if not subtitle_url and info['subtitles']['en']: # Fallback to first if no non-json found
                     subtitle_url = info['subtitles']['en'][0].get('url')

            elif 'automatic_captions' in info and 'en' in info['automatic_captions']:
                 # Find the first non-JSON format if possible, otherwise take the first one
                for fmt in info['automatic_captions']['en']:
                    if fmt.get('ext') != 'json':
                         subtitle_url = fmt.get('url')
                         break
                if not subtitle_url and info['automatic_captions']['en']: # Fallback to first if no non-json found
                     subtitle_url = info['automatic_captions']['en'][0].get('url')

            if not subtitle_url:
                print(f"No suitable English subtitles found for {video_url}")
                return "Error: No English subtitles found." # Return error string

            # Download and parse the subtitle file
            # Use requests which is already imported
            response = requests.get(subtitle_url)
            response.raise_for_status() # Raise HTTPError for bad responses (4xx or 5xx)
            subtitle_data = response.text

            # Attempt to parse as JSON (common format for auto-captions)
            try:
                json_data = json.loads(subtitle_data)
                if 'events' in json_data:
                    transcript_parts = []
                    for event in json_data['events']:
                        if 'segs' in event:
                            line_parts = [seg['utf8'].strip() for seg in event['segs'] if 'utf8' in seg and seg['utf8'].strip()]
                            if line_parts:
                                transcript_parts.append(' '.join(line_parts))
                    return '\n'.join(transcript_parts)
                else:
                     # If JSON doesn't have 'events', maybe it's a different structure or not transcript JSON
                     print(f"Warning: Subtitle JSON format not recognized for {video_url}. Returning raw data.")
                     return subtitle_data # Return raw data as fallback

            except json.JSONDecodeError:
                # If not JSON, assume it's a plain text format (like VTT or SRT)
                # Basic cleaning: remove timestamps and formatting tags common in VTT/SRT
                lines = subtitle_data.strip().split('\n')
                transcript_lines = []
                for line in lines:
                    # Skip empty lines, sequence numbers, and timecodes
                    if not line or line.isdigit() or '-->' in line:
                        continue
                    # Basic tag removal (e.g., <v Roger>) - might need refinement
                    line = re.sub(r'<[^>]+>', '', line)
                    transcript_lines.append(line.strip())
                return '\n'.join(transcript_lines)
            except requests.RequestException as req_e:
                 print(f"Failed to download subtitle file from {subtitle_url}: {req_e}")
                 return f"Error: Failed to download subtitle file ({req_e})" # Return error string

    except yt_dlp.utils.DownloadError as dl_e:
         print(f"yt-dlp error getting transcript info for {video_url}: {dl_e}")
         # Provide a more user-friendly error based on common messages
         if "Private video" in str(dl_e):
             return "Error: Video is private."
         if "Video unavailable" in str(dl_e):
             return "Error: Video is unavailable."
         if "confirm your age" in str(dl_e):
             return "Error: Age-restricted video requires login (transcript fetch failed)."
         return f"Error: Could not process video for transcript ({dl_e})" # Return error string
    except Exception as e:
        # Catch other potential errors during the process
        print(f"Unexpected error getting transcript for {video_url}: {str(e)}")
        return f"Error: An unexpected error occurred ({str(e)})" # Return error string


# Create a Blueprint for the YouTube Transcript tool
youtube_transcript_bp = Blueprint('youtube_transcript', __name__)

@youtube_transcript_bp.route('/get_transcript', methods=['POST'])
def get_transcript_route():
    """Get transcript for the frontend"""
    url = request.form.get('url') # Get URL from form data
    cookies_string = request.form.get('cookies') # Get cookies string

    if not url:
        return jsonify({'error': 'URL is required'}), 400

    cookies_file = None
    try:
        if cookies_string:
             cookies_file = write_cookies_to_temp_file(cookies_string)
             if not cookies_file:
                 raise Exception("Failed to write cookies to a temporary file.")

        # Pass cookies_file to the transcript function
        transcript = get_transcript_from_url(url, cookies_file) # Use URL directly

        if transcript and transcript.startswith("Error:"):
             return jsonify({'status': 'error', 'error': transcript}), 500
        elif transcript:
             return jsonify({'status': 'success', 'transcript': transcript})
        else:
             return jsonify({'status': 'error', 'error': 'Could not retrieve transcript.'}), 500

    except Exception as e:
        error_msg = f"Failed to get transcript: {str(e)}"
        print(f"Error in /get_transcript for {url}: {error_msg}")
        return jsonify({'status': 'error', 'error': error_msg}), 500
    finally:
         # Clean up the temporary cookie file if it was created
         if cookies_file and os.path.exists(cookies_file):
             try:
                 os.remove(cookies_file)
             except Exception as cleanup_e:
                 print(f"Error cleaning up cookie file {cookies_file} after get_transcript_route: {cleanup_e}")


class YouTubeTranscriptTool:
    def register_routes(self, app):
        """Registers the blueprint with the Flask application."""
        app.register_blueprint(youtube_transcript_bp, url_prefix='/tool/youtube-transcript')

    def get_info(self):
        """Returns information about the tool."""
        return {
            'id': 'youtube-transcript',
            'name': 'YouTube Transcript Downloader',
            'description': 'Get the transcript for a YouTube video.',
            'icon': 'bi-file-text' # Bootstrap icon class
        }