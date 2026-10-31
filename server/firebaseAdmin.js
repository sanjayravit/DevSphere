// Backwards-compatible shared Firebase Admin singleton for existing routes/models.
import { admin, db } from './config/firebase.js';
export { admin, db };
export const getDb = () => db;
const firebaseAdmin = { admin, db, getDb };
export default firebaseAdmin;
