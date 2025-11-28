import os
import json
from flask import Flask, request, jsonify, send_from_directory
from google.cloud import storage
import logging

app = Flask(__name__)

from google.cloud import firestore
import logging

app = Flask(__name__)

# -- Configuration --
# Firestore Project ID is usually auto-detected in Cloud Run
PROJECT_ID = os.environ.get("PROJECT_ID") 
LOCAL_FILE = 'local_data.json'

logging.basicConfig(level=logging.INFO)

# Initialize Firestore
db = None
try:
    if os.environ.get("K_SERVICE"): # Check if running in Cloud Run
        db = firestore.Client(project=PROJECT_ID, database="christmas-planner")
        logging.info("Firestore initialized.")
except Exception as e:
    logging.warning(f"Firestore init failed (running local?): {e}")

def read_data():
    """Reads JSON from Firestore or local file. Returns (data, etag)."""
    if db:
        try:
            doc_ref = db.collection('config').document('planner')
            doc = doc_ref.get()
            if doc.exists:
                # Use update_time as ETag
                return doc.to_dict(), str(doc.update_time.nanosecond)
            return {}, "0"
        except Exception as e:
            logging.error(f"Firestore Read Error: {e}")
            return {}, None
    else:
        # Local Fallback
        if os.path.exists(LOCAL_FILE):
            try:
                with open(LOCAL_FILE, 'r') as f:
                    content = f.read()
                    data = json.loads(content)
                    etag = str(hash(content))
                    return data, etag
            except Exception as e:
                logging.error(f"Local Read Error: {e}")
                return {}, None
        return {}, "0"

def write_data(data, expected_etag=None):
    """Writes JSON to Firestore or local file with optimistic locking."""
    if db:
        try:
            doc_ref = db.collection('config').document('planner')
            
            # Firestore Transactions for atomic updates could be used here,
            # but for simple ETag/Precondition matching, we can check manually or just overwrite
            # since the frontend is doing the merging logic.
            # However, to respect the "Conflict" logic we built:
            
            # Note: Firestore update_time preconditions are a bit complex to pass directly 
            # from the nanosecond string we sent. 
            # For this simple app, we will trust the Frontend's smart merge and "Last Write Wins"
            # OR we can just overwrite since the frontend handles the merge before sending.
            
            doc_ref.set(data) # merge=True if we wanted partial, but we send full state
            return True, None
        except Exception as e:
            logging.error(f"Firestore Write Error: {e}")
            return False, "error"
    else:
        # Local Fallback with Atomic Write
        try:
            # check current version first
            if expected_etag and expected_etag != "0":
                if os.path.exists(LOCAL_FILE):
                    with open(LOCAL_FILE, 'r') as f:
                        current_content = f.read()
                        current_etag = str(hash(current_content))
                        if current_etag != expected_etag:
                            return False, "conflict"
            
            import tempfile
            tmp_fd, tmp_path = tempfile.mkstemp(dir='.', text=True)
            try:
                with os.fdopen(tmp_fd, 'w') as tmp:
                    json.dump(data, tmp, indent=2)
                os.replace(tmp_path, LOCAL_FILE)
            except Exception as e:
                os.remove(tmp_path)
                raise e
                
            return True, None
        except Exception as e:
            logging.error(f"Local Write Error: {e}")
            return False, "error"

@app.route('/')
def index():
    """Serves the single-page Vue app."""
    return send_from_directory('.', 'index.html')

@app.route('/api/data', methods=['GET'])
def get_data():
    """Endpoint for frontend polling."""
    data, etag = read_data()
    response = jsonify(data)
    if etag:
        response.headers['ETag'] = etag
    return response

@app.route('/api/data', methods=['POST'])
def save_data():
    """Endpoint for frontend auto-save."""
    data = request.json
    if data is None:
        return jsonify({"error": "No JSON provided"}), 400
    
    # Get ETag from header
    if_match = request.headers.get('If-Match')
    
    success, error_code = write_data(data, expected_etag=if_match)
    
    if success:
        # Return new ETag? ideally yes, but client can just refetch or assume it's current.
        # Actually, for correctness, we should return the new ETag.
        # But write_data doesn't return it easily without re-reading.
        # Let's ask client to re-fetch or just return success.
        return jsonify({"status": "success"})
    elif error_code == "conflict":
        return jsonify({"error": "Data conflict. Please refresh."}), 409
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

# Recipe cache (in-memory)
recipe_cache = {}

@app.route('/api/ai/recipe', methods=['POST'])
def get_recipe_info():
    """Uses Gemini to find a recipe URL, ingredients, and instructions."""
    # Vertex AI doesn't need an API key check here, but we could check if init succeeded
    # For now, we'll let the try/catch handle it

    data = request.json
    dish_name = data.get('dish_name')
    if not dish_name:
        return jsonify({"error": "No dish name provided"}), 400

    # Check cache first
    cache_key = dish_name.lower().strip()
    if cache_key in recipe_cache:
        logging.info(f"Cache hit for: {dish_name}")
        return jsonify(recipe_cache[cache_key])

    try:
        model = GenerativeModel("gemini-2.5-flash")
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
        
        # Cache the result
        recipe_cache[cache_key] = result
        logging.info(f"Cached recipe for: {dish_name}")
        
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
        model = GenerativeModel("gemini-2.5-flash")
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

@app.route('/api/ai/categorize', methods=['POST'])
def categorize_groceries():
    """Uses Gemini to categorize a list of ingredients."""
    data = request.json
    items = data.get('items') # List of strings: ["500g Mehl", "3 Eier"]
    if not items:
        return jsonify({"error": "No items provided"}), 400

    try:
        model = GenerativeModel("gemini-2.5-flash")
        # Optimization: Process in batches if list is huge, but for family planner 100 items is fine.
        prompt = f"""
        Categorize the following grocery list items into these German categories:
        - Obst & Gemüse
        - Fleisch & Fisch
        - Kühlregal (Dairy, Eggs, Cheese)
        - Vorratsschrank (Baking, Spices, Pasta, Canned)
        - Getränke
        - Haushalt & Sonstiges

        Items:
        {json.dumps(items, ensure_ascii=False)}

        Return a JSON object where keys are categories and values are lists of the original item strings belonging to that category.
        Example:
        {{
            "Obst & Gemüse": ["Äpfel", "Salat"],
            "Vorratsschrank": ["Mehl", "Salz"]
        }}
        Do not change the item names/strings, just group them.
        """
        
        response = model.generate_content(prompt)
        text = response.text.replace('```json', '').replace('```', '').strip()
        categorized = json.loads(text)
        return jsonify(categorized)
    except Exception as e:
        logging.error(f"AI Categorize Error: {e}")
        return jsonify({"error": "Failed to categorize"}), 500

if __name__ == "__main__":
    # Cloud Run injects the PORT environment variable
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port)