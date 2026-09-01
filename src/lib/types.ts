
export type Category = 'Repuestos' | 'Aceites' | 'Accesorios' | 'Químicos' | 'Herramientas' | 'Otros';

export type PaymentMethod = 'Efectivo' | 'Transferencia' | 'Tarjeta' | 'Fiado';

export interface DailyQuest {
  id: string;
  type: 'SALES_COUNT' | 'REVENUE_GOAL' | 'ITEM_COUNT';
  description: string;
  target: number;
  current: number;
  isCompleted: boolean;
}

export interface UserProfile {
  id: string;
  uid: string;
  name: string;
  email: string;
  password?: string;
  role: 'admin' | 'user';
  isBlocked: boolean;
  vipUntil?: number;
  currentStreak?: number;
  maxStreak?: number;
  lastSaleDate?: string; // Formato YYYY-MM-DD
  dailyQuests?: DailyQuest[];
  createdAt: number;
}

export interface Customer {
  id: string;
  userId: string;
  name: string;
  phone?: string;
  notes?: string;
  createdAt: number;
}

export interface MeatFolder {
  id: string;
  userId: string;
  name: string;
  createdAt: number;
}

export interface Product {
  id: string;
  userId: string;
  name: string;
  description: string;
  category: Category;
  codigoBarras: string;
  isVariablePrice: boolean;
  precioCosto: number;
  precioVenta: number;
  stock: number;
  minStock: number;
  porcentajeMerma?: number; // Porcentaje de pérdida operativa
  packageQuantity?: number;
  packageCost?: number;
  updatedAt: number;
}

export interface SaleItem {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  buyPrice: number;
  total: number;
}

export interface ExtraCharge {
  id?: string;
  name: string;
  amount: number;
  isBalanza?: boolean;
  isFiado?: boolean;
  meatFolderId?: string;
  productId?: string; // ID del producto para descuento de stock
  quantity?: number;  // Cantidad en KG para descuento de stock
}

export interface Sale {
  id: string;
  userId: string;
  items: SaleItem[];
  extraCharges: ExtraCharge[];
  total: number;
  initialTotal?: number;
  timestamp: number;
  sessionId: string;
  cashierId: string;
  customerId?: string;
  customerName?: string;
  paymentMethod: PaymentMethod;
  isAbono?: boolean;
}

export interface Purchase {
  id: string;
  userId: string;
  supplierName: string;
  items: { productId: string; name: string; quantity: number; cost: number }[];
  total: number;
  timestamp: number;
  sessionId?: string;
  paymentType?: 'paid' | 'debt';
}

export interface Expense {
  id: string;
  userId: string;
  concept: string;
  amount: number;
  category: string;
  paymentMethod?: PaymentMethod;
  timestamp: number;
  sessionId?: string;
}

export interface DebtPayment {
  amount: number;
  timestamp: number;
  method: string;
}

export interface SupplierDebt {
  id: string;
  userId: string;
  supplierName: string;
  amount: number;
  initialAmount?: number;
  notes: string;
  isPaid: boolean;
  timestamp: number;
  payments?: DebtPayment[];
  lastPaymentId?: string;
  lastPaymentTimestamp?: number;
}

export interface CashSession {
  id: string;
  userId: string;
  cashierId: string;
  cashierName: string;
  startDateTime: string;
  endDateTime?: string;
  timestamp: number;
  initialBalance: number;
  finalBalance?: number;
  totalSalesAmount: number;
  isClosed: boolean;
  lastManualSync?: number;
}
