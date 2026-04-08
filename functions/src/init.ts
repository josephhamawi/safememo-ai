/**
 * Firebase Admin initialization.
 * Import this module before any other module that uses firebase-admin.
 */
import { initializeApp, getApps } from 'firebase-admin/app';

if (getApps().length === 0) {
  initializeApp();
}
