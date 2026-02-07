// Helper to get params
// This file is in the public folder, so we can't use process.env or import.meta.env directly in the browser service worker scope usually (unless built).
// We'll hardcode the config from the .env for reliability in this generated file.

importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyB5eeS5Y8xRA4Agmkum85JK7hBTf66pN34",
  authDomain: "soundwave-crackers.firebaseapp.com",
  projectId: "soundwave-crackers",
  storageBucket: "soundwave-crackers.firebasestorage.app",
  messagingSenderId: "481458959237",
  appId: "1:481458959237:web:cafb9d05093f1897ae0aec",
  measurementId: "G-YP7WPZ98WP"
};

try {
    firebase.initializeApp(firebaseConfig);
    const messaging = firebase.messaging();
    
    // Background message handler
    messaging.onBackgroundMessage((payload) => {
      console.log('Received background message ', payload);
      
      const notificationTitle = payload.notification.title;
      const notificationOptions = {
        body: payload.notification.body,
        icon: '/assets/img/logo/logo_2.png', // Optional: customize icon
      };
    
      self.registration.showNotification(notificationTitle, notificationOptions);
    });
} catch (e) {
    console.error("Firebase SW Init Error", e);
}
