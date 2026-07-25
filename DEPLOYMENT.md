# Deployment Guide: Sitetru

This application is built with a React frontend (Vite) and an optional Express backend (if configured). It uses Firebase for its database and authentication.

## 1. Hosting Options

### A. Deploying to Cloud Run (Recommended)

Since this app is currently running in a containerized environment, Cloud Run is the most direct deployment path.

1.  **Containerize**: The app already has a `package.json` and build scripts.
2.  **Build and Push**: Use Google Cloud Build to build the image and push it to Artifact Registry.
3.  **Deploy**: Create a Cloud Run service using the pushed image.
4.  **Environment Variables**: Ensure you set the following in the Cloud Run configuration:
    - `GEMINI_API_KEY`: Your Google AI SDK key.
    - `VITE_FIREBASE_API_KEY`, etc. (if you prefer environment-based config).

### B. Static Hosting (Frontend Only)

If your app doesn't use a custom server (Express), you can deploy it as a static site.

1.  **Build**: Run `npm run build`.
2.  **Output**: The static files will be in the `dist/` directory.
3.  **Upload**: Upload the `dist/` contents to:
    - Firebase Hosting
    - Vercel
    - Netlify
    - AWS S3 / CloudFront

## 2. Firebase Production Setup

Before moving to production:

1.  **Provision Production Firebase Project**: Create a new project in the [Firebase Console](https://console.firebase.google.com/).
2.  **Update Config**: Replace the contents of `firebase-applet-config.json` with your production project's web configuration.
3.  **Deploy Security Rules**:
    - Ensure your `firestore.rules` are hardened.
    - Run `firebase deploy --only firestore:rules` using the Firebase CLI.
4.  **Enable Authentication**: Enable "Google Login" in the Firebase Auth console and add your production domain to the "Authorized domains" list.

## 3. Environment Variables

Create a `.env` file in your production environment (or set them in your CI/CD provider):

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
GEMINI_API_KEY=your_gemini_key
```

## 4. CI/CD Pipeline

For professional deployment, consider using GitHub Actions:

1.  **Trigger**: On push to `main`.
2.  **Build**: `npm install` and `npm run build`.
3.  **Deploy**: Use the Firebase Hosting Action or a Cloud Run Deploy Action.

---
*Note: Sitetru is designed as a secure, full-stack application. Always ensure your Firebase rules are strictly validated to protect user data.*
