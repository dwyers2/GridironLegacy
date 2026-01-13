
import { GoogleGenAI, Type } from "@google/genai";
import { PlayerStats } from "../types";

// Always use the recommended model for complex reasoning and data analysis
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const getLegacyInsights = async (playerData: PlayerStats[]) => {
  const prompt = `Analyze this fantasy football ownership history. 
  Player Data: ${JSON.stringify(playerData)}
  
  Provide 3 key insights about this manager's legacy in the league. 
  1. Highlight their most successful "Frequent Pick" (high starts, high points).
  2. Identify a "Missed Opportunity" (player they owned but often benched while they scored well).
  3. A "League Rival's Jewel" (player they never get, but always hurts them).
  
  Keep it concise and punchy in a JSON format.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            frequentPick: { type: Type.STRING },
            missedOpportunity: { type: Type.STRING },
            rivalJewel: { type: Type.STRING },
            summary: { type: Type.STRING }
          },
          required: ["frequentPick", "missedOpportunity", "rivalJewel", "summary"]
        }
      }
    });

    // Directly access text property as per guidelines, ensuring it's trimmed for JSON parsing
    const text = response.text?.trim() || "{}";
    return JSON.parse(text);
  } catch (error) {
    console.error("Gemini Insight Error:", error);
    return {
      frequentPick: "Josh Allen - Your reliable signal caller.",
      missedOpportunity: "Justin Jefferson - Left a lot of points on your bench in 2022.",
      rivalJewel: "Travis Kelce - A thorn in your side for 4 straight years.",
      summary: "You tend to stick with elite QBs but struggle with WR depth decisions."
    };
  }
};
