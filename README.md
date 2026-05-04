# My Story Site — Firebase Edition

Story posting site with rich-text admin editor.
Backend: Firebase Cloud Functions (Express) + Firestore
Frontend: Firebase Hosting (static HTML)

---

## ⚠️ Before you start

Firebase Cloud Functions requires the **Blaze (pay-as-you-go)** plan.
For a small personal site the cost is essentially $0, but you do need a billing account linked.

---

## Step 1 — Install tools

```bash
npm install -g firebase-tools
```

Then log in:
```bash
firebase login
```

---

## Step 2 — Create a Firebase project

1. Go to https://console.firebase.google.com
2. Click **Add project** → give it a name → click through
3. In the left sidebar go to **Firestore Database** → **Create database**
   - Choose **Production mode**
   - Pick a region (e.g. `us-central`)
4. Upgrade to **Blaze plan**: click the Spark badge → select Blaze → link a billing account

---

## Step 3 — Connect this project to Firebase

Open `.firebaserc` and replace `YOUR-FIREBASE-PROJECT-ID` with your actual project ID
(find it in the Firebase console URL or project settings).

Or run:
```bash
firebase use --add
```
and select your project.

---

## Step 4 — Change your admin settings

Open `functions/index.js` and edit lines 12–15:

```js
const ADMIN_SLUG = "my-secret-admin-2025";  // ← your secret URL
const ADMIN_PASSWORD = "coltdamian123";      // ← your password
```

---

## Step 5 — Install dependencies

```bash
cd functions
npm install
cd ..
```

---

## Step 6 — Test locally with emulators

```bash
firebase emulators:start
```

Open:
- Site: http://localhost:5000
- Admin: http://localhost:5000/my-secret-admin-2025
- Emulator UI: http://localhost:4000

---

## Step 7 — Deploy to Firebase

```bash
firebase deploy
```

After a minute you'll get a URL like:
```
https://your-project-id.web.app
```

Admin panel will be at:
```
https://your-project-id.web.app/my-secret-admin-2025
```

---

## File structure

```
my-story/
├── firebase.json          ← routing + hosting config
├── firestore.rules        ← database security rules
├── .firebaserc            ← your project ID goes here
├── functions/
│   ├── index.js           ← Express backend (API + admin pages)
│   └── package.json
└── public/
    ├── index.html         ← reader: chapter list
    ├── chapter.html       ← reader: chapter view
    └── css/
        └── style.css
```

---

## Changing the admin slug or password

Edit `functions/index.js` lines 12–15 then redeploy:
```bash
firebase deploy --only functions
```
