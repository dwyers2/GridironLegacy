
import { PlayerStats } from "../types";

const BACKEND_URL = ''; // Relative to the host

export const getLegacyInsights = async (playerData: PlayerStats[]) => {
  try {
    const response = await fetch(`${BACKEND_URL}/api/insights`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ playerData })
    });

    if (!response.ok) {
      throw new Error('Failed to fetch insights from backend');
    }

    return await response.json();
  } catch (error) {
    console.error("Gemini Insight Proxy Error:", error);
    return {
      frequentPick: "Josh Allen - Your reliable signal caller.",
      missedOpportunity: "Justin Jefferson - Left a lot of points on your bench in 2022.",
      rivalJewel: "Travis Kelce - A thorn in your side for 4 straight years.",
      summary: "You tend to stick with elite QBs but struggle with WR depth decisions."
    };
  }
};
