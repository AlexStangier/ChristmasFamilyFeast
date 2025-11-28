# 🎄 The Family Feast - Christmas Planner

A collaborative web application for planning the family Christmas meals. Built with Vue.js and Flask, designed to run on Google Cloud.

## ✨ Features

- **Role-Based Access**: Login as 'Organisator', 'Eltern', 'Hamburg', or 'Konstanz'.
- **Collaborative Planning**: Suggest dishes for Lunch, Dinner, and Dessert for the Christmas days (Dec 23 - Dec 27).
- **Voting System**: Vote for your favorite proposals with visual ranking (#1 badge for leading dishes).
- **Approval Workflow**: The 'Organisator' can approve dishes, which locks the slot.
- **AI-Powered Features**:
    - **Smart Search**: AI-powered dish suggestions when proposing meals.
    - **Recipe Preview**: See ingredients and cooking steps before adding a dish.
    - **Recipe Lookup**: Automatically fetch authentic recipes with detailed instructions.
    - **Smart Grocery List**: Auto-generates shopping list for approved dishes (calculated for 7 adults & 3 children).
    - **Dynamic Updates**: Grocery list automatically syncs when meals are approved or deleted.
- **Modern UI**:
    - **Proposal Modal**: Intuitive search interface with AI suggestions and live preview.
    - **Recipe Modal**: Full recipe view with ingredients, instructions, and original source link.
    - **Withdraw Option**: Creators can withdraw their proposals before approval.
- **Real-time Sync**: Updates are synchronized across all users (polling-based).
- **Mobile First**: Responsive design with a festive UI.

## 🛠️ Tech Stack

- **Frontend**: Vue 3 (Composition API), Tailwind CSS, Phosphor Icons (all via CDN for simplicity).
- **Backend**: Python Flask.
- **AI**: Google Vertex AI (Gemini 1.5 Flash) with service account authentication.
- **Storage**: Google Cloud Storage (JSON blob) or local file fallback.
- **Infrastructure**: Docker, Google Cloud Run, Terraform.

## 🚀 Getting Started

### Prerequisites

- Python 3.11+
- Google Cloud Project (for cloud deployment)
- gcloud CLI configured

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
    export PROJECT_ID="your-gcp-project-id"
    export REGION="europe-west1"
    # Optional: Set BUCKET_NAME to use GCS instead of local file
    # export BUCKET_NAME="your-bucket-name"
    ```

4.  **Authenticate with Google Cloud** (for Vertex AI):
    ```bash
    gcloud auth application-default login
    ```

5.  **Run the application**:
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
- IAM Service Accounts with Vertex AI and Storage permissions

Deploy with:
```bash
terraform init
terraform apply
```

## 📝 Usage Guide

1.  **Select a Role**: Choose your family branch/role.
2.  **Propose a Dish**: 
    - Click "Vorschlagen" to open the proposal modal.
    - Type to search for AI-suggested dishes.
    - View preview of ingredients and cooking steps.
    - Click to add your selection.
3.  **Vote**: Click the heart icon to vote for proposals.
4.  **View Recipes**: Click "Rezept ansehen" to see full recipe details in a modal.
5.  **Approve (Organizer)**: Click "Genehmigen" to finalize a dish. Ingredients are automatically added to the grocery list.
6.  **Manage Proposals**: Delete your own proposals or any proposal as Organizer.
7.  **Shop**: Use the "Einkaufsliste" at the bottom - it updates automatically as meals are approved/deleted.

## 🔒 Permissions

- **Delete**: Only the Creator of a proposal or the Organizer can delete it.
- **Approve**: Only the Organizer can approve dishes.
- **Withdraw**: Creators can withdraw their proposals from the recipe modal (before approval).
- **Signature Dish**: The Christmas Eve Dinner is locked as "Königsberger Klopse" (Tradition!).

## 🔑 Authentication

The application uses **Vertex AI** with service account authentication instead of API keys:
- Cloud Run service account has `roles/aiplatform.user` permission
- No API key management required in production
- Automatic authentication via Google Cloud IAM

## 📖 Benutzerhandbuch (Kurzanleitung)

Willkommen beim **Weihnachts-Essensplaner**! So nutzt du die App:

1.  **Anmeldung**:
    - Wähle beim Start deine Rolle (z.B. "Eltern", "Hamburg") aus.
    - Oben rechts kannst du dich jederzeit ab- oder ummelden.

2.  **Gerichte vorschlagen**:
    - Klicke in einem freien Slot auf **"Vorschlagen"**.
    - Tippe den Namen des Gerichts ein. Die **AI** macht dir Vorschläge.
    - Wähle ein Gericht aus der Liste, um eine **Vorschau** (Zutaten & Rezept) zu sehen.
    - Klicke auf **Hinzufügen**, um es zur Abstimmung zu stellen.

3.  **Abstimmung & Planung**:
    - Klicke auf das **Herz-Symbol**, um für ein Gericht zu stimmen.
    - Das Gericht mit den meisten Stimmen erhält eine kleine Krone (#1).
    - **Kopieren**: Mit dem Kopieren-Button (zwei Blätter) kannst du Gerichte einfach auf andere Tage übertragen (z.B. Resteessen am Mittag).

4.  **Entscheidung (Nur Organisator)**:
    - Der Organisator hat den Button **"Genehmigen"**.
    - Ein genehmigtes Gericht wird grün markiert und der Slot ist fixiert.
    - **Automatisch**: Die Zutaten landen sofort auf der Einkaufsliste!

5.  **Einkaufsliste**:
    - Die Liste füllt sich automatisch basierend auf den genehmigten Gerichten.
    - **Export**: Klicke auf "Exportieren", um eine sortierte Liste (nach Kategorien wie 🍎 Obst & Gemüse) zu erhalten, die du einfach kopieren und per WhatsApp teilen kannst.
    - **Zutaten laden**: Falls bei einem Gericht "(Zutaten prüfen)" steht, klicke auf den Pfeil-Button daneben, um die Zutaten per AI nachzuladen.

---
*Made with 🎄 for the family*
