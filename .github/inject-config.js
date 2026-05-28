/**
 * Injects Firebase secrets into firebase-config.js at build time.
 * Called by GitHub Actions workflow. Reads env vars set from repo secrets.
 */
const fs = require('fs');
const path = require('path');

const configPath = process.argv[2];
if (!configPath) {
    console.error('Usage: node inject-config.js <path-to-firebase-config.js>');
    process.exit(1);
}

const required = [
    'FIREBASE_API_KEY',
    'FIREBASE_AUTH_DOMAIN',
    'FIREBASE_PROJECT_ID',
    'FIREBASE_STORAGE_BUCKET',
    'FIREBASE_MESSAGING_SENDER_ID',
    'FIREBASE_APP_ID',
];

let missing = false;
for (const key of required) {
    if (!process.env[key]) {
        console.error('ERROR: Missing secret:', key);
        missing = true;
    }
}
if (missing) process.exit(1);

let content = fs.readFileSync(configPath, 'utf8');

const replacements = {
    '__FIREBASE_API_KEY__': process.env.FIREBASE_API_KEY,
    '__FIREBASE_AUTH_DOMAIN__': process.env.FIREBASE_AUTH_DOMAIN,
    '__FIREBASE_PROJECT_ID__': process.env.FIREBASE_PROJECT_ID,
    '__FIREBASE_STORAGE_BUCKET__': process.env.FIREBASE_STORAGE_BUCKET,
    '__FIREBASE_MESSAGING_SENDER_ID__': process.env.FIREBASE_MESSAGING_SENDER_ID,
    '__FIREBASE_APP_ID__': process.env.FIREBASE_APP_ID,
};

for (const [token, value] of Object.entries(replacements)) {
    content = content.replace(token, value);
}

fs.writeFileSync(configPath, content);
console.log('Firebase config injected successfully into:', configPath);
