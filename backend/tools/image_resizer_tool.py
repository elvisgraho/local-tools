import os
from io import BytesIO
from PIL import Image
from flask import request, send_file, jsonify, make_response

SUPPORTED_FORMATS = ['png', 'jpeg', 'jpg']

def _resize_image_logic(file_storage, target_width, target_height, maintain_aspect_ratio=True):
    """Internal logic for image resizing. Reads file, resizes, returns sizes."""
    input_filename = file_storage.filename
    input_format = input_filename.split('.')[-1].lower()

    if input_format not in SUPPORTED_FORMATS:
        error_msg = f"Unsupported format for resizing: {input_format}"
        print(error_msg)
        return None, None, None, None, error_msg

    output_filename = f"{os.path.splitext(input_filename)[0]}_resized.{input_format}"
    output_buffer = BytesIO()

    try:
        # Read entire file content to accurately get original size
        file_content = file_storage.read()
        original_size = len(file_content)
        file_storage.seek(0) # Reset stream

        img = Image.open(BytesIO(file_content)) # Open from bytes
        original_width, original_height = img.size

        save_format = 'JPEG' if input_format in ['jpg', 'jpeg'] else 'PNG'
        if save_format == 'JPEG' and img.mode != 'RGB':
            img = img.convert('RGB')

        new_size = (target_width, target_height)

        if maintain_aspect_ratio:
            img.thumbnail(new_size, Image.Resampling.LANCZOS)
            final_size = img.size
        else:
            img = img.resize(new_size, Image.Resampling.LANCZOS)
            final_size = new_size

        print(f"Resizing - Original: {original_width}x{original_height}, Resized to: {final_size[0]}x{final_size[1]}")

        save_kwargs = {}
        if save_format == 'JPEG':
            save_kwargs['quality'] = 95
            save_kwargs['optimize'] = True
        elif save_format == 'PNG':
             save_kwargs['optimize'] = True

        img.save(output_buffer, format=save_format, **save_kwargs)

        processed_size = output_buffer.tell()
        output_buffer.seek(0)
        print(f"Resizing - Original Size: {original_size}, Processed Size: {processed_size}")
        return output_buffer, output_filename, original_size, processed_size, None

    except Exception as e:
        error_msg = f"Error during image resizing: {e}"
        print(error_msg)
        return None, None, None, None, error_msg


class ImageResizerTool:
    def get_info(self):
        return {
            'id': 'image-resizer',
            'name': 'Image Resizer',
            'description': 'Resize PNG or JPG/JPEG images to specific dimensions.',
            'endpoint': '/api/tool/image-resizer/execute',
            'icon': 'bi-aspect-ratio'
        }

    def register_routes(self, app):
        @app.route('/api/tool/image-resizer/execute', methods=['POST'])
        def execute_image_resizing():
            if 'file' not in request.files:
                return jsonify({"error": "No file part"}), 400
            file = request.files['file']
            if file.filename == '':
                return jsonify({"error": "No selected file"}), 400

            try:
                target_width = int(request.form.get('width'))
                target_height = int(request.form.get('height'))
            except (TypeError, ValueError):
                 return jsonify({"error": "Invalid width or height provided. Must be integers."}), 400

            maintain_aspect_ratio = request.form.get('maintain_aspect_ratio', 'true').lower() == 'true'

            input_format = file.filename.split('.')[-1].lower()
            if input_format not in SUPPORTED_FORMATS:
                 return jsonify({"error": f"Unsupported format: {input_format}. Supported: {SUPPORTED_FORMATS}"}), 400

            if file:
                output_buffer, output_filename, original_size, processed_size, error = _resize_image_logic(
                    file, target_width, target_height, maintain_aspect_ratio
                )
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