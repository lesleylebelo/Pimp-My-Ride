// Synthetic configuration only; never imported by application code.
const LOCAL_MOCK_ENV=Object.freeze({NODE_ENV:'test',PMR_MOCK_PAYMENTS_ENABLED:'true',FIREBASE_PROJECT_ID:'demo-pmr-security',FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',FIREBASE_AUTH_EMULATOR_HOST:'127.0.0.1:9099'});
const PROJECT='pimp-my-ride-a26fc';
const HOSTED_MOCK_ENV=Object.freeze({NODE_ENV:'production',PMR_MOCK_PAYMENTS_ENABLED:'true',FIREBASE_PROJECT_ID:PROJECT});
module.exports={LOCAL_MOCK_ENV,HOSTED_MOCK_ENV,PROJECT};
