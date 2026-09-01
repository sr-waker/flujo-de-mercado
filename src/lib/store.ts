'use client';

import { useCallback } from 'react';
import { collection, doc, increment, getDoc, query, where, getDocs, writeBatch, arrayUnion, deleteDoc, Firestore } from 'firebase/firestore';
import { 
  useFirestore, 
  useAuth, 
  addDocumentNonBlocking, 
  updateDocumentNonBlocking, 
  setDocumentNonBlocking,
  deleteDocumentNonBlocking,
  errorEmitter,
  FirestorePermissionError
} from '@/firebase';
import { Product, Expense, PaymentMethod, Customer, Sale, SupplierDebt, UserProfile } from './types';
import { getPerishablesAlert } from '@/ai/flows/perishables-inventory-flow';

export function useMarketStore() {
  const db = useFirestore();
  const auth = useAuth();

  const addCustomer = useCallback((name: string, phone?: string, notes?: string) => {
    if (!auth.currentUser) return;
    const colRef = collection(db, 'customers');
    addDocumentNonBlocking(colRef, {
      userId: auth.currentUser.uid,
      name: name.trim(),
      phone: phone?.trim() || '',
      notes: notes?.trim() || '',
      createdAt: Date.now()
    });
  }, [db, auth]);

  const deleteCustomer = useCallback((id: string) => {
    const docRef = doc(db, 'customers', id);
    deleteDocumentNonBlocking(docRef);
  }, [db]);

  const addMeatFolder = useCallback((name: string) => {
    if (!auth.currentUser) return;
    const colRef = collection(db, 'meat_folders');
    addDocumentNonBlocking(colRef, {
      userId: auth.currentUser.uid,
      name: name.trim(),
      createdAt: Date.now()
    });
  }, [db, auth]);

  const deleteMeatFolder = useCallback((id: string) => {
    const docRef = doc(db, 'meat_folders', id);
    deleteDocumentNonBlocking(docRef);
  }, [db]);

  const addProduct = useCallback((product: Omit<Product, 'id' | 'updatedAt' | 'userId'>) => {
    if (!auth.currentUser) return;
    const colRef = collection(db, 'productos');
    addDocumentNonBlocking(colRef, {
      ...product,
      userId: auth.currentUser.uid,
      updatedAt: Date.now()
    });
  }, [db, auth]);

  const updateProduct = useCallback((id: string, updates: Partial<Product>) => {
    const docRef = doc(db, 'productos', id);
    updateDocumentNonBlocking(docRef, {
      ...updates,
      updatedAt: Date.now()
    });
  }, [db]);

  const deleteProduct = useCallback((id: string) => {
    const docRef = doc(db, 'productos', id);
    deleteDocumentNonBlocking(docRef);
  }, [db]);

  const startSession = useCallback((initialBalance: number) => {
    if (!auth.currentUser) return;
    const colRef = collection(db, 'shifts');
    addDocumentNonBlocking(colRef, {
      userId: auth.currentUser.uid,
      cashierId: auth.currentUser.uid,
      cashierName: auth.currentUser.displayName || 'Administrador',
      startDateTime: new Date().toISOString(),
      timestamp: Date.now(),
      initialBalance: Number(initialBalance) || 0,
      totalSalesAmount: 0,
      isClosed: false,
    });
  }, [db, auth]);

  const closeSession = useCallback((sessionId: string, totalSales: number, totalExtra: number, initialBalance: number) => {
    const docRef = doc(db, 'shifts', sessionId);
    updateDocumentNonBlocking(docRef, {
      endDateTime: new Date().toISOString(),
      totalSalesAmount: Number(totalSales) || 0,
      finalBalance: (Number(initialBalance) || 0) + (Number(totalSales) || 0) + (Number(totalExtra) || 0),
      isClosed: true,
    });
  }, [db]);

  const syncShiftTotals = useCallback(async (sessionId: string) => {
    if (!auth.currentUser) return;
    
    const salesRef = collection(db, 'sales');
    const q = query(
      salesRef, 
      where('sessionId', '==', sessionId), 
      where('userId', '==', auth.currentUser.uid)
    );
    
    getDocs(q).then(snapshot => {
      let totalRealSum = 0;
      snapshot.forEach(docSnap => {
        const sale = docSnap.data();
        if (sale.paymentMethod !== 'Fiado') {
          totalRealSum += (Number(sale.total) || 0);
        }
      });

      const batch = writeBatch(db);
      const shiftRef = doc(db, 'shifts', sessionId);
      
      batch.update(shiftRef, {
        totalSalesAmount: Number(totalRealSum.toFixed(2)),
        lastManualSync: Date.now()
      });

      batch.commit().catch(async () => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: shiftRef.path,
          operation: 'update'
        }));
      });
    }).catch(async () => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: salesRef.path,
        operation: 'list'
      }));
    });
  }, [db, auth]);

  const triggerMasterCloudSync = useCallback(async (duplicates: any[]) => {
    if (!auth.currentUser || !duplicates.length) return;
    
    const batch = writeBatch(db);
    duplicates.forEach(dup => {
      const docRef = doc(db, 'sales', dup.id);
      batch.delete(docRef);
    });

    batch.commit().catch(async () => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: 'sales',
        operation: 'delete'
      }));
    });
    
    return true;
  }, [db, auth]);

  const triggerMasterPurchaseCleanup = useCallback(async () => {
    if (!auth.currentUser) return { count: 0 };
    
    const userId = auth.currentUser.uid;
    const purchasesRef = collection(db, 'purchases');
    const q = query(purchasesRef, where('userId', '==', userId));
    
    try {
      const snapshot = await getDocs(q);
      const fingerprints = new Map<string, string>();
      const duplicatesToDelete: string[] = [];

      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const timeWindow = Math.floor(data.timestamp / 5000);
        const fingerprint = `${data.supplierName}_${data.total}_${timeWindow}`;

        if (fingerprints.has(fingerprint)) {
          duplicatesToDelete.push(docSnap.id);
        } else {
          fingerprints.set(fingerprint, docSnap.id);
        }
      });

      if (duplicatesToDelete.length > 0) {
        const batch = writeBatch(db);
        duplicatesToDelete.forEach(id => {
          batch.delete(doc(db, 'purchases', id));
        });
        batch.commit().catch(async () => {
          errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: 'purchases',
            operation: 'delete'
          }));
        });
      }

      return { count: duplicatesToDelete.length };
    } catch (e) {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: 'purchases',
        operation: 'list'
      }));
      throw e;
    }
  }, [db, auth]);

  const addSale = useCallback(async (sessionId: string, sale: any, customId?: string) => {
    if (!auth.currentUser) return null;
    
    const saleId = customId || doc(collection(db, 'sales')).id;
    const saleRef = doc(db, 'sales', saleId);
    
    try {
      const existingSnap = await getDoc(saleRef);
      if (existingSnap.exists()) {
        return { id: saleId, ...existingSnap.data(), isDuplicate: true };
      }
    } catch (e) {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: saleRef.path,
        operation: 'get'
      }));
      return null;
    }

    const isFiado = sale.paymentMethod === 'Fiado';
    
    const saleData: any = {
      id: saleId,
      userId: auth.currentUser.uid,
      sessionId,
      cashierId: auth.currentUser.uid,
      timestamp: Date.now(),
      saleDateTime: new Date().toISOString(),
      isCompleted: true,
      items: (sale.items || []).map((item: any) => ({
        productId: item.productId || '',
        name: item.name || '',
        quantity: Number(item.quantity) || 0,
        price: Number(item.price) || 0,
        buyPrice: Number(item.buyPrice) || 0,
        total: Number(item.total) || 0
      })),
      extraCharges: (sale.extraCharges || []).map((charge: any) => ({
        name: charge.name || '',
        amount: Number(charge.amount) || 0,
        isBalanza: !!charge.isBalanza,
        meatFolderId: charge.meatFolderId || null,
        productId: charge.productId || null,
        quantity: charge.quantity || null
      })),
      total: Number(sale.total) || 0,
      paymentMethod: sale.paymentMethod || 'Efectivo',
      customerId: sale.customerId || null,
      customerName: sale.customerName || null
    };

    if (isFiado) {
      saleData.initialTotal = Number(sale.total);
    }

    setDocumentNonBlocking(saleRef, saleData, { merge: true });

    const warnings: string[] = [];

    const processStockDeduction = (productId: string, quantity: number) => {
      if (!productId) return;
      const productRef = doc(db, 'productos', productId);
      getDoc(productRef).then(productSnap => {
        if (productSnap.exists()) {
          const product = productSnap.data() as Product;
          const qty = Number(quantity) || 0;
          const merma = product.porcentajeMerma || 0;
          const stockToDeduct = qty * (1 + (merma / 100));
          
          updateDocumentNonBlocking(productRef, {
            stock: increment(-stockToDeduct)
          });

          const newStock = product.stock - stockToDeduct;
          if (newStock <= (product.minStock || 5)) {
            getPerishablesAlert({
              productName: product.name,
              currentStockKg: newStock,
              minStockKg: product.minStock || 5,
              portionSizeGr: 200
            }).then(alert => {
              warnings.push(alert.message);
            }).catch(() => {});
          }
        }
      }).catch(async () => {
        errorEmitter.emit('permission-error', new FirestorePermissionError({
          path: productRef.path,
          operation: 'get'
        }));
      });
    };

    if (sale.items && Array.isArray(sale.items)) {
      for (const item of sale.items) {
        processStockDeduction(item.productId, item.quantity);
      }
    }

    if (sale.extraCharges && Array.isArray(sale.extraCharges)) {
      for (const charge of sale.extraCharges) {
        if (charge.productId) {
          processStockDeduction(charge.productId, charge.quantity || 1);
        }
      }
    }
    
    const shiftRef = doc(db, 'shifts', sessionId);
    updateDocumentNonBlocking(shiftRef, {
      totalSalesAmount: increment(Number(sale.total) || 0)
    });

    return { ...saleData, warnings };
  }, [db, auth]);

  const deleteSale = useCallback((saleId: string) => {
    const docRef = doc(db, 'sales', saleId);
    deleteDocumentNonBlocking(docRef);
  }, [db]);

  const updateSalePaymentMethod = useCallback((saleId: string, newMethod: PaymentMethod) => {
    const docRef = doc(db, 'sales', saleId);
    updateDocumentNonBlocking(docRef, { paymentMethod: newMethod });
  }, [db]);

  const registerSalePartialPayment = useCallback((sessionId: string | null, saleId: string, paymentAmount: number, method: PaymentMethod, customerName: string, currentRemaining: number, initialTotal?: number) => {
    if (!auth.currentUser) return;
    const amount = Number(paymentAmount);
    const remaining = Number(currentRemaining);
    const saleRef = doc(db, 'sales', saleId);

    const isFull = amount >= remaining;
    const finalInitialTotal = initialTotal || remaining;

    if (isFull) {
      updateDocumentNonBlocking(saleRef, {
        paymentMethod: method,
        total: finalInitialTotal,
        isLiquidado: true
      });
    } else {
      updateDocumentNonBlocking(saleRef, {
        total: Math.max(0, remaining - amount),
        initialTotal: finalInitialTotal
      });
    }

    const colRef = collection(db, 'sales');
    addDocumentNonBlocking(colRef, {
      userId: auth.currentUser.uid,
      timestamp: Date.now(),
      sessionId: sessionId || 'historical',
      total: amount,
      paymentMethod: method,
      items: [],
      extraCharges: [{ name: `Abono Fiado: ${customerName}`, amount: amount }],
      isAbono: true
    });
  }, [db, auth]);

  const registerCascadingPayment = useCallback((sessionId: string | null, customerId: string, sales: Sale[], paymentAmount: number, method: PaymentMethod, customerName: string) => {
    if (!auth.currentUser) return;
    
    let remainingAbono = Number(paymentAmount);
    const sortedSales = [...sales].sort((a, b) => b.timestamp - a.timestamp);

    sortedSales.forEach(sale => {
      if (remainingAbono <= 0) return;

      const saleRef = doc(db, 'sales', sale.id);
      const currentTotal = Number(sale.total);
      const initial = sale.initialTotal || currentTotal;

      if (remainingAbono >= currentTotal) {
        updateDocumentNonBlocking(saleRef, {
          paymentMethod: method,
          isLiquidado: true,
          total: initial,
          initialTotal: initial
        });
        remainingAbono -= currentTotal;
      } else {
        updateDocumentNonBlocking(saleRef, {
          total: currentTotal - remainingAbono,
          initialTotal: initial
        });
        remainingAbono = 0;
      }
    });

    const colRef = collection(db, 'sales');
    addDocumentNonBlocking(colRef, {
      userId: auth.currentUser.uid,
      timestamp: Date.now(),
      sessionId: sessionId || 'historical',
      total: Number(paymentAmount),
      paymentMethod: method,
      items: [],
      extraCharges: [{ name: `Abono Cascada: ${customerName}`, amount: Number(paymentAmount) }],
      isAbono: true
    });
  }, [db, auth]);

  const registerFullCustomerPayment = useCallback((sessionId: string | null, customerId: string, sales: Sale[], method: PaymentMethod, customerName: string) => {
    if (!auth.currentUser) return;
    
    let totalPaid = 0;
    
    sales.forEach(sale => {
      if (sale.paymentMethod === 'Fiado') {
        const saleRef = doc(db, 'sales', sale.id);
        totalPaid += Number(sale.total);
        updateDocumentNonBlocking(saleRef, {
          paymentMethod: method,
          isLiquidado: true,
          initialTotal: sale.initialTotal || sale.total,
          total: sale.initialTotal || sale.total
        });
      }
    });

    if (totalPaid > 0) {
      const colRef = collection(db, 'sales');
      addDocumentNonBlocking(colRef, {
        userId: auth.currentUser.uid,
        timestamp: Date.now(),
        sessionId: sessionId || 'historical',
        total: totalPaid,
        paymentMethod: method,
        items: [],
        extraCharges: [{ name: `Liquidación Total: ${customerName}`, amount: totalPaid }],
        isAbono: true
      });
    }
  }, [db, auth]);

  const addPurchase = useCallback((sessionId: string | null, purchase: any) => {
    if (!auth.currentUser) return;
    const colRef = collection(db, 'purchases');
    
    const purchaseData = {
      userId: auth.currentUser.uid,
      sessionId: sessionId || 'historical',
      supplierName: purchase.supplierName || 'Proveedor Varios',
      total: Number(purchase.total) || 0,
      paymentType: purchase.paymentType || 'paid',
      timestamp: Date.now(),
      items: (purchase.items || []).map((item: any) => ({
        productId: item.productId || '',
        name: item.name || '',
        quantity: Number(item.quantity) || 0,
        cost: Number(item.cost) || 0
      }))
    };

    addDocumentNonBlocking(colRef, purchaseData);

    if (purchase.items && Array.isArray(purchase.items)) {
      purchase.items.forEach((item: any) => {
        if (!item.productId) return;
        const productRef = doc(db, 'productos', item.productId);
        updateDocumentNonBlocking(productRef, {
          stock: increment(Number(item.quantity) || 0),
          precioCosto: Number(item.cost) || 0
        });
      });
    }
  }, [db, auth]);

  const deletePurchase = useCallback((purchaseId: string) => {
    const docRef = doc(db, 'purchases', purchaseId);
    deleteDocumentNonBlocking(docRef);
  }, [db]);

  const addExpense = useCallback((sessionId: string | null, expense: Omit<Expense, 'id' | 'userId' | 'timestamp'>) => {
    if (!auth.currentUser) return;
    const colRef = collection(db, 'expenses');
    addDocumentNonBlocking(colRef, {
      ...expense,
      userId: auth.currentUser.uid,
      sessionId: sessionId || 'historical',
      timestamp: Date.now()
    });
  }, [db, auth]);

  const deleteExpense = useCallback((expenseId: string) => {
    const docRef = doc(db, 'expenses', expenseId);
    deleteDocumentNonBlocking(docRef);
  }, [db]);

  const addSupplierDebt = useCallback((debt: Omit<SupplierDebt, 'id' | 'userId' | 'timestamp' | 'isPaid'>) => {
    if (!auth.currentUser) return;
    const colRef = collection(db, 'supplier_debts');
    const amount = Number(debt.amount);
    addDocumentNonBlocking(colRef, {
      ...debt,
      amount: amount,
      initialAmount: amount, 
      userId: auth.currentUser.uid,
      isPaid: false,
      timestamp: Date.now(),
      payments: []
    });
  }, [db, auth]);

  const deleteSupplierDebt = useCallback((id: string) => {
    const docRef = doc(db, 'supplier_debts', id);
    deleteDocumentNonBlocking(docRef);
  }, [db]);

  const updateSupplierDebt = useCallback((id: string, updates: Partial<SupplierDebt>) => {
    const docRef = doc(db, 'supplier_debts', id);
    updateDocumentNonBlocking(docRef, updates);
  }, [db]);

  const deleteSupplierFolder = useCallback(async (supplierName: string) => {
    if (!auth.currentUser) return;
    const q = query(collection(db, 'supplier_debts'), where('userId', '==', auth.currentUser.uid), where('supplierName', '==', supplierName));
    const snap = await getDocs(q);
    const batch = writeBatch(db);
    snap.forEach(d => batch.delete(d.ref));
    await batch.commit();
  }, [db, auth]);

  const renameSupplier = useCallback(async (oldName: string, newName: string) => {
    if (!auth.currentUser || !newName.trim()) return;
    const q = query(collection(db, 'supplier_debts'), where('userId', '==', auth.currentUser.uid), where('supplierName', '==', oldName));
    const snap = await getDocs(q);
    const batch = writeBatch(db);
    snap.forEach(d => batch.update(d.ref, { supplierName: newName.trim() }));
    await batch.commit();
  }, [db, auth]);

  const updateSupplierDebtStatus = useCallback((id: string, isPaid: boolean) => {
    const docRef = doc(db, 'supplier_debts', id);
    updateDocumentNonBlocking(docRef, { isPaid });
  }, [db]);

  const registerSupplierPayment = useCallback((sessionId: string | null, debtId: string, supplierName: string, paymentAmount: number, currentRemaining: number, method: PaymentMethod = 'Efectivo') => {
    if (!auth.currentUser) return;
    const amountToPay = Number(paymentAmount);
    const remaining = Number(currentRemaining);
    if (isNaN(amountToPay) || isNaN(remaining)) return;

    const paymentTransactionId = `PAY-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

    const docRef = doc(db, 'supplier_debts', debtId);
    const newRemaining = Math.max(0, remaining - amountToPay);
    
    updateDocumentNonBlocking(docRef, { 
      amount: newRemaining,
      isPaid: newRemaining <= 0,
      lastPaymentId: paymentTransactionId,
      lastPaymentTimestamp: Date.now(),
      payments: arrayUnion({
        amount: amountToPay,
        timestamp: Date.now(),
        method: method
      })
    });

    const colRef = collection(db, 'expenses');
    addDocumentNonBlocking(colRef, {
      id: paymentTransactionId,
      userId: auth.currentUser.uid,
      sessionId: sessionId || 'historical',
      concept: `Pago Proveedor: ${supplierName}`,
      amount: amountToPay,
      category: 'Mercadería',
      paymentMethod: method,
      timestamp: Date.now()
    });
  }, [db, auth]);

  const registerSupplierCascadingPayment = useCallback((sessionId: string | null, debts: SupplierDebt[], paymentAmount: number, method: PaymentMethod, supplierName: string) => {
    if (!auth.currentUser) return;
    
    let remainingAbono = Number(paymentAmount);
    const sortedDebts = [...debts].sort((a, b) => a.timestamp - a.timestamp);

    sortedDebts.forEach(debt => {
      if (remainingAbono <= 0 || debt.isPaid) return;

      const debtRef = doc(db, 'supplier_debts', debt.id);
      const currentRemaining = Number(debt.amount);
      let applied = 0;

      if (remainingAbono >= currentRemaining) {
        applied = currentRemaining;
        updateDocumentNonBlocking(debtRef, {
          amount: 0,
          isPaid: true,
          lastPaymentTimestamp: Date.now(),
          payments: arrayUnion({ amount: applied, timestamp: Date.now(), method })
        });
        remainingAbono -= currentRemaining;
      } else {
        applied = remainingAbono;
        updateDocumentNonBlocking(debtRef, {
          amount: currentRemaining - remainingAbono,
          lastPaymentTimestamp: Date.now(),
          payments: arrayUnion({ amount: applied, timestamp: Date.now(), method })
        });
        remainingAbono = 0;
      }
    });

    const colRef = collection(db, 'expenses');
    addDocumentNonBlocking(colRef, {
      userId: auth.currentUser.uid,
      sessionId: sessionId || 'historical',
      concept: `Pago Cascada: ${supplierName}`,
      amount: Number(paymentAmount),
      category: 'Mercadería',
      paymentMethod: method,
      timestamp: Date.now()
    });
  }, [db, auth]);

  const registerSupplierFullPayment = useCallback(async (sessionId: string | null, debts: SupplierDebt[], method: PaymentMethod, supplierName: string) => {
    if (!auth.currentUser) return;
    
    const liquidationId = `FULL-PAY-${supplierName.replace(/\s+/g, '-')}-${Date.now()}`;
    const oneMinuteAgo = Date.now() - 60000;
    const expRef = collection(db, 'expenses');
    const q = query(
      expRef,
      where('userId', '==', auth.currentUser.uid),
      where('concept', '==', `Liquidación Total: ${supplierName}`),
      where('timestamp', '>', oneMinuteAgo)
    );
    
    getDocs(q).then(recentDocs => {
      if (!recentDocs.empty) return;

      const batch = writeBatch(db);
      let totalPaid = 0;
      const now = Date.now();
      
      debts.forEach(debt => {
        if (!debt.isPaid) {
          const debtRef = doc(db, 'supplier_debts', debt.id);
          const amount = Number(debt.amount);
          totalPaid += amount;
          
          batch.update(debtRef, {
            amount: 0,
            isPaid: true,
            lastPaymentTimestamp: now,
            payments: arrayUnion({ amount, timestamp: now, method })
          });
        }
      });

      if (totalPaid > 0) {
        const expenseRef = doc(db, 'expenses', liquidationId);
        batch.set(expenseRef, {
          id: liquidationId,
          userId: auth.currentUser.uid,
          sessionId: sessionId || 'historical',
          concept: `Liquidación Total: ${supplierName}`,
          amount: totalPaid,
          category: 'Mercadería',
          paymentMethod: method,
          timestamp: now
        });

        batch.commit().catch(async () => {
          errorEmitter.emit('permission-error', new FirestorePermissionError({
            path: expenseRef.path,
            operation: 'create',
            requestResourceData: { totalPaid }
          }));
        });
      }
    }).catch(async () => {
      errorEmitter.emit('permission-error', new FirestorePermissionError({
        path: expRef.path,
        operation: 'list'
      }));
    });
  }, [db, auth]);

  const activateVipKey = useCallback(async (key: string) => {
    if (!auth.currentUser) return { success: false, message: "No hay sesión activa." };
    const userRef = doc(db, 'users', auth.currentUser.uid);
    const cleanKey = key.trim().toUpperCase();

    // Obtener el perfil actual para saber cuánto tiempo le queda
    const userSnap = await getDoc(userRef);
    const userData = userSnap.data() as UserProfile | undefined;
    const currentVipUntil = userData?.vipUntil || 0;
    const now = Date.now();
    
    // Punto de partida base: Si ya es VIP, sumamos a partir de su expiración. Si no, a partir de ahora.
    const baseTimestamp = currentVipUntil > now ? currentVipUntil : now;
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    
    // LLAVE MAESTRA DESARROLLADOR (100 años acumulativos no tienen mucho sentido pero lo hace más robusto)
    if (cleanKey === 'DEVELOPERDOSPASOS') {
      updateDocumentNonBlocking(userRef, { role: 'admin', vipUntil: baseTimestamp + (100 * 365 * 24 * 60 * 60 * 1000) });
      return { success: true, message: "Modo Desarrollador Activado." };
    }

    // LLAVE FIJA 30 DIAS
    if (cleanKey === 'MARKETFLOW30' || cleanKey === 'MARKET30VIP') {
      updateDocumentNonBlocking(userRef, { vipUntil: baseTimestamp + thirtyDaysMs });
      return { success: true, message: "Membresía VIP extendida por 30 días." };
    }

    // PROTOCOLO DE VALIDACION DE LLAVES GENERADAS (Patrón XXXX-XXXX-XXXX)
    const isGeneratedKeyPattern = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(cleanKey);
    if (isGeneratedKeyPattern) {
      updateDocumentNonBlocking(userRef, { vipUntil: baseTimestamp + thirtyDaysMs });
      return { success: true, message: "Llave de cortesía activada. Se agregaron 30 días." };
    }

    return { success: false, message: "Llave inválida o expirada." };
  }, [db, auth]);

  const generateVipKey = useCallback(async () => {
    return Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + 
           Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + 
           Math.random().toString(36).substring(2, 6).toUpperCase();
  }, []);

  const grantAdminRole = useCallback(async (userId: string) => {
    const userRef = doc(db, 'users', userId);
    updateDocumentNonBlocking(userRef, { role: 'admin' });
  }, [db]);

  const toggleUserBlock = useCallback((userId: string, currentStatus: boolean) => {
    const docRef = doc(db, 'users', userId);
    updateDocumentNonBlocking(docRef, { isBlocked: !currentStatus });
  }, [db]);

  const extendUserVip = useCallback(async (userId: string, days: number = 30) => {
    const userRef = doc(db, 'users', userId);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) return;
    
    const userData = userSnap.data() as UserProfile;
    const now = Date.now();
    const currentVipUntil = userData.vipUntil || 0;
    const base = currentVipUntil > now ? currentVipUntil : now;
    const duration = days * 24 * 60 * 60 * 1000;
    
    updateDocumentNonBlocking(userRef, { vipUntil: base + duration });
  }, [db]);

  return {
    addCustomer,
    deleteCustomer,
    addMeatFolder,
    deleteMeatFolder,
    addProduct,
    updateProduct,
    deleteProduct,
    startSession,
    closeSession,
    syncShiftTotals,
    triggerMasterCloudSync,
    triggerMasterPurchaseCleanup,
    addSale,
    deleteSale,
    updateSalePaymentMethod,
    registerSalePartialPayment,
    registerFullCustomerPayment,
    registerCascadingPayment,
    addPurchase,
    deletePurchase,
    addExpense,
    deleteExpense,
    addSupplierDebt,
    deleteSupplierDebt,
    updateSupplierDebt,
    deleteSupplierFolder,
    renameSupplier,
    updateSupplierDebtStatus,
    registerSupplierPayment,
    registerSupplierCascadingPayment,
    registerSupplierFullPayment,
    activateVipKey,
    generateVipKey,
    grantAdminRole,
    toggleUserBlock,
    extendUserVip
  };
}
