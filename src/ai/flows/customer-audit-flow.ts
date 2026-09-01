'use server';
/**
 * @fileOverview Auditor de Deudores y Fiados - Generador de Informes IA.
 * Este flujo ahora es puro: recibe el resumen técnico y redacta el informe.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const CustomerAuditInputSchema = z.object({
  expectedTotalDebt: z.number(),
  totalDebtCalculated: z.number(),
  difference: z.number(),
  duplicateCustomersCount: z.number(),
  duplicateSalesCount: z.number(),
  hasIssue: z.boolean(),
});

const CustomerAuditOutputSchema = z.object({
  auditMessage: z.string().describe('Informe breve redactado por la IA sobre la salud de los fiados'),
});

export async function runCustomerAudit(input: z.infer<typeof CustomerAuditInputSchema>) {
  try {
    const {output} = await ai.generate({
      prompt: `IA Contable, he realizado un recuento por código de los Fiados y encontré estos resultados:
      Total en Pantalla: $${input.expectedTotalDebt}
      Total Real en DB: $${input.totalDebtCalculated}
      Diferencia: $${input.difference}
      Carpetas Repetidas: ${input.duplicateCustomersCount}
      Tickets Duplicados: ${input.duplicateSalesCount}
      ${input.hasIssue 
        ? "Redacta un informe breve de 'Fuga en Fiados'. Explica que se encontraron discrepancias y que debe presionar el botón de Sincronización Maestra."
        : "Felicita al usuario indicando que su cartera es íntegra."
      }
      IMPORTANTE: Responde en ESPAÑOL y sé breve.`,
      output: { schema: CustomerAuditOutputSchema }
    });

    return {
      auditMessage: output?.auditMessage || `Se detectó una discrepancia de $${Math.abs(input.difference)}.`,
      status: input.hasIssue ? 'DISCREPANCIA' : 'CORRECTO',
      usingAi: true
    };
  } catch (e) {
    return {
      auditMessage: `MODO RESPALDO: Se detectó una discrepancia de $${Math.abs(input.difference)}.`,
      status: input.hasIssue ? 'DISCREPANCIA' : 'CORRECTO',
      usingAi: false
    };
  }
}
