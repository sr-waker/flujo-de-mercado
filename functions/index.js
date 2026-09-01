
const functions = require('firebase-functions');
const admin = require('firebase-admin');
if (admin.apps.length === 0) {
  admin.initializeApp();
}

/**
 * CONFIGURACIÓN DE MISIONES (Pool de misiones aleatorias)
 */
const QUEST_POOL = [
  { type: 'SALES_COUNT', description: 'Registrar 5 ventas hoy', target: 5 },
  { type: 'REVENUE_GOAL', description: 'Facturar más de $15,000 hoy', target: 15000 },
  { type: 'ITEM_COUNT', description: 'Vender 10 productos distintos hoy', target: 10 },
  { type: 'SALES_COUNT', description: 'Completar 10 transacciones', target: 10 },
  { type: 'REVENUE_GOAL', description: 'Superar la meta de $30,000', target: 30000 },
  { type: 'ITEM_COUNT', description: 'Vender 20 artículos en total', target: 20 }
];

/**
 * LÓGICA DE TIEMPO (Zona Horaria Argentina)
 */
const getArgentinaDate = () => {
  const d = new Date();
  const options = { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' };
  const parts = new Intl.DateTimeFormat('en-CA', options).format(d).split('-'); // YYYY-MM-DD
  return parts.join('-');
};

const getYesterdayDate = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const options = { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' };
  const parts = new Intl.DateTimeFormat('en-CA', options).format(d).split('-');
  return parts.join('-');
};

/**
 * CLOUD FUNCTION: Actualizar Rachas y Misiones al crear una Venta.
 */
exports.handleSaleForEngagement = functions.firestore
  .document('sales/{saleId}')
  .onCreate(async (snap, context) => {
    const sale = snap.data();
    if (!sale.userId || sale.isAbono) return null;

    const db = admin.firestore();
    const userRef = db.collection('users').doc(sale.userId);
    const today = getArgentinaDate();
    const yesterday = getYesterdayDate();

    return db.runTransaction(async (transaction) => {
      const userDoc = await transaction.get(userRef);
      if (!userDoc.exists) return;

      const userData = userDoc.data();
      const updates = {};

      // --- Lógica de Racha ---
      if (userData.lastSaleDate !== today) {
        if (userData.lastSaleDate === yesterday) {
          // Continuar racha
          updates.currentStreak = (userData.currentStreak || 0) + 1;
        } else {
          // Racha se rompió antes (falló el cron) o es nuevo
          updates.currentStreak = 1;
        }
        updates.lastSaleDate = today;
        
        // Actualizar racha máxima si aplica
        if (updates.currentStreak > (userData.maxStreak || 0)) {
          updates.maxStreak = updates.currentStreak;
        }
      }

      // --- Lógica de Misiones Diarias ---
      if (userData.dailyQuests && Array.isArray(userData.dailyQuests)) {
        const newQuests = userData.dailyQuests.map(quest => {
          if (quest.isCompleted) return quest;

          let newCurrent = quest.current || 0;
          if (quest.type === 'SALES_COUNT') {
            newCurrent += 1;
          } else if (quest.type === 'REVENUE_GOAL' && sale.paymentMethod !== 'Fiado') {
            newCurrent += (sale.total || 0);
          } else if (quest.type === 'ITEM_COUNT') {
            newCurrent += (sale.items ? sale.items.length : 0);
          }

          const isNowCompleted = newCurrent >= quest.target;
          return { ...quest, current: newCurrent, isCompleted: isNowCompleted };
        });
        updates.dailyQuests = newQuests;
      }

      transaction.update(userRef, updates);
    });
  });

/**
 * CLOUD FUNCTION: Reseteo Diario a Medianoche.
 * Rompe rachas de usuarios inactivos y rota misiones.
 */
exports.dailyEngagementReset = functions.pubsub
  .schedule('0 0 * * *')
  .timeZone('America/Argentina/Buenos_Aires')
  .onRun(async (context) => {
    const db = admin.firestore();
    const usersSnapshot = await db.collection('users').get();
    const yesterday = getYesterdayDate();
    const batch = db.batch();

    usersSnapshot.forEach(doc => {
      const userData = doc.data();
      const updates = {};

      // 1. Romper racha si no vendió ayer ni hoy
      if (userData.lastSaleDate !== yesterday && userData.lastSaleDate !== getArgentinaDate()) {
        updates.currentStreak = 0;
      }

      // 2. Rotar misiones (Elegir 3 aleatorias del pool)
      const shuffled = [...QUEST_POOL].sort(() => 0.5 - Math.random());
      const selected = shuffled.slice(0, 3).map((q, i) => ({
        ...q,
        id: `quest-${Date.now()}-${i}`,
        current: 0,
        isCompleted: false
      }));
      updates.dailyQuests = selected;

      batch.update(doc.ref, updates);
    });

    return batch.commit();
  });

/**
 * CLOUD FUNCTION: Reporte Mensual Programado.
 */
exports.scheduledMonthlyReport = functions.pubsub
  .schedule('0 0 1 * *')
  .timeZone('America/Argentina/Buenos_Aires')
  .onRun(async (context) => {
    const db = admin.firestore();
    const now = new Date();
    
    const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    
    const startTime = firstDayLastMonth.getTime();
    const endTime = lastDayLastMonth.getTime();
    
    const monthName = firstDayLastMonth.toLocaleString('es-ES', { month: 'long' });
    const capitalizedMonth = monthName.charAt(0).toUpperCase() + monthName.slice(1);

    // Nota: listUsers() requiere permisos de admin.auth() que dependen de la configuración del proyecto.
    const usersSnapshot = await admin.auth().listUsers();
    
    const reportPromises = usersSnapshot.users.map(async (userRecord) => {
      const userId = userRecord.uid;
      const userEmail = userRecord.email;
      const userName = userRecord.displayName || 'Administrador';

      if (!userEmail) return;

      const salesSnapshot = await db.collection('sales')
        .where('userId', '==', userId)
        .where('timestamp', '>=', startTime)
        .where('timestamp', '<=', endTime)
        .get();

      let totalRevenue = 0;
      let totalProfit = 0;
      const productCounts = {};

      salesSnapshot.forEach(doc => {
        const sale = doc.data();
        totalRevenue += (sale.total || 0);
        (sale.items || []).forEach(item => {
          const buyPrice = item.buyPrice || 0;
          totalProfit += (item.total - (buyPrice * (item.quantity || 1)));
          productCounts[item.name] = (productCounts[item.name] || 0) + (item.quantity || 0);
        });
      });

      const topProduct = Object.entries(productCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

      const productsSnapshot = await db.collection('productos')
        .where('userId', '==', userId)
        .get();

      const lowStockItems = [];
      productsSnapshot.forEach(doc => {
        const p = doc.data();
        if (p.stock <= (p.minStock || 5)) {
          lowStockItems.push(p.name);
        }
      });

      const lowStockHtml = lowStockItems.length > 0 
        ? lowStockItems.map(item => `<li style="margin-bottom: 5px;">${item}</li>`).join('')
        : '<li>No hay productos con stock crítico.</li>';

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: sans-serif; background-color: #f8fafc; color: #1e293b; }
            .container { max-width: 600px; margin: 20px auto; background: #fff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; }
            .header { background: #1e293b; color: #fff; padding: 30px; text-align: center; }
            .content { padding: 30px; }
            .stat-card { background: #f1f5f9; padding: 15px; border-radius: 12px; margin-bottom: 15px; }
            .profit { color: #10b981; font-weight: bold; }
            .alert { background: #fff7ed; border: 1px solid #ffedd5; padding: 15px; border-radius: 12px; color: #9a3412; }
            .btn { display: block; text-align: center; background: #1e293b; color: #fff; padding: 15px; border-radius: 12px; text-decoration: none; margin-top: 20px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header"><h1>MarketFlow Report</h1><p>Resumen de ${capitalizedMonth}</p></div>
            <div class="content">
              <h2>Hola, ${userName}</h2>
              <div class="stat-card">
                <p>Ventas Brutas: <strong>$${totalRevenue.toLocaleString()}</strong></p>
                <p>Utilidad Neta: <span class="profit">$${totalProfit.toLocaleString()}</span></p>
              </div>
              <p>🏆 Producto Top: <strong>${topProduct}</strong></p>
              <div class="alert">
                <strong>⚠️ Stock Bajo:</strong>
                <ul>${lowStockHtml}</ul>
              </div>
              <a href="https://marketflow-app.web.app" class="btn">Ir al Dashboard</a>
            </div>
          </div>
        </body>
        </html>
      `;

      return db.collection('mail').add({
        to: userEmail,
        message: {
          subject: `MarketFlow: Reporte de ${capitalizedMonth}`,
          html: htmlContent,
        },
        userId: userId,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
    });

    await Promise.all(reportPromises);
    console.log(`Reportes mensuales procesados para ${usersSnapshot.users.length} usuarios.`);
    return null;
  });

/**
 * CLOUD FUNCTION: Sincronizar Total Diario.
 */
exports.syncDailyTotal = functions.firestore
  .document('sales/{saleId}')
  .onWrite(async (change, context) => {
    const saleData = change.after.exists ? change.after.data() : change.before.data();
    
    if (!saleData || !saleData.userId || !saleData.timestamp) return null;

    const db = admin.firestore();
    const userId = saleData.userId;
    const timestamp = saleData.timestamp;

    const date = new Date(timestamp);
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999).getTime();

    const salesSnapshot = await db.collection('sales')
      .where('userId', '==', userId)
      .where('timestamp', '>=', startOfDay)
      .where('timestamp', '<=', endOfDay)
      .get();

    let totalCollected = 0;
    let totalFiado = 0;
    let totalVolume = 0;

    salesSnapshot.forEach(doc => {
      const sale = doc.data();
      const amount = sale.total || 0;
      if (sale.paymentMethod === 'Fiado') {
        totalFiado += amount;
      } else {
        totalCollected += amount;
      }
      totalVolume += amount;
    });

    const dateId = date.toISOString().split('T')[0];
    const statsRef = db.collection('daily_stats').doc(`${userId}_${dateId}`);

    return statsRef.set({
      userId,
      date: dateId,
      timestamp: startOfDay,
      totalReal: Number(totalCollected.toFixed(2)),
      totalFiado: Number(totalFiado.toFixed(2)),
      totalGlobal: Number(totalVolume.toFixed(2)),
      lastSync: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  });
