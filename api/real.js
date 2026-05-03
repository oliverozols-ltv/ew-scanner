// -----------------------------
// BETFAIR LAY ODDS FUNCTION
// -----------------------------
async function getBetfairLayOdds(marketId, selectionId) {
  const url = `https://api.betfair.com/exchange/betting/rest/v1.0/listMarketBook/`;

  // Betfair requires URL-encoded JSON for priceProjection
  const priceProjection = encodeURIComponent(
    JSON.stringify({ priceData: ["EX_BEST_OFFERS"] })
  );

  const fullUrl = `${url}?marketIds=${marketId}&priceProjection=${priceProjection}`;

  const res = await fetch(fullUrl, {
    method: "GET",
    headers: {
      "X-Application": process.env.BETFAIR_APP_KEY,
      "X-Authentication": process.env.BETFAIR_SESSION_TOKEN,
      Accept: "application/json"
    }
  });

  // If Betfair returns HTML, this prevents JSON parse crash
  const text = await res.text();
  if (text.startsWith("<")) {
    throw new Error("Betfair returned HTML (session expired or headers invalid)");
  }

  const data = JSON.parse(text);

  const runner = data[0]?.runners?.find(r => r.selectionId === selectionId);

  const layWin = runner?.ex?.availableToLay?.[0]?.price || null;
  const layPlace = runner?.ex?.availableToLay?.[1]?.price || null;

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
