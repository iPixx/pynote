#!/usr/bin/env python3
import os
from pathlib import Path
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import markdown

app = Flask(__name__)
CORS(app)

vault_path = None

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/static/<path:filename>')
def serve_static(filename):
    return send_from_directory('static', filename)

@app.route('/api/set-vault', methods=['POST'])
def set_vault():
    global vault_path
    data = request.get_json()
    path = data.get('path')
    
    if not path or not os.path.exists(path):
        return jsonify({'error': 'Invalid path'}), 400
    
    vault_path = Path(path)
    return jsonify({'success': True, 'path': str(vault_path)})

@app.route('/api/files', methods=['GET'])
def get_files():
    if not vault_path:
        return jsonify({'error': 'No vault selected'}), 400
    
    def build_tree_structure():
        tree = {}
        
        for file_path in vault_path.rglob('*.md'):
            relative_path = file_path.relative_to(vault_path)
            parts = relative_path.parts
            
            current = tree
            for i, part in enumerate(parts[:-1]):
                if part not in current:
                    current[part] = {'type': 'folder', 'children': {}}
                current = current[part]['children']
            
            current[parts[-1]] = {
                'type': 'file',
                'path': str(relative_path),
                'full_path': str(file_path)
            }
        
        return tree
    
    def flatten_tree(tree, prefix=''):
        items = []
        for name, item in sorted(tree.items()):
            path = f"{prefix}/{name}" if prefix else name
            if item['type'] == 'folder':
                items.append({
                    'name': name,
                    'type': 'folder',
                    'path': path,
                    'level': len(path.split('/')) - 1
                })
                items.extend(flatten_tree(item['children'], path))
            else:
                items.append({
                    'name': name,
                    'type': 'file',
                    'path': item['path'],
                    'full_path': item['full_path'],
                    'level': len(path.split('/')) - 1
                })
        return items
    
    tree = build_tree_structure()
    files = flatten_tree(tree)
    
    return jsonify(files)

@app.route('/api/file/<path:file_path>', methods=['GET'])
def get_file(file_path):
    if not vault_path:
        return jsonify({'error': 'No vault selected'}), 400
    
    full_path = vault_path / file_path
    if not full_path.exists() or not str(full_path).endswith('.md'):
        return jsonify({'error': 'File not found'}), 404
    
    try:
        content = full_path.read_text(encoding='utf-8')
        return jsonify({'content': content, 'path': file_path})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/file/<path:file_path>', methods=['PUT'])
def save_file(file_path):
    if not vault_path:
        return jsonify({'error': 'No vault selected'}), 400
    
    data = request.get_json()
    content = data.get('content', '')
    
    full_path = vault_path / file_path
    
    try:
        full_path.parent.mkdir(parents=True, exist_ok=True)
        full_path.write_text(content, encoding='utf-8')
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/file/<path:file_path>', methods=['DELETE'])
def delete_file(file_path):
    if not vault_path:
        return jsonify({'error': 'No vault selected'}), 400
    
    full_path = vault_path / file_path
    if not full_path.exists():
        return jsonify({'error': 'File not found'}), 404
    
    try:
        full_path.unlink()
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/move-file', methods=['POST'])
def move_file():
    if not vault_path:
        return jsonify({'error': 'No vault selected'}), 400
    
    data = request.get_json()
    source_path = data.get('source')
    target_path = data.get('target')
    
    if not source_path or not target_path:
        return jsonify({'error': 'Source and target paths required'}), 400
    
    source_full_path = vault_path / source_path
    target_full_path = vault_path / target_path
    
    if not source_full_path.exists():
        return jsonify({'error': 'Source file not found'}), 404
    
    if target_full_path.exists():
        return jsonify({'error': 'Target file already exists'}), 400
    
    try:
        target_full_path.parent.mkdir(parents=True, exist_ok=True)
        source_full_path.rename(target_full_path)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/preview', methods=['POST'])
def preview_markdown():
    data = request.get_json()
    content = data.get('content', '')
    
    try:
        html = markdown.markdown(content, extensions=['fenced_code', 'tables'])
        return jsonify({'html': html})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=8000)