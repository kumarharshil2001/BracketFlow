/**
 * Firebase Configuration & Auth Helper
 * Replace the firebaseConfig values with your own Firebase project credentials.
 */

const firebaseConfig = {
    apiKey: "FIREBASE_API_KEY",
    authDomain: "FIREBASE_AUTH_DOMAIN",
    projectId: "FIREBASE_PROJECT_ID",
    storageBucket: "FIREBASE_STORAGE_BUCKET",
    messagingSenderId: "FIREBASE_MESSAGING_SENDER_ID",
    appId: "FIREBASE_APP_ID"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Auth helper
const Auth = {
    currentUser: null,

    init(onAuthChanged) {
        auth.onAuthStateChanged((user) => {
            this.currentUser = user;
            if (onAuthChanged) onAuthChanged(user);
        });
    },

    async signUp(email, password) {
        try {
            await auth.createUserWithEmailAndPassword(email, password);
            return { success: true };
        } catch (e) {
            return { success: false, message: this.getErrorMessage(e.code) };
        }
    },

    async signIn(email, password) {
        try {
            await auth.signInWithEmailAndPassword(email, password);
            return { success: true };
        } catch (e) {
            return { success: false, message: this.getErrorMessage(e.code) };
        }
    },

    async signInWithGoogle() {
        const provider = new firebase.auth.GoogleAuthProvider();
        try {
            await auth.signInWithPopup(provider);
            return { success: true };
        } catch (e) {
            return { success: false, message: this.getErrorMessage(e.code) };
        }
    },

    async signOut() {
        try {
            await auth.signOut();
        } catch (e) {
            console.error('Sign-out failed:', e);
        }
    },

    async resetPassword(email) {
        try {
            await auth.sendPasswordResetEmail(email);
            return { success: true };
        } catch (e) {
            return { success: false, message: this.getErrorMessage(e.code) };
        }
    },

    isLoggedIn() {
        return !!this.currentUser;
    },

    getUid() {
        return this.currentUser ? this.currentUser.uid : null;
    },

    getDisplayName() {
        if (!this.currentUser) return 'User';
        return this.currentUser.displayName || this.currentUser.email || 'User';
    },

    getErrorMessage(code) {
        const messages = {
            'auth/email-already-in-use': 'This email is already registered.',
            'auth/invalid-email': 'Invalid email address.',
            'auth/weak-password': 'Password must be at least 6 characters.',
            'auth/user-not-found': 'No account found with this email.',
            'auth/wrong-password': 'Incorrect password.',
            'auth/too-many-requests': 'Too many attempts. Try again later.',
            'auth/invalid-credential': 'Invalid email or password.',
            'auth/popup-closed-by-user': 'Sign-in popup was closed.',
            'auth/cancelled-popup-request': 'Sign-in cancelled.'
        };
        return messages[code] || 'Authentication failed. Please try again.';
    }
};

// Firestore helper - stores tournaments under /users/{uid}/tournaments/{id}
const FireStore = {
    collection() {
        const uid = Auth.getUid();
        if (!uid) return null;
        return db.collection('users').doc(uid).collection('tournaments');
    },

    async getAll() {
        const col = this.collection();
        if (!col) return [];
        try {
            const snapshot = await col.orderBy('createdAt', 'desc').get();
            return snapshot.docs.map(doc => {
                const data = doc.data();
                // If we stored the full tournament as a JSON payload, parse it.
                if (data && data.payload && typeof data.payload === 'string') {
                    try {
                        return JSON.parse(data.payload);
                    } catch (e) {
                        // Fallback to raw data when parse fails
                        return data;
                    }
                }
                // If older format (raw tournament object), return as-is
                return data;
            });
        } catch (e) {
            console.error('Firestore read failed:', e);
            return [];
        }
    },

    async save(tournament) {
        const col = this.collection();
        if (!col) return;
        try {
            // Firestore rejects nested arrays in some cases (arrays within arrays).
            // To avoid this, store a serialized `payload` containing the full tournament
            // and keep a few indexed metadata fields at top-level for queries.
            const doc = {
                id: tournament.id,
                name: tournament.name || null,
                type: tournament.type || null,
                createdAt: tournament.createdAt || Date.now(),
                owner: Auth.getUid(),
                payload: JSON.stringify(tournament)
            };
            await col.doc(tournament.id).set(doc);
        } catch (e) {
            console.error('Firestore write failed:', e);
        }
    },

    async delete(id) {
        const col = this.collection();
        if (!col) return;
        try {
            await col.doc(id).delete();
        } catch (e) {
            console.error('Firestore delete failed:', e);
        }
    },

    async saveAll(tournaments) {
        const col = this.collection();
        if (!col) return;
        const batch = db.batch();
        tournaments.forEach(t => {
            const doc = {
                id: t.id,
                name: t.name || null,
                type: t.type || null,
                createdAt: t.createdAt || Date.now(),
                owner: Auth.getUid(),
                payload: JSON.stringify(t)
            };
            batch.set(col.doc(t.id), doc);
        });
        try {
            await batch.commit();
        } catch (e) {
            console.error('Firestore batch write failed:', e);
        }
    }
};
