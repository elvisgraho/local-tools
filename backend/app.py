import sys
from flask import Flask, jsonify, render_template, send_from_directory
import os
import importlib.util

# Configure Flask to serve static files and templates from the frontend directory
app = Flask(__name__, static_folder='../frontend', template_folder='../templates')

# Dictionary to store registered tool instances
registered_tools = {}

def register_tool(tool_instance):
    """Registers a tool instance with the Flask application."""
    tool_info = tool_instance.get_info()
    tool_id = tool_info['id']
    if tool_id in registered_tools:
        print(f"Warning: Tool with ID '{tool_id}' already registered. Skipping.")
        return

    registered_tools[tool_id] = tool_instance
    tool_instance.register_routes(app)
    print(f"Registered tool: {tool_info['name']} ({tool_id})")

def load_tools_from_directory(tool_dir="backend/tools"):
    """Loads tool modules from the specified directory and registers them."""
    abs_tool_dir = os.path.join(os.path.dirname(__file__), tool_dir)
    print(f"Loading tools from: {abs_tool_dir}")
    for filename in os.listdir(abs_tool_dir):
        if filename.endswith("_tool.py"):
            module_name = filename[:-3] # Remove .py
            file_path = os.path.join(abs_tool_dir, filename)

            try:
                spec = importlib.util.spec_from_file_location(module_name, file_path)
                module = importlib.util.module_from_spec(spec)
                sys.modules[module_name] = module
                spec.loader.exec_module(module)

                # Assuming each tool module has a class named like ToolNameTool
                # Find the tool class (convention: ends with 'Tool')
                for name, obj in module.__dict__.items():
                    if isinstance(obj, type) and name.endswith('Tool'):
                        tool_instance = obj()
                        register_tool(tool_instance)
                        break # Assume only one tool class per file
                else:
                    print(f"Warning: No tool class found in {filename}")

            except Exception as e:
                print(f"Error loading tool from {filename}: {e}")

# Load tools when the application starts
with app.app_context():
    load_tools_from_directory(tool_dir="tools")


@app.route('/')
def index():
    # Serve the main frontend index.html
    return render_template('index.html')

@app.route('/tools/<tool_id>')
def serve_tool_frontend(tool_id):
    # Map tool_id to the correct frontend directory
    frontend_dir_map = {
        'youtube-downloader': '../frontend/tools/youtube-downloader',
        'youtube-transcript': '../frontend/tools/youtube-transcript',
        'image-converter': '../frontend/tools/image-converter',
        'image-compressor': '../frontend/tools/image-compressor',
        'image-resizer': '../frontend/tools/image-resizer',
        # Add other tools here as needed
    }
    
    frontend_dir = frontend_dir_map.get(tool_id)
    
    if frontend_dir:
        # Serve the index.html from the tool's frontend directory
        return send_from_directory(frontend_dir, 'index.html')
    else:
        return "Tool not found", 404

@app.route('/tools/<tool_id>/<path:filename>')
def serve_tool_static(tool_id, filename):
    # Map tool_id to the correct frontend directory
    frontend_dir_map = {
        'youtube-downloader': '../frontend/tools/youtube-downloader',
        'youtube-transcript': '../frontend/tools/youtube-transcript',
        'image-converter': '../frontend/tools/image-converter',
        'image-compressor': '../frontend/tools/image-compressor',
        'image-resizer': '../frontend/tools/image-resizer',
        # Add other tools here as needed
    }

    frontend_dir = frontend_dir_map.get(tool_id)

    if frontend_dir:
        # Serve the static file from the tool's frontend directory
        return send_from_directory(frontend_dir, filename)
    else:
        return "Tool not found", 404

@app.route('/api/tools')
def list_tools():
    # Return the list of registered tools' info
    return jsonify([tool.get_info() for tool in registered_tools.values()])

# TODO: Add a generic endpoint for tool execution, e.g., /api/tool/<tool_id>/execute

if __name__ == '__main__':
    # Run the Flask development server
    # In production, use a production-ready WSGI server like Gunicorn or uWSGI
    app.run(debug=True)