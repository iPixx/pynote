#!/usr/bin/env python3
import os
import json
from pathlib import Path
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import markdown
from sentence_transformers import SentenceTransformer
import numpy as np
from sklearn.metrics.pairwise import cosine_similarity

app = Flask(__name__)
CORS(app)

vault_path = None
embedding_model = None
vector_store = {}
current_model_name = "all-mpnet-base-v2"

# Popular embedding models available through sentence-transformers
AVAILABLE_MODELS = {
    "nomic-ai/nomic-embed-text-v1.5": {
        "name": "nomic-ai/nomic-embed-text-v1.5",
        "description": "High-performance 768D model with 8192 context length",
        "size": "550MB",
        "max_seq_length": 8192
    },
    "all-mpnet-base-v2": {
        "name": "all-mpnet-base-v2",
        "description": "Best overall performance, 768 dimensions",
        "size": "420MB",
        "max_seq_length": 384
    },
    "all-MiniLM-L6-v2": {
        "name": "all-MiniLM-L6-v2", 
        "description": "Fastest and smallest, 384 dimensions",
        "size": "90MB",
        "max_seq_length": 256
    },
    "all-MiniLM-L12-v2": {
        "name": "all-MiniLM-L12-v2",
        "description": "Good balance of speed and performance, 384 dimensions", 
        "size": "120MB",
        "max_seq_length": 256
    },
    "multi-qa-mpnet-base-dot-v1": {
        "name": "multi-qa-mpnet-base-dot-v1",
        "description": "Optimized for question-answering, 768 dimensions",
        "size": "420MB", 
        "max_seq_length": 512
    },
    "paraphrase-mpnet-base-v2": {
        "name": "paraphrase-mpnet-base-v2",
        "description": "Good for paraphrase detection, 768 dimensions",
        "size": "420MB",
        "max_seq_length": 512
    }
}


def initialize_embedding_model():
    global embedding_model
    if embedding_model is None:
        try:
            print(f"Loading embedding model: {current_model_name}")
            # Some models require trust_remote_code=True
            if current_model_name == "nomic-ai/nomic-embed-text-v1.5":
                print("Using trust_remote_code=True for nomic model")
                embedding_model = SentenceTransformer(current_model_name, trust_remote_code=True)
            else:
                embedding_model = SentenceTransformer(current_model_name)
            print(f"Successfully loaded model: {current_model_name}")
        except Exception as e:
            print(f"Error loading embedding model {current_model_name}: {str(e)}")
            print(f"Error type: {type(e).__name__}")
            # Fall back to default model if current model fails
            if current_model_name != "all-mpnet-base-v2":
                print("Falling back to default model: all-mpnet-base-v2")
                try:
                    embedding_model = SentenceTransformer("all-mpnet-base-v2")
                    print("Successfully loaded fallback model")
                except Exception as fallback_error:
                    print(f"Error loading fallback model: {str(fallback_error)}")
                    raise fallback_error
            else:
                raise e
    return embedding_model


def load_vector_store():
    global vector_store
    if vault_path:
        index_path = vault_path / "index.json"
        if index_path.exists():
            try:
                with open(index_path, "r") as f:
                    data = json.load(f)
                    vector_store = {k: np.array(v) for k, v in data.items()}
            except Exception:
                vector_store = {}
        else:
            vector_store = {}


def save_vector_store():
    if vault_path:
        index_path = vault_path / "index.json"
        try:
            data = {k: v.tolist() for k, v in vector_store.items()}
            with open(index_path, "w") as f:
                json.dump(data, f, indent=2)
        except Exception:
            pass


def split_into_paragraphs(content):
    paragraphs = []
    lines = content.split("\n")
    current_paragraph = []

    for line in lines:
        line = line.strip()
        if not line:
            if current_paragraph:
                paragraph_text = " ".join(current_paragraph)
                if (
                    len(paragraph_text.strip()) > 20
                ):  # Only include substantial paragraphs
                    paragraphs.append(paragraph_text)
                current_paragraph = []
        else:
            current_paragraph.append(line)

    if current_paragraph:
        paragraph_text = " ".join(current_paragraph)
        if len(paragraph_text.strip()) > 20:
            paragraphs.append(paragraph_text)

    return paragraphs


def update_file_embeddings(file_path, content):
    global vector_store
    model = initialize_embedding_model()

    paragraphs = split_into_paragraphs(content)

    # Remove old embeddings for this file
    keys_to_remove = [k for k in vector_store.keys() if k.startswith(f"{file_path}::")]
    for key in keys_to_remove:
        del vector_store[key]

    # Add new embeddings
    for i, paragraph in enumerate(paragraphs):
        if paragraph.strip():
            embedding = model.encode([paragraph])[0]
            vector_store[f"{file_path}::{i}"] = embedding

    save_vector_store()


