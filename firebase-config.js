/**
 * Firebase Configuration & Auth Helper
 * Replace the firebaseConfig values with your own Firebase project credentials.
 */

const firebaseConfig = {
    apiKey: "AIzaSyARm2Fy1SfbepEuTSvs5LcGPq5GZe7glmE",
    authDomain: "bracketflow-58321.firebaseapp.com",
    projectId: "bracketflow-58321",
    storageBucket: "bracketflow-58321.firebasestorage.app",
    messagingSenderId: "1071104966834",
    appId: "1:1071104966834:web:40a1d0a4a864a8073fc9ab"
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

    async signInWithGoogle() {
        const provider = new firebase.auth.GoogleAuthProvider();
        try {
            await auth.signInWithPopup(provider);
        } catch (e) {
            console.error('Sign-in failed:', e);
        }
    },

    async signOut() {
        try {
            await auth.signOut();
        } catch (e) {
            console.error('Sign-out failed:', e);
        }
    },

    isLoggedIn() {
        return !!this.currentUser;
    },

    getUid() {
        return this.currentUser ? this.currentUser.uid : null;
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
            return snapshot.docs.map(doc => doc.data());
        } catch (e) {
            console.error('Firestore read failed:', e);
            return [];
        }
    },

    async save(tournament) {
        const col = this.collection();
        if (!col) return;
        try {
            await col.doc(tournament.id).set(tournament);
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
            batch.set(col.doc(t.id), t);
        });
        try {
            await batch.commit();
        } catch (e) {
            console.error('Firestore batch write failed:', e);
        }
    }
};
