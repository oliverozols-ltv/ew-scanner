// -----------------------------
// BETFAIR LAY ODDS FUNCTION
// -----------------------------
async function getBetfairLayOdds(marketId, selectionId) {
  const url = "https://api.betfair.com/exchange/betting/json-rpc/v1";

  const body = {
    jsonrpc: "2.0",
    method: "SportsAPING/v1.0/listMarketBook",
    params: {
      marketIds: [marketId],
      priceProjection: {
        priceData: ["EX_BEST_OFFERS"]
      }
    },
    id: 1
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-Application": "1",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const text = await res.text();

  // If Betfair returns HTML, avoid crash
  if (text.startsWith("<")) {
    return { layWin: null, layPlace: null };
  }

  const data = JSON.parse(text);

  const market = data?.result?.[0];
  if (!market) return { layWin: null, layPlace: null };

  const runner = market.runners?.find(r => r.selectionId === selectionId);
  if (!runner) return { layWin: null, layPlace: null };

  const layWin = runner.ex?.availableToLay?.[0]?.price || null;
  const layPlace = runner.ex?.availableToLay?.[1]?.price || null;

  return { layWin, layPlace };
}



// -----------------------------
// MAIN HANDLER
// -----------------------------
export default async function handler(req, res) {
  try {
    // 1. Fetch bookmaker odds
    const oddsRes = await fetch(
      `https://api.the-odds-api.com/v4/sports/horse_racing/odds/?apiKey=${process.env.ODDS_API_KEY}&regions=uk`
    );

    const oddsData = await oddsRes.json();

    const winOdds =
      oddsData?.[0]?.bookmakers?.[0]?.markets?.[0]?.outcomes?.[0]?.price || 5.0;

    // 2. Fetch Betfair lay odds (TEMP IDs)
    const { layWin, layPlace } = await getBetfairLayOdds(
      "1.23456789", // TEMP marketId
      123456        // TEMP selectionId
    );

    // 3. Build race object
    const race = {
      race: "Example Race",
      horse: "Example Horse",
      winOdds: winOdds,
      placeFraction: 1 / 5,
      placesPaid: 3,
      layWin: layWin,
      layPlace: layPlace,
      commission: 0.02
    };

    res.status(200).json([race]);
  } catch (err) {
    res.status(500).json({
      error: "Failed to load real data",
      details: err.message
    });
  }
}