def find_similar_content(query_text, current_file_path=None, limit=5):
    if not vector_store:
        print("Vector store is empty")
        return []

    try:
        print(f"Initializing embedding model for similarity search...")
        model = initialize_embedding_model()
        print(f"Encoding query text...")
        query_embedding = model.encode([query_text])[0]
        print(f"Query embedding shape: {query_embedding.shape}")

        similarities = []
        print(f"Comparing against {len(vector_store)} stored embeddings...")
        for key, embedding in vector_store.items():
            file_path = key.split("::")[0]
            if current_file_path and file_path == current_file_path:
                continue  # Skip current file

            try:
                similarity = cosine_similarity([query_embedding], [embedding])[0][0]
                similarities.append((key, similarity, file_path))
            except Exception as sim_error:
                print(f"Error computing similarity for {key}: {str(sim_error)}")
                continue

        # Sort by similarity and return top results
        similarities.sort(key=lambda x: x[1], reverse=True)
        print(f"Computed {len(similarities)} similarities, returning top {limit}")
        return similarities[:limit]
    except Exception as e:
        print(f"Error in find_similar_content: {str(e)}")
        print(f"Error type: {type(e).__name__}")
        import traceback
        traceback.print_exc()
        return []


@app.route("/")
def index():
    return send_from_directory("static", "index.html")


@app.route("/static/<path:filename>")
def serve_static(filename):
    return send_from_directory("static", filename)


@app.route("/api/set-vault", methods=["POST"])
def set_vault():
    global vault_path
    data = request.get_json()
    path = data.get("path")

    if not path or not os.path.exists(path):
        return jsonify({"error": "Invalid path"}), 400

    vault_path = Path(path)
    load_vector_store()
    return jsonify({"success": True, "path": str(vault_path)})


@app.route("/api/files", methods=["GET"])
def get_files():
    if not vault_path:
        return jsonify({"error": "No vault selected"}), 400

    def build_tree_structure():
        tree = {}

        for file_path in vault_path.rglob("*.md"):
            relative_path = file_path.relative_to(vault_path)
            parts = relative_path.parts

            current = tree
            for i, part in enumerate(parts[:-1]):
                if part not in current:
                    current[part] = {"type": "folder", "children": {}}
                current = current[part]["children"]

            current[parts[-1]] = {
                "type": "file",
                "path": str(relative_path),
                "full_path": str(file_path),
            }

        return tree

    def flatten_tree(tree, prefix=""):
        items = []
        for name, item in sorted(tree.items()):
            path = f"{prefix}/{name}" if prefix else name
            if item["type"] == "folder":
                items.append(
                    {
                        "name": name,
                        "type": "folder",
                        "path": path,
                        "level": len(path.split("/")) - 1,
                    }
                )
                items.extend(flatten_tree(item["children"], path))
            else:
                items.append(
                    {
                        "name": name,
                        "type": "file",
                        "path": item["path"],
                        "full_path": item["full_path"],
                        "level": len(path.split("/")) - 1,
                    }
                )
        return items

    tree = build_tree_structure()
    files = flatten_tree(tree)

    return jsonify(files)


@app.route("/api/file/<path:file_path>", methods=["GET"])
def get_file(file_path):
    if not vault_path:
        return jsonify({"error": "No vault selected"}), 400

    full_path = vault_path / file_path
    if not full_path.exists() or not str(full_path).endswith(".md"):
        return jsonify({"error": "File not found"}), 404

    try:
        content = full_path.read_text(encoding="utf-8")
        return jsonify({"content": content, "path": file_path})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/file/<path:file_path>", methods=["PUT"])
def save_file(file_path):
    if not vault_path:
        return jsonify({"error": "No vault selected"}), 400

    data = request.get_json()
    content = data.get("content", "")

    full_path = vault_path / file_path

    try:
        full_path.parent.mkdir(parents=True, exist_ok=True)
        full_path.write_text(content, encoding="utf-8")

        # Update embeddings for this file
        update_file_embeddings(file_path, content)

        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/file/<path:file_path>", methods=["DELETE"])
