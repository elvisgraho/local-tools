import os
from io import BytesIO
from PIL import Image
from pdf2image import convert_from_bytes
from flask import request, send_file, jsonify, make_response

SUPPORTED_INPUT_FORMATS = ['pdf', 'png', 'jpeg', 'jpg']
SUPPORTED_OUTPUT_FORMATS = ['png', 'jpg']

def _convert_image_logic(file_storage):
    """Internal logic for image conversion. Reads file, converts, returns sizes."""
    input_filename = file_storage.filename
    input_format = input_filename.split('.')[-1].lower()

    try:
        # Read entire file content to accurately get original size
        file_content = file_storage.read()
        original_size = len(file_content)
        file_storage.seek(0) # Reset stream position if needed elsewhere (though not strictly necessary here as we use file_content)

        output_format = request.form.get('output_format', 'png').lower() # Get format from request context

        if input_format not in SUPPORTED_INPUT_FORMATS or output_format not in SUPPORTED_OUTPUT_FORMATS:
            error_msg = f"Unsupported format: input={input_format}, output={output_format}"
            print(error_msg)
            return None, None, None, None, error_msg

        output_filename = f"{os.path.splitext(input_filename)[0]}_converted.{output_format}"
        output_buffer = BytesIO()

        if input_format == 'pdf':
            images = convert_from_bytes(file_content, first_page=1, last_page=1, fmt=output_format)
            if images:
                img = images[0]
                if output_format == 'jpg' and img.mode != 'RGB':
                    img = img.convert('RGB')
                img.save(output_buffer, format=output_format.upper())
            else:
                error_msg = "Failed to extract image from PDF."
                print(error_msg)
                return None, None, None, None, error_msg
        else:
            img = Image.open(BytesIO(file_content)) # Open from bytes
            if output_format == 'jpg' and img.mode != 'RGB':
                img = img.convert('RGB')
            elif output_format == 'png' and img.mode == 'P':
                 img = img.convert('RGBA')
            # No conversion needed for RGB -> PNG or RGBA -> PNG

            img.save(output_buffer, format=output_format.upper())

        processed_size = output_buffer.tell()
        output_buffer.seek(0)
        print(f"Conversion - Original: {original_size}, Processed: {processed_size}")
        return output_buffer, output_filename, original_size, processed_size, None

    except Exception as e:
        error_msg = f"Error during image conversion: {e}"
        print(error_msg)
        return None, None, None, None, error_msg


class ImageConverterTool:
    def get_info(self):
        return {
            'id': 'image-converter',
            'name': 'Image Converter',
            'description': 'Convert image formats (PDF, PNG, JPG/JPEG to PNG or JPG).',
            'endpoint': '/api/tool/image-converter/execute',
            'icon': 'bi-arrow-left-right'
        }

    def register_routes(self, app):
        @app.route('/api/tool/image-converter/execute', methods=['POST'])
        def execute_image_conversion():
            if 'file' not in request.files:
                return jsonify({"error": "No file part"}), 400
            file = request.files['file']
            if file.filename == '':
                return jsonify({"error": "No selected file"}), 400

            output_format = request.form.get('output_format', 'png').lower() # Still needed for logic fn
            if output_format not in SUPPORTED_OUTPUT_FORMATS:
                 return jsonify({"error": f"Invalid output format: {output_format}. Supported: {SUPPORTED_OUTPUT_FORMATS}"}), 400

            if file:
                # Pass file storage directly, logic function now handles reading and format
                output_buffer, output_filename, original_size, processed_size, error = _convert_image_logic(file)

                if error:
                    return jsonify({"error": error}), 500
                if output_buffer and output_filename:
                    response = make_response(send_file(
                        output_buffer,
                        mimetype=f'image/{output_format}',
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