
import { GoogleGenAI } from "@google/genai";

// Fixed: Always use direct process.env.API_KEY for initialization as per guidelines
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export async function getBusinessInsights(salesData: string) {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Analise estes dados de vendas e forneça 3 insights rápidos em português para o dono do restaurante: ${salesData}. Formate como uma lista.`,
      config: {
        maxOutputTokens: 200,
        thinkingConfig: { thinkingBudget: 0 }
      }
    });
    // Property .text is used correctly (not a method)
    return response.text;
  } catch (error) {
    console.error("Gemini Error:", error);
    return "Não foi possível gerar insights no momento.";
  }
}

export async function generateProductDescription(productName: string) {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `Crie uma descrição curta e apetitosa em português para um prato chamado "${productName}" em um sistema de delivery.`,
    });
    // Property .text is used correctly (not a method)
    return response.text;
  } catch (error) {
    return "Descrição padrão para o produto.";
  }
}