def delete_file(file_path):
    if not vault_path:
        return jsonify({"error": "No vault selected"}), 400

    full_path = vault_path / file_path
    if not full_path.exists():
        return jsonify({"error": "File not found"}), 404

    try:
        full_path.unlink()
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/move-file", methods=["POST"])
def move_file():
    if not vault_path:
        return jsonify({"error": "No vault selected"}), 400

    data = request.get_json()
    source_path = data.get("source")
    target_path = data.get("target")

    if not source_path or not target_path:
        return jsonify({"error": "Source and target paths required"}), 400

    source_full_path = vault_path / source_path
    target_full_path = vault_path / target_path

    if not source_full_path.exists():
        return jsonify({"error": "Source file not found"}), 404

    if target_full_path.exists():
        return jsonify({"error": "Target file already exists"}), 400

    try:
        target_full_path.parent.mkdir(parents=True, exist_ok=True)
        source_full_path.rename(target_full_path)
        return jsonify({"success": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/preview", methods=["POST"])
def preview_markdown():
    data = request.get_json()
    content = data.get("content", "")

    try:
        html = markdown.markdown(content, extensions=["fenced_code", "tables"])
        return jsonify({"html": html})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/similar", methods=["POST"])
def get_similar_content():
    if not vault_path:
        return jsonify({"error": "No vault selected"}), 400

    data = request.get_json()
    query = data.get("query", "")
    current_file = data.get("current_file")
    limit = data.get("limit", 5)

    if not query.strip():
        return jsonify({"similar": []})

    try:
        print(f"Finding similar content for query: {query[:50]}...")
        similarities = find_similar_content(query, current_file, limit)
        print(f"Found {len(similarities)} similar items")

        # Get snippet context for each similar item
        results = []
        for key, similarity, file_path in similarities:
            if similarity > 0.3:  # Only include reasonably similar content
                # Get the paragraph content
                paragraph_index = int(key.split("::")[1])
                try:
                    full_path = vault_path / file_path
                    if full_path.exists():
                        content = full_path.read_text(encoding="utf-8")
                        paragraphs = split_into_paragraphs(content)
                        if paragraph_index < len(paragraphs):
                            snippet = paragraphs[paragraph_index]
                            # Truncate if too long
                            if len(snippet) > 200:
                                snippet = snippet[:200] + "..."

                            results.append(
                                {
                                    "file_path": file_path,
                                    "similarity": float(similarity),
                                    "snippet": snippet,
                                    "paragraph_index": paragraph_index,
                                }
                            )
                except Exception as snippet_error:
                    print(f"Error processing snippet for {file_path}: {str(snippet_error)}")
                    continue

        print(f"Returning {len(results)} similar results")
        return jsonify({"similar": results})
    except Exception as e:
        print(f"Error in get_similar_content: {str(e)}")
        print(f"Error type: {type(e).__name__}")
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/api/reindex", methods=["POST"])
def reindex_vault():
    if not vault_path:
        return jsonify({"error": "No vault selected"}), 400

    try:
        global vector_store
        vector_store = {}

        # Process all markdown files
        processed = 0
        for file_path in vault_path.rglob("*.md"):
            relative_path = file_path.relative_to(vault_path)
            try:
                content = file_path.read_text(encoding="utf-8")
                update_file_embeddings(str(relative_path), content)
                processed += 1
            except Exception:
                continue

        return jsonify({"success": True, "processed": processed})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/models", methods=["GET"])
def get_available_models():
    models = list(AVAILABLE_MODELS.values())
    return jsonify({
        "models": models,
        "current_model": current_model_name
    })


@app.route("/api/models/current", methods=["POST"])
def set_current_model():
    global current_model_name, embedding_model
    
    data = request.get_json()
    model_name = data.get("model_name")
    
    if not model_name or model_name not in AVAILABLE_MODELS:
        return jsonify({"error": "Invalid model name"}), 400
    
    try:
        print(f"Switching from {current_model_name} to {model_name}")
        
        # Test if the new model can be loaded before switching
        old_model_name = current_model_name
        old_embedding_model = embedding_model
        
        current_model_name = model_name
        embedding_model = None  # Reset to force reload with new model
        
        # Try to initialize the new model
        test_model = initialize_embedding_model()
        print(f"Successfully tested new model: {model_name}")
        
        return jsonify({
            "success": True, 
            "current_model": current_model_name,
            "message": f"Switched to {model_name}. Reindex recommended."
        })
    except Exception as e:
        print(f"Error switching to model {model_name}: {str(e)}")
        # Revert to old model on error
        current_model_name = old_model_name
        embedding_model = old_embedding_model
        
        return jsonify({
            "error": f"Failed to switch to {model_name}: {str(e)}"
        }), 500


if __name__ == "__main__":
    app.run(debug=True, port=8000)
