# שעון נוכחות — Multi-Employer

מערכת אישית לניהול שעות עבודה למספר מעבידים. Offline-First, PWA (ובהמשך APK דרך Capacitor + סנכרון Supabase).

## הרצה
```bash
npm install
npm run dev      # פיתוח
npm test         # בדיקות יחידה
npm run build    # בנייה ל-dist/ (כולל Service Worker)
```

## מבנה
```
src/domain/     טיפוסים וחישובים טהורים (משך, שכר, חצות, חפיפות, תעריף היסטורי, תקופות)
src/data/       DataAdapter (ממשק) ← LocalAdapter (IndexedDB) ; TimeClockService (כללים עסקיים)
src/screens/    ראשי, יומן, דוחות, מעבידים, הגדרות
src/export/     PDF / XLSX / CSV (UTF-8 BOM)
```
הממשק עובד רק מול `TimeClockService`/`DataAdapter`, כך שסנכרון ענן יתווסף כמימוש נוסף של ה-Adapter.
לכל רשומה: `id` (UUID), `createdAt`, `updatedAt`, `deleted` (מחיקה רכה) — בסיס ל-Last-Write-Wins בסנכרון.

## ענן (Supabase)
1. להריץ את `supabase/schema.sql` ב-SQL Editor של הפרויקט (פעם אחת).
2. להגדיר את ה-Publishable key ב-`src/config.ts` (או `VITE_SUPABASE_KEY` בזמן build).
3. Authentication → Sign In / Providers → Email: לכבות את "Confirm email".
   ההתחברות היא בשם משתמש + סיסמה; שם המשתמש ממופה לכתובת פנימית `user@timeclock.local` (לא נשלחים מיילים).
   איפוס סיסמה: מ-Dashboard → Authentication → Users.

סנכרון: כל שינוי נשמר מקומית ונכנס לתור; התור נדחף לענן כשיש חיבור, ושינויים מהענן נמשכים
לפי `server_updated_at` (+ Realtime לעדכון מיידי). התנגשויות: הגרסה עם `updated_at` המאוחר גוברת (נאכף גם בשרת).

## שלבים
1. ✅ PWA מקומית מלאה
2. ✅ Supabase: התחברות שם משתמש+סיסמה, סנכרון, RLS (ממתין למפתח)
3. ⏳ APK (Capacitor), התראות, עדכונים דרך GitHub Releases
