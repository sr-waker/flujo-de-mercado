'use server';
/**
 * @fileOverview Auditor Contable de Integridad Financiera - Generador de Informes IA.
 * Este flujo ahora es puro: recibe el resumen técnico y redacta el informe.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const FinancialAuditorInputSchema = z.object({
  expectedNet: z.number(),
  netBalanceAudited: z.number(),
  difference: z.number(),
  duplicatesCount: z.number(),
  hasIssue: z.boolean(),
});

const FinancialAuditorOutputSchema = z.object({
  auditMessage: z.string().describe('Informe breve redactado por la IA sobre la salud de los datos'),
});

export async function runFinancialAudit(input: z.infer<typeof FinancialAuditorInputSchema>) {
  try {
    const {output} = await ai.generate({
      prompt: `IA Contable, he realizado un recuento por código:
      Total Dashboard: $${input.expectedNet}
      Total Real DB: $${input.netBalanceAudited}
      Diferencia: $${input.difference}
      Duplicados: ${input.duplicatesCount}
      ${input.hasIssue 
        ? "Redacta un informe breve de 'Fuga Financiera' y recomienda Sincronización Maestra."
        : "Informa que el sistema es íntegro."
      }
      IMPORTANTE: Responde en ESPAÑOL y sé muy breve.`,
      output: { schema: FinancialAuditorOutputSchema }
    });

    return {
      auditMessage: output?.auditMessage || `Diferencia de $${Math.abs(input.difference)}.`,
      status: input.hasIssue ? 'DISCREPANCIA' : 'CORRECTO',
      usingAi: true
    };
  } catch (e) {
    return {
      auditMessage: `MODO RESPALDO: Diferencia de $${Math.abs(input.difference)}.`,
      status: input.hasIssue ? 'DISCREPANCIA' : 'CORRECTO',
      usingAi: false
    };
  }
}
