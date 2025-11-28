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

import vertexai
from vertexai.preview.generative_models import GenerativeModel

# Initialize Vertex AI
PROJECT_ID = os.environ.get("PROJECT_ID")
REGION = os.environ.get("REGION")

if PROJECT_ID and REGION:
    try:
        vertexai.init(project=PROJECT_ID, location=REGION)
        logging.info(f"Vertex AI initialized for {PROJECT_ID} in {REGION}")
    except Exception as e:
        logging.error(f"Failed to initialize Vertex AI: {e}")

@app.route('/api/ai/recipe', methods=['POST'])
def get_recipe_info():
    """Uses Gemini to find a recipe URL, ingredients, and instructions."""
    # Vertex AI doesn't need an API key check here, but we could check if init succeeded
    # For now, we'll let the try/catch handle it

    data = request.json
    dish_name = data.get('dish_name')
    if not dish_name:
        return jsonify({"error": "No dish name provided"}), 400

    try:
        model = GenerativeModel("gemini-1.5-flash")
        prompt = f"""
        For the dish "{dish_name}", please provide:
        1. A REAL, WORKING URL to an authentic recipe from a popular German recipe website (e.g., chefkoch.de, essen-und-trinken.de, lecker.de, küchengötter.de).
           DO NOT make up URLs. Only provide URLs that actually exist.
           If you cannot find a real URL, return null for the url field.
        2. A list of main ingredients needed for a grocery list (in German), calculated for 10 people (7 adults, 3 children).
        3. A brief summary of cooking instructions (3-5 steps) in German.
        
        Return ONLY valid JSON in this format:
        {{
            "url": "https://www.chefkoch.de/rezepte/...",
            "ingredients": ["Ingredient 1", "Ingredient 2"],
            "instructions": ["Step 1...", "Step 2..."]
        }}
        
        If no real recipe URL can be found, use null:
        {{
            "url": null,
            "ingredients": ["Ingredient 1", "Ingredient 2"],
            "instructions": ["Step 1...", "Step 2..."]
        }}
        """
        response = model.generate_content(prompt)
        text = response.text.replace('```json', '').replace('```', '').strip()
        result = json.loads(text)
        return jsonify(result)
    except Exception as e:
        logging.error(f"AI Error: {e}")
        return jsonify({"error": "Failed to fetch recipe info"}), 500

@app.route('/api/ai/suggest', methods=['POST'])
def suggest_dishes():
    """Uses Gemini to suggest dishes based on a query."""
    
    data = request.json
    query = data.get('query')
    if not query:
        return jsonify({"error": "No query provided"}), 400

    try:
        model = GenerativeModel("gemini-1.5-flash")
        prompt = f"""
        For the search term "{query}", suggest dishes in German.
        ALWAYS include the exact search term as the first suggestion if it's a valid dish name.
        Then add 4-5 related or similar dishes.
        
        Return ONLY a JSON array of strings, e.g.: ["Tiramisu", "Tiramisu mit Erdbeeren", "Panna Cotta"]
        """
        response = model.generate_content(prompt)
        text = response.text.replace('```json', '').replace('```', '').strip()
        suggestions = json.loads(text)
        return jsonify({"suggestions": suggestions})
    except Exception as e:
        logging.error(f"AI Suggest Error: {e}")
        return jsonify({"error": "Failed to fetch suggestions"}), 500

if __name__ == "__main__":
    # Cloud Run injects the PORT environment variable
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)