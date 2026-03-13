import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyC2ZMGTziZo0fyVsbYiayZF871EMJdi2pM",
  authDomain: "wtf-4ad8e.firebaseapp.com",
  projectId: "wtf-4ad8e",
  storageBucket: "wtf-4ad8e.firebasestorage.app",
  messagingSenderId: "750505233938",
  appId: "1:750505233938:web:1f1f61ac3dad6b6bed92cb",
  measurementId: "G-6SMK0P6XTN",
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const firestore = getFirestore(firebaseApp);
