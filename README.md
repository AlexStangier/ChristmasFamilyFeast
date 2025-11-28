# 🎄 The Family Feast - Christmas Planner

A collaborative web application for planning the family Christmas meals. Built with Vue.js and Flask, designed to run on Google Cloud.

## ✨ Features

- **Role-Based Access**: Login as 'Organisator', 'Eltern', 'Hamburg', or 'Konstanz'.
- **Collaborative Planning**: Suggest dishes for Lunch, Dinner, and Dessert for the Christmas days (Dec 23 - Dec 27).
- **Voting System**: Vote for your favorite proposals.
- **Approval Workflow**: The 'Organisator' can approve dishes, which locks the slot.
- **AI-Powered**:
    - **Recipe Lookup**: Find authentic recipes and ingredients using Google Gemini AI.
    - **Grocery List**: Automatically generates a grocery list for approved dishes (calculated for 7 adults & 3 children).
- **Real-time Sync**: Updates are synchronized across all users (polling-based).
- **Mobile First**: Responsive design with a festive UI.

## 🛠️ Tech Stack

- **Frontend**: Vue 3 (Composition API), Tailwind CSS, Phosphor Icons (all via CDN for simplicity).
- **Backend**: Python Flask.
- **AI**: Google Gemini Pro (`google-generativeai`).
- **Storage**: Google Cloud Storage (JSON blob) or local file fallback.
- **Infrastructure**: Docker, Google Cloud Run, Terraform.

## 🚀 Getting Started

### Prerequisites

- Python 3.11+
- Google Cloud Project (optional, for cloud storage/AI)
- Gemini API Key (for AI features)

### Local Development

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/AlexStangier/ChristmasFamilyFeast.git
    cd ChristmasFamilyFeast
    ```

2.  **Install dependencies**:
    ```bash
    pip install -r requirements.txt
    ```

3.  **Set Environment Variables**:
    ```bash
    export GEMINI_API_KEY="your_api_key_here"
    # Optional: Set BUCKET_NAME to use GCS instead of local file
    # export BUCKET_NAME="your-bucket-name"
    ```

4.  **Run the application**:
    ```bash
    python main.py
    ```
    Visit `http://localhost:8080` in your browser.

## ☁️ Deployment

The project is containerized and ready for Google Cloud Run.

### Using Cloud Build

```bash
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/christmas-planner .
```

### Infrastructure as Code (Terraform)

The `infrastructure.tf` file contains the Terraform configuration to provision:
- Google Cloud Storage Bucket
- Google Cloud Run Service
- IAM Service Accounts

## 📝 Usage Guide

1.  **Select a Role**: Choose your family branch/role.
2.  **Propose**: Click "Vorschlagen" in any open slot.
3.  **Vote**: Click the heart icon to vote for proposals.
4.  **Find Recipe**: Click the magic wand to let AI find a recipe and ingredients.
5.  **Approve (Organizer)**: Click "Genehmigen" to finalize a dish. Ingredients will be added to the grocery list.
6.  **Shop**: Use the "Einkaufsliste" at the bottom for shopping.

## 🔒 Permissions

- **Delete**: Only the Creator of a proposal or the Organizer can delete it.
- **Approve**: Only the Organizer can approve dishes.
- **Signature Dish**: The Christmas Eve Dinner is locked as "Königsberger Klopse" (Tradition!).

---
*Made with 🎄 for the family.*
