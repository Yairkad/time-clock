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

## שלבים
1. ✅ PWA מקומית מלאה
2. ⏳ Supabase: התחברות מייל+סיסמה, סנכרון, RLS
3. ⏳ APK (Capacitor), התראות, עדכונים דרך GitHub Releases
