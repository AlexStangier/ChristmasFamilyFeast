# 🎄 The Family Feast - Christmas Planner

A collaborative web application for planning the family Christmas meals. Built with Vue.js and Flask, designed to run on Google Cloud.

## ✨ Features

- **Role-Based Access**: Login as 'Organisator', 'Eltern', 'Hamburg', or 'Konstanz'.
- **Collaborative Planning**: Suggest dishes for Lunch, Dinner, and Dessert for the Christmas days (Dec 23 - Dec 27).
- **Voting System**: Vote for your favorite proposals with visual ranking (#1 badge for leading dishes).
- **Approval Workflow**: The 'Organisator' can approve dishes, which locks the slot.
- **Robust Real-time Sync**:
    - **Firestore Backend**: Data is persisted reliably using Google Cloud Firestore.
    - **Optimistic Locking**: Prevents data overwrites with versioning (ETags).
    - **Smart Merging**: Automatically merges changes from different users without interrupting your workflow.
- **AI-Powered Features**:
    - **Smart Search**: AI-powered dish suggestions when proposing meals.
    - **Recipe Preview**: See ingredients and cooking steps before adding a dish.
    - **Recipe Lookup**: Automatically fetch authentic recipes with detailed instructions.
    - **Smart Grocery List**: Auto-generates shopping list for approved dishes.
    - **AI Categorization**: Sorts your grocery list into categories (e.g., 🍎 Fruit & Veg, 🥛 Dairy) for easy shopping.
- **Advanced Tools**:
    - **Interactive Copy Mode**: Easily copy meal proposals to other compatible slots (e.g., leftovers for lunch).
    - **Organizer Settings**: Set a PIN code for the Organizer role and reset the event data if needed.
    - **Export**: Copy a beautifully formatted, categorized shopping list to your clipboard.
- **Modern UI**:
    - **Proposal Modal**: Intuitive search interface with AI suggestions and live preview.
    - **Recipe Modal**: Full recipe view with ingredients, instructions, and original source link.
    - **Mobile First**: Responsive design with festive animations and easy navigation.

## 🛠️ Tech Stack

- **Frontend**: Vue 3 (Composition API), Tailwind CSS, Phosphor Icons (all via CDN for simplicity).
- **Backend**: Python Flask.
- **AI**: Google Vertex AI (Gemini 1.5 Flash) with service account authentication.
- **Storage**: Google Cloud Firestore (Native Mode).
- **Infrastructure**: Docker, Google Cloud Run, Terraform.

## 🚀 Getting Started

### Prerequisites

- Python 3.11+
- Google Cloud Project (for cloud deployment)
- **Firestore** database created in Native mode.
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
    ```

4.  **Authenticate with Google Cloud** (for Vertex AI & Firestore):
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
- Google Cloud Firestore Database (Native)
- Google Cloud Storage Bucket (for potential future assets)
- Google Cloud Run Service
- IAM Service Accounts with Vertex AI, Datastore, and Storage permissions

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
4.  **Copy Meals**: Click the copy icon (two squares) on a proposal. The interface highlights valid target slots. Click a target day to paste the meal there.
5.  **Approve (Organizer)**: Click "Genehmigen" to finalize a dish. Ingredients are automatically added to the grocery list.
6.  **Settings (Organizer)**: Click the burger menu in the header to set a login PIN or reset the event data.
7.  **Shop**: Use the "Einkaufsliste" at the bottom. Click "Exportieren" to get an AI-sorted list for WhatsApp.

## 🔒 Permissions

- **Delete**: Only the Creator of a proposal or the Organizer can delete it.
- **Approve**: Only the Organizer can approve dishes.
- **Withdraw**: Creators can withdraw their proposals from the recipe modal (before approval).
- **Signature Dish**: The Christmas Eve Dinner is locked as "Königsberger Klopse" (Tradition!).
- **Organizer PIN**: Optional PIN protection for the Organizer role to prevent accidental admin actions.

## 🔑 Authentication

The application uses **Vertex AI** and **Firestore** with service account authentication:
- Cloud Run service account has `roles/aiplatform.user` and `roles/datastore.user` permissions.
- No API key management required in production.
- Automatic authentication via Google Cloud IAM.

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
    - **Kopieren**: Klicke auf das Kopieren-Symbol (zwei Blätter). Die anderen Tage leuchten auf. Klicke einfach auf einen Tag, um das Gericht dorthin zu kopieren (z.B. Resteessen).

4.  **Entscheidung (Nur Organisator)**:
    - Der Organisator hat den Button **"Genehmigen"**.
    - Ein genehmigtes Gericht wird grün markiert und der Slot ist fixiert.
    - **Automatisch**: Die Zutaten landen sofort auf der Einkaufsliste!

5.  **Einkaufsliste**:
    - Die Liste füllt sich automatisch basierend auf den genehmigten Gerichten.
    - **Export**: Klicke auf "Exportieren". Die AI sortiert deine Liste automatisch in Kategorien (🍎 Obst & Gemüse, 🥛 Kühlregal etc.). Perfekt zum Kopieren für WhatsApp!
    - **Zutaten laden**: Falls bei einem Gericht "(Zutaten prüfen)" steht, klicke auf den Pfeil-Button daneben, um die Zutaten per AI nachzuladen.

6.  **Einstellungen & Sicherheit (Nur Organisator)**:
    - Oben im Header findest du ein **Menü-Symbol** (Burger-Menü).
    - Dort kannst du eine **PIN festlegen**, damit nur du dich als Organisator einloggen kannst.
    - **Reset**: Hier kannst du auch das gesamte Event zurücksetzen, um für nächstes Jahr neu zu starten.

---
*Made with 🎄 for the family*
