import os
from io import BytesIO
from PIL import Image
from flask import request, send_file, jsonify, make_response

SUPPORTED_FORMATS = ['png', 'jpeg', 'jpg']

def _compress_image_logic(file_storage, quality=85):
    """Internal logic for image compression. Reads file, compresses, returns sizes."""
    input_filename = file_storage.filename
    input_format = input_filename.split('.')[-1].lower()

    if input_format not in SUPPORTED_FORMATS:
        error_msg = f"Unsupported format for compression: {input_format}"
        print(error_msg)
        return None, None, None, None, error_msg

    output_filename = f"{os.path.splitext(input_filename)[0]}_compressed.{input_format}"
    output_buffer = BytesIO()

    try:
        # Read entire file content to accurately get original size
        file_content = file_storage.read()
        original_size = len(file_content)
        file_storage.seek(0) # Reset stream

        img = Image.open(BytesIO(file_content)) # Open from bytes

        save_format = 'JPEG' if input_format in ['jpg', 'jpeg'] else 'PNG'
        save_kwargs = {}

        # Ensure RGB mode for JPG saving if original is RGBA (like PNG)
        if save_format == 'JPEG' and img.mode != 'RGB':
            img = img.convert('RGB')

        if save_format == 'PNG':
            save_kwargs['optimize'] = True
        elif save_format == 'JPEG':
            quality = max(1, min(int(quality), 95)) # Clamp quality between 1 and 95
            save_kwargs['quality'] = quality
            save_kwargs['optimize'] = True

        img.save(output_buffer, format=save_format, **save_kwargs)

        processed_size = output_buffer.tell()
        output_buffer.seek(0)
        print(f"Compression - Original: {original_size}, Processed: {processed_size}")

        return output_buffer, output_filename, original_size, processed_size, None

    except Exception as e:
        error_msg = f"Error during image compression: {e}"
        print(error_msg)
        return None, None, None, None, error_msg


class ImageCompressorTool:
    def get_info(self):
        return {
            'id': 'image-compressor',
            'name': 'Image Compressor',
            'description': 'Compress PNG or JPG/JPEG images.',
            'endpoint': '/api/tool/image-compressor/execute',
            'icon': 'bi-file-earmark-zip'
        }

    def register_routes(self, app):
        @app.route('/api/tool/image-compressor/execute', methods=['POST'])
        def execute_image_compression():
            if 'file' not in request.files:
                return jsonify({"error": "No file part"}), 400
            file = request.files['file']
            if file.filename == '':
                return jsonify({"error": "No selected file"}), 400

            quality = 85 # Default quality
            input_format = file.filename.split('.')[-1].lower()
            if input_format in ['jpg', 'jpeg']:
                try:
                    # Get quality only if it's relevant
                    quality = int(request.form.get('quality', 85))
                except ValueError:
                    return jsonify({"error": "Invalid quality value, must be an integer."}), 400

            if input_format not in SUPPORTED_FORMATS:
                 return jsonify({"error": f"Unsupported format: {input_format}. Supported: {SUPPORTED_FORMATS}"}), 400

            if file:
                output_buffer, output_filename, original_size, processed_size, error = _compress_image_logic(file, quality)
                if error:
                    return jsonify({"error": error}), 500
                if output_buffer and output_filename:
                    mime_type = f'image/{input_format}' if input_format != 'jpg' else 'image/jpeg'
                    response = make_response(send_file(
                        output_buffer,
                        mimetype=mime_type,
                        as_attachment=True,
                        download_name=output_filename
                    ))
                    # Add custom headers for size info
                    response.headers['X-Original-Size'] = str(original_size)
                    response.headers['X-Processed-Size'] = str(processed_size)
                    # Required for frontend JS to read custom headers
                    response.headers['Access-Control-Expose-Headers'] = 'X-Original-Size, X-Processed-Size, Content-Disposition'
                    return response

            return jsonify({"error": "File processing failed"}), 500