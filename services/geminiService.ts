import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

if (!process.env.API_KEY) {
  console.error("API_KEY environment variable not set.");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

export const generateSummaryFromText = async (
  fullPrompt: string,
  modelName: string
): Promise<string> => {
  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
        model: modelName,
        contents: fullPrompt,
    });
    
    return response.text;
  } catch (error) {
    console.error("Error generating summary from Gemini:", error);
    if (error instanceof Error) {
        return `Error during summary generation: ${error.message}`;
    }
    return "An unknown error occurred during summary generation.";
  }
};
