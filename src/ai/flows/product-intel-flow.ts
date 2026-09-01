'use server';
/**
 * @fileOverview Product Intel - Protocolo de Ahorro.
 * Flujo puro: sugiere metadatos de productos basados en el código de barras sin consultar DB en servidor.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ProductIntelInputSchema = z.object({
  barcode: z.string(),
  costPrice: z.number().optional(),
});

const ProductIntelOutputSchema = z.object({
  suggestedName: z.string(),
  suggestedCategory: z.enum(['Repuestos', 'Aceites', 'Accesorios', 'Químicos', 'Herramientas', 'Otros']),
  suggestedDescription: z.string(),
  suggestedSellPrice: z.number(),
  isStandardCode: z.boolean(),
  originCountry: z.string().optional(),
});

export async function getProductIntel(input: { barcode: string, costPrice?: number }) {
  return productIntelFlow(input);
}

const prompt = ai.definePrompt({
  name: 'productIntelPrompt',
  input: {schema: ProductIntelInputSchema},
  output: {schema: ProductIntelOutputSchema},
  prompt: `Rol: Asistente de Eficiencia de TallerFlow. 
Identifica el producto con barcode: {{{barcode}}}.

Protocolo: 
1. Sugiere datos atómicos del producto en ESPAÑOL (Nombre, Categoría, Descripción).
2. Si se proporciona costPrice: {{{costPrice}}}, calcula un precio de venta con un margen del 30%.
3. Categorías permitidas: Repuestos, Aceites, Accesorios, Químicos, Herramientas, Otros.
4. Indica el país de origen si el EAN-13 lo permite.`,
});

const productIntelFlow = ai.defineFlow(
  {
    name: 'productIntelFlow',
    inputSchema: ProductIntelInputSchema,
    outputSchema: ProductIntelOutputSchema,
  },
  async (input) => {
    const {output} = await prompt(input);
    if (!output) throw new Error('IA Error: No se pudo generar sugerencia.');
    return output;
  }
);
