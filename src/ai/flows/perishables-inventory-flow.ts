
'use server';
/**
 * @fileOverview Especialista en Perecederos - Protocolo de Ahorro.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const PerishablesAlertInputSchema = z.object({
  productName: z.string(),
  currentStockKg: z.number(),
  minStockKg: z.number(),
  portionSizeGr: z.number().default(200),
});

const PerishablesAlertOutputSchema = z.object({
  message: z.string(),
  isCritical: z.boolean(),
  estimatedPortions: z.number(),
});

export async function getPerishablesAlert(input: z.infer<typeof PerishablesAlertInputSchema>) {
  return perishablesInventoryFlow(input);
}

const perishablesInventoryFlow = ai.defineFlow(
  {
    name: 'perishablesInventoryFlow',
    inputSchema: PerishablesAlertInputSchema,
    outputSchema: PerishablesAlertOutputSchema,
  },
  async (input) => {
    const {output} = await ai.generate({
      prompt: `Rol: Asistente de Eficiencia de Recursos. 
      Tarea: Alerta atómica de perecederos.
      
      Datos: ${input.productName} | Stock: ${input.currentStockKg}kg | Min: ${input.minStockKg}kg.
      
      Regla: Responde solo la alerta. "⚠️ [Nombre]: Debajo del mínimo. ~[X] porciones de ${input.portionSizeGr}gr."
      Sin introducciones.`,
      output: { schema: PerishablesAlertOutputSchema }
    });

    if (!output) throw new Error('No output');
    return output;
  }
);
