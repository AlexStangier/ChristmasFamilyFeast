import os
import json
from flask import Flask, request, jsonify, send_from_directory
from google.cloud import storage
import logging

app = Flask(__name__)

import uuid
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
    # Always try to initialize Firestore
    db = firestore.Client(project=PROJECT_ID, database="christmas-planner")
    logging.info(f"Firestore initialized with project: {PROJECT_ID}")
except Exception as e:
    logging.error(f"Firestore init failed: {e}")

def migrate_old_data(old_data):
    """Migrates monolithic data to new collection structure."""
    if not db: return
    
    try:
        logging.info("Migrating old data to new structure...")
        batch = db.batch()
        
        # 1. Slots
        slots = old_data.get('slots', {})
        for key, slot_data in slots.items():
            batch.set(db.collection('slots').document(key), slot_data)
            
        # 2. Groceries
        batch.set(db.collection('lists').document('groceries'), {'items': old_data.get('groceries', [])})
        
        # 3. Settings
        batch.set(db.collection('config').document('settings'), old_data.get('settings', {}))
        
        # 4. Metadata
        new_version = str(uuid.uuid4())
        batch.set(db.collection('config').document('metadata'), {'version': new_version})
        
        batch.commit()
        logging.info("Migration complete.")
        return new_version
    except Exception as e:
        logging.error(f"Migration failed: {e}")
        return None

def read_data(client_etag=None):
    """
    Reads JSON from Firestore. 
    Returns (data, etag, not_modified_bool).
    If client_etag matches current version, data is None and not_modified is True.
    """
    if not db:
        logging.error("Database not initialized")
        return {}, "0", False

    try:
        # 1. Check Metadata (Cost: 1 read)
        meta_ref = db.collection('config').document('metadata')
        meta_doc = meta_ref.get()
        
        current_version = "0"
        if meta_doc.exists:
            current_version = meta_doc.get('version')
        else:
            # CHECK MIGRATION: If metadata doesn't exist, check for old monolithic doc
            old_doc_ref = db.collection('config').document('planner')
            old_doc = old_doc_ref.get()
            if old_doc.exists:
                old_data = old_doc.to_dict()
                migrated_version = migrate_old_data(old_data)
                if migrated_version:
                    current_version = migrated_version
                    # Fall through to read the newly migrated data
            else:
                # No data at all, return empty
                return {}, "0", False

        # 2. Check ETag optimization
        if client_etag and client_etag == current_version:
            return None, current_version, True

        # 3. Fetch Full Data (Cost: N+2 reads)
        # Fetch Slots
        slots_ref = db.collection('slots')
        slots = {}
        for doc in slots_ref.stream():
            slots[doc.id] = doc.to_dict()

        # Fetch Groceries
        groc_doc = db.collection('lists').document('groceries').get()
        groceries = groc_doc.get('items') if groc_doc.exists else []

        # Fetch Activity Log
        act_doc = db.collection('lists').document('activity').get()
        activity = act_doc.get('items') if act_doc.exists else []

        # Fetch Settings
        sett_doc = db.collection('config').document('settings').get()
        settings = sett_doc.to_dict() if sett_doc.exists else {}

        full_data = {
            "slots": slots,
            "groceries": groceries,
            "activity": activity,
            "settings": settings
        }
        
        return full_data, current_version, False

    except Exception as e:
        logging.error(f"Firestore Read Error: {e}")
        return {}, None, False

def write_data(data, expected_etag=None):
    """Writes JSON to Firestore using Batch. Returns (success, error_or_version)."""
    if not db:
        logging.error("Database not initialized")
        return False, "error"

    try:
        meta_ref = db.collection('config').document('metadata')
        
        if expected_etag:
            meta_doc = meta_ref.get()
            current_version = meta_doc.get('version') if meta_doc.exists else "0"
            if current_version != expected_etag:
                return False, "conflict"

        batch = db.batch()
        
        # Slots
        slots = data.get('slots', {})
        
        # 1. Handle Deletions: Get existing slots and delete those not in the new payload
        try:
            existing_slots = db.collection('slots').list_documents()
            for doc in existing_slots:
                if doc.id not in slots:
                    batch.delete(doc)
        except Exception as list_err:
             logging.warning(f"Failed to list documents for deletion cleanup: {list_err}")

        # 2. Update/Create provided slots
        for key, slot_data in slots.items():
            doc_ref = db.collection('slots').document(key)
            batch.set(doc_ref, slot_data)
            
        # Groceries
        batch.set(db.collection('lists').document('groceries'), {'items': data.get('groceries', [])})

        # Activity Log
        batch.set(db.collection('lists').document('activity'), {'items': data.get('activity', [])})
        
        # Settings
        batch.set(db.collection('config').document('settings'), data.get('settings', {}))
        
        # Metadata
        new_version = str(uuid.uuid4())
        batch.set(meta_ref, {'version': new_version})
        
        batch.commit()
        return True, new_version
    except Exception as e:
        logging.error(f"Firestore Write Error: {e}")
        return False, "error"

@app.route('/')
def index():
    """Serves the single-page Vue app."""
    return send_from_directory('.', 'index.html')

@app.route('/api/data', methods=['GET'])
def get_data():
    """Endpoint for frontend polling."""
    client_etag = request.headers.get('If-None-Match')
    
    data, etag, not_modified = read_data(client_etag)
    
    if not_modified:
        return '', 304
    
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
    
    success, result = write_data(data, expected_etag=if_match)
    
    if success:
        # result is new_version
        response = jsonify({"status": "success"})
        response.headers['ETag'] = result
        return response
    elif result == "conflict":
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
        1. A REAL, WORKING URL to an authentic recipe from a popular German recipe website.
        2. A list of main ingredients needed for a grocery list (in German), calculated for 10 people.
        3. A brief summary of cooking instructions (3-5 steps) in German.
        4. An estimate of calories per serving (kcal) as an integer.
        
        Return ONLY valid JSON in this format:
        {{
            "url": "https://www.chefkoch.de/rezepte/...",
            "ingredients": ["Ingredient 1", "Ingredient 2"],
            "instructions": ["Step 1...", "Step 2..."],
            "calories": 650
        }}
        
        If no real recipe URL can be found, use null for url but still estimate calories/ingredients:
        {{
            "url": null,
            "ingredients": ["Ingredient 1", "Ingredient 2"],
            "instructions": ["Step 1...", "Step 2..."],
            "calories": 500
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