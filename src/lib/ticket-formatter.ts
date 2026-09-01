
import { Sale, SaleItem, ExtraCharge, SupplierDebt, Customer } from './types';
import { format } from 'date-fns';

/**
 * Formatea una venta para coincidir exactamente con la captura de referencia.
 * Estilo: ASCII Atómico con separadores '|'.
 * Ancho total: 23 caracteres.
 */
export function formatSaleTicket(sale: Sale): string {
  const TICKET_WIDTH = 23;

  const norm = (text: string) => 
    text.normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\x00-\x7F]/g, "")
        .toUpperCase();

  const lines: string[] = [];

  // Encabezado
  lines.push("=".repeat(TICKET_WIDTH));
  lines.push(`FECHA:${format(sale.timestamp, 'dd/MM/yy HH:mm')}`);
  lines.push(`ID:#${sale.id.slice(-7).toUpperCase()}`);
  lines.push(`PAGO:${norm(sale.paymentMethod)}`);
  
  lines.push("-".repeat(TICKET_WIDTH));
  lines.push("CAN|PRODUCTO     |SUB");
  lines.push("-".repeat(TICKET_WIDTH));

  // Items de venta
  if (sale.items && sale.items.length > 0) {
    sale.items.forEach((item: SaleItem) => {
      // CAN (3 chars)
      const qty = item.quantity < 1 
        ? (item.quantity * 1000).toFixed(0).substring(0, 3).padEnd(3) 
        : item.quantity.toFixed(0).substring(0, 3).padEnd(3);
      
      // PRODUCTO (13 chars)
      const name = norm(item.name).padEnd(13).substring(0, 13);
      
      // SUBTOT (4 chars o lo que reste)
      const sub = item.total.toFixed(0).padStart(4).substring(0, 4);
      
      lines.push(`${qty}|${name}|${sub}`);
    });
  }

  // Cargos Extra
  if (sale.extraCharges && sale.extraCharges.length > 0) {
    sale.extraCharges.forEach((charge: ExtraCharge) => {
      const qty = "1  ";
      const name = norm(charge.name || "CARGO EXTRA").padEnd(13).substring(0, 13);
      const sub = charge.amount.toFixed(0).padStart(4).substring(0, 4);
      lines.push(`${qty}|${name}|${sub}`);
    });
  }

  lines.push("-".repeat(TICKET_WIDTH));
  
  // Total
  const totalVal = sale.total.toFixed(2);
  lines.push(`TOTAL: ARS $ ${totalVal}`);
  lines.push("=".repeat(TICKET_WIDTH));
  lines.push("");

  return lines.join("\n");
}

/**
 * Formatea un comprobante de estado de cuenta de proveedor.
 */
export function formatSupplierPaymentReceipt(debt: SupplierDebt): string {
  const TICKET_WIDTH = 23;
  const norm = (text: string) => text.toUpperCase();
  const lines: string[] = [];

  lines.push("=".repeat(TICKET_WIDTH));
  lines.push(norm("ESTADO PROVEEDOR"));
  lines.push("-".repeat(TICKET_WIDTH));
  lines.push(`FECHA:${format(Date.now(), 'dd/MM/yy HH:mm')}`);
  lines.push(`PROV:${norm(debt.supplierName).substring(0, 17)}`);
  lines.push("-".repeat(TICKET_WIDTH));
  
  lines.push(`INICIAL: $ ${(debt.initialAmount || debt.amount).toFixed(2)}`);
  lines.push(`PENDIENTE: $ ${debt.amount.toFixed(2)}`);
  lines.push("-".repeat(TICKET_WIDTH));
  lines.push(norm(debt.isPaid ? "LIQUIDADO" : "PENDIENTE"));
  lines.push("=".repeat(TICKET_WIDTH));
  lines.push("");

  return lines.join("\n");
}

/**
 * Formatea un resumen de productos fiados para una carpeta de cliente.
 */
export function formatCustomerDebtTicket(customer: Customer, sales: Sale[]): string {
  const TICKET_WIDTH = 23;
  const norm = (text: string) => 
    text.normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^\x00-\x7F]/g, "")
        .toUpperCase();

  const lines: string[] = [];
  lines.push("=".repeat(TICKET_WIDTH));
  lines.push(norm("RESUMEN FIADOS"));
  lines.push(`CLI:${norm(customer.name).substring(0, 18)}`);
  lines.push("-".repeat(TICKET_WIDTH));
  lines.push(`FECHA:${format(Date.now(), 'dd/MM/yy HH:mm')}`);
  lines.push("-".repeat(TICKET_WIDTH));

  const consolidatedItems: Record<string, { quantity: number, total: number }> = {};
  let grandTotal = 0;

  sales.forEach(sale => {
    if (sale.paymentMethod === 'Fiado') {
      grandTotal += sale.total;
      (sale.items || []).forEach(item => {
        if (!consolidatedItems[item.name]) consolidatedItems[item.name] = { quantity: 0, total: 0 };
        consolidatedItems[item.name].quantity += item.quantity;
        consolidatedItems[item.name].total += item.total;
      });
      (sale.extraCharges || []).forEach(charge => {
        const name = charge.name || 'CARGO';
        if (!consolidatedItems[name]) consolidatedItems[name] = { quantity: 0, total: 0 };
        consolidatedItems[name].quantity += 1;
        consolidatedItems[name].total += charge.amount;
      });
    }
  });

  lines.push("CAN|PRODUCTO     |TOT");
  lines.push("-".repeat(TICKET_WIDTH));

  Object.entries(consolidatedItems).forEach(([name, data]) => {
    const qty = data.quantity.toFixed(0).substring(0, 3).padEnd(3);
    const pName = norm(name).padEnd(13).substring(0, 13);
    const sub = data.total.toFixed(0).padStart(4).substring(0, 4);
    lines.push(`${qty}|${pName}|${sub}`);
  });

  lines.push("-".repeat(TICKET_WIDTH));
  lines.push(`DEUDA: ARS $ ${grandTotal.toFixed(2)}`);
  lines.push("=".repeat(TICKET_WIDTH));
  lines.push("");

  return lines.join("\n");
}

export function downloadTicketTxt(sale: Sale) {
  const content = formatSaleTicket(sale);
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `TICKET-${sale.id.slice(-6).toUpperCase()}.TXT`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadSupplierPaymentTxt(debt: SupplierDebt) {
  const content = formatSupplierPaymentReceipt(debt);
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `ESTADO-${debt.supplierName.toUpperCase().replace(/\s+/g, '-')}-${debt.id.slice(-4)}.TXT`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadCustomerDebtTxt(customer: Customer, sales: Sale[]) {
  const content = formatCustomerDebtTicket(customer, sales);
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `RESUMEN-${customer.name.toUpperCase().replace(/\s+/g, '-')}.TXT`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
