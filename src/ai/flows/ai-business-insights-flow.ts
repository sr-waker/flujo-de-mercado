
'use server';
/**
 * @fileOverview Consultor Financiero de MarketFlow - Business Insights Avanzados.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const AIBusinessInsightsInputSchema = z.object({
  currentMonth: z.object({
    name: z.string(),
    revenue: z.number(),
    expenses: z.number(),
    netProfit: z.number(),
  }),
  lastMonth: z.object({
    name: z.string(),
    revenue: z.number(),
    expenses: z.number(),
  }),
  lowStockProducts: z.array(z.string()),
});
export type AIBusinessInsightsInput = z.infer<typeof AIBusinessInsightsInputSchema>;

const AIBusinessInsightsOutputSchema = z.object({
  summary: z.string(),
  insights: z.array(z.string()),
  motivationalAdvice: z.string(),
  status: z.enum(['SALUDABLE', 'ALERTA', 'CRITICO']).optional(),
});
export type AIBusinessInsightsOutput = z.infer<typeof AIBusinessInsightsOutputSchema>;

export async function aiBusinessInsights(input: AIBusinessInsightsInput): Promise<AIBusinessInsightsOutput> {
  return aiBusinessInsightsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'aiBusinessInsightsPrompt',
  input: {schema: AIBusinessInsightsInputSchema},
  output: {schema: AIBusinessInsightsOutputSchema},
  prompt: `Rol: Consultor Financiero de MarketFlow.
Misión: Explicar la evolución de los gastos mensuales comparando el mes anterior vs. el actual.

Contexto del Negocio:
- Mes Anterior ({{{lastMonth.name}}}): Gastos de $ {{{lastMonth.expenses}}}. Nota: Podría no incluir stock.
- Mes Actual ({{{currentMonth.name}}}): Gastos de $ {{{currentMonth.expenses}}}. Nota: Ahora incluye reposición de stock (Registro Preciso).
- Ingresos Actuales: $ {{{currentMonth.revenue}}}.
- Balance Neto Actual: $ {{{currentMonth.netProfit}}}.

Instrucciones de Análisis:
1. Calcula la relación entre Ingresos Reales y Salidas de Caja del mes actual.
2. Si los gastos superan el 90% de los ingresos, incluye el encabezado "⚠️ MARGEN EN RIESGO" en el resumen.
3. El tono debe ser profesional y alentador.

Estructura de respuesta requerida:
- Summary: Explica que los gastos subieron porque ahora MarketFlow es más preciso al registrar compras de mercadería. Menciona que aunque el número rojo es mayor, el Balance Neto sigue siendo positivo (si lo es) y que es una reinversión.
- Insights: Genera 3 puntos estratégicos basados en los datos.
- MotivationalAdvice: Un mensaje corto para el dueño del negocio.

IMPORTANTE: Responde siempre en ESPAÑOL.`,
});

const aiBusinessInsightsFlow = ai.defineFlow(
  {
    name: 'aiBusinessInsightsFlow',
    inputSchema: AIBusinessInsightsInputSchema,
    outputSchema: AIBusinessInsightsOutputSchema,
  },
  async (input) => {
    const {output} = await prompt(input);
    if (!output) throw new Error('IA Error: No output');
    return output;
  }
);
