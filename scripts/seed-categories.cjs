const {initializeApp, applicationDefault, cert} = require('firebase-admin/app');
const {getFirestore, FieldValue} = require('firebase-admin/firestore');

const categories = {
  'body-kit': {
    name: 'Body Kit',
    description: 'Body kit installation and exterior customization.',
  },
  detailing: {
    name: 'Detailing',
    description: 'Interior and exterior vehicle cleaning and detailing.',
  },
  mechanical: {
    name: 'Mechanical',
    description: 'General mechanical inspection, maintenance, and repairs.',
  },
};

async function main() {
  const [projectId] = process.argv.slice(2);
  if (!projectId || process.argv.length !== 3) {
    console.error('Usage: node scripts/seed-categories.cjs PROJECT_ID');
    process.exitCode = 1;
    return;
  }

  let credential = applicationDefault();
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    let serviceAccount;
    try {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    } catch (_) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.');
    }
    if (serviceAccount.project_id !== projectId) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON project does not match the requested project.');
    }
    credential = cert(serviceAccount);
  }
  try {
    await credential.getAccessToken();
  } catch (_) {
    throw new Error('Firebase credentials are unavailable. Run `gcloud auth application-default login` or set FIREBASE_SERVICE_ACCOUNT_JSON for this PowerShell session.');
  }
  initializeApp({credential, projectId});
  const db = getFirestore();
  const batch = db.batch();

  for (const [id, category] of Object.entries(categories)) {
    batch.set(db.doc(`serviceCategories/${id}`), {
      ...category,
      archived: false,
      updatedAt: FieldValue.serverTimestamp(),
    }, {merge: true});
  }

  await batch.commit();
  console.log(`Seeded ${Object.keys(categories).length} active service categories in project ${projectId}.`);
}

main().catch(error => {
  console.error(error.message || 'Category seeding could not be confirmed. Check Firebase credentials and the project ID.');
  process.exitCode = 1;
});
