'use server';
/**
 * @fileOverview Scale Calculator - Protocolo de Ahorro.
 * Flujo puro: recibe lista de productos y comando para calcular pesables sin consultar DB en servidor.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ScaleCalculatorInputSchema = z.object({
  command: z.string(),
  availableProducts: z.array(z.object({
    id: z.string(),
    name: z.string(),
    price: z.number()
  })),
});

const ScaleCalculatorOutputSchema = z.object({
  productName: z.string(),
  productId: z.string(),
  pricePerKg: z.number(),
  weightGr: z.number(),
  totalPrice: z.number(),
  message: z.string(),
  found: z.boolean(),
});

export async function processScaleCommand(input: { command: string, availableProducts: {id: string, name: string, price: number}[] }) {
  return scaleCalculatorFlow(input);
}

const scaleCalculatorFlow = ai.defineFlow(
  {
    name: 'scaleCalculatorFlow',
    inputSchema: ScaleCalculatorInputSchema,
    outputSchema: ScaleCalculatorOutputSchema,
  },
  async (input) => {
    const {output} = await ai.generate({
      prompt: `Rol: Asistente de Eficiencia (Cálculo de Pesables).
      Analiza el comando: "${input.command}"
      
      Lista de productos disponibles (Nombre, ID, Precio x KG):
      {{#each availableProducts}}
      - {{name}} | ID: {{id}} | Precio: ${{price}}
      {{/each}}
      
      Protocolo: 
      1. Identifica qué producto de la lista se menciona en el comando del usuario.
      2. Calcula el total basándote en su precio por kilo y el peso (gramos) o monto ($) indicado en el comando.
      3. Solo datos numéricos y mensaje atómico: "🧀 [Nombre] | $[PrecioKg]kg | [Gramos]gr | Total: $[Resultado]"
      4. Si no encuentras una coincidencia clara en la lista, establece found como false.
      5. Sin introducciones amables.`,
      output: { schema: ScaleCalculatorOutputSchema }
    });

    if (!output) throw new Error('Error en procesamiento de comando.');
    return output;
  }
);
