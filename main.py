import os
import json
from flask import Flask, request, jsonify, send_from_directory
from google.cloud import storage
import logging

app = Flask(__name__)

# -- Configuration --
# Set BUCKET_NAME in your Cloud Run environment variables
BUCKET_NAME = os.environ.get('BUCKET_NAME')
BLOB_NAME = 'christmas_planner_data.json'
LOCAL_FILE = 'local_data.json'

logging.basicConfig(level=logging.INFO)

def read_data():
    """Reads JSON from GCS or local file."""
    if BUCKET_NAME:
        try:
            storage_client = storage.Client()
            bucket = storage_client.bucket(BUCKET_NAME)
            blob = bucket.blob(BLOB_NAME)
            if blob.exists():
                return json.loads(blob.download_as_string())
            return {} # Return empty dict if file doesn't exist yet
        except Exception as e:
            logging.error(f"GCS Read Error: {e}")
            return {}
    else:
        # Local Fallback
        if os.path.exists(LOCAL_FILE):
            with open(LOCAL_FILE, 'r') as f:
                return json.load(f)
        return {}

def write_data(data):
    """Writes JSON to GCS or local file."""
    if BUCKET_NAME:
        try:
            storage_client = storage.Client()
            bucket = storage_client.bucket(BUCKET_NAME)
            blob = bucket.blob(BLOB_NAME)
            blob.upload_from_string(
                json.dumps(data),
                content_type='application/json'
            )
            return True
        except Exception as e:
            logging.error(f"GCS Write Error: {e}")
            return False
    else:
        # Local Fallback
        with open(LOCAL_FILE, 'w') as f:
            json.dump(data, f, indent=2)
        return True

@app.route('/')
def index():
    """Serves the single-page Vue app."""
    return send_from_directory('.', 'index.html')

@app.route('/api/data', methods=['GET'])
def get_data():
    """Endpoint for frontend polling."""
    data = read_data()
    return jsonify(data)

@app.route('/api/data', methods=['POST'])
def save_data():
    """Endpoint for frontend auto-save."""
    data = request.json
    if data is None:
        return jsonify({"error": "No JSON provided"}), 400
    
    success = write_data(data)
    if success:
        return jsonify({"status": "success"})
    else:
        return jsonify({"status": "error"}), 500

if __name__ == "__main__":
    # Cloud Run injects the PORT environment variable
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)