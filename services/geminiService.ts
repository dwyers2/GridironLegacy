
import { PlayerStats, ManagerOwnershipData, ManagerTendency } from "../types";

const BACKEND_URL = ''; // Relative URL - Vite will proxy to localhost:3001

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

export const getManagerTendencies = async (
  managerData: ManagerOwnershipData[],
  options?: { targetManagerIds?: string[] }
): Promise<ManagerTendency[]> => {
  try {
    console.log('🤖 Requesting manager tendency analysis from Gemini...');

    const body: any = { managers: managerData };
    if (options?.targetManagerIds) body.targetManagerIds = options.targetManagerIds;

    const response = await fetch(`${BACKEND_URL}/api/manager-tendencies`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error('Failed to fetch manager tendencies from backend');
    }

    const result = await response.json();
    console.log('✅ Manager tendencies received');
    return result.tendencies;
  } catch (error) {
    console.error("Gemini Manager Tendencies Error:", error);

    // Fallback data
    return managerData.map(manager => ({
      managerId: manager.managerId,
      managerName: manager.managerName,
      analysis: "Analysis temporarily unavailable. This manager shows consistent patterns in player selection.",
      topPositions: ['QB', 'RB', 'WR'],
      loyaltyScore: 75
    }));
  }
};
