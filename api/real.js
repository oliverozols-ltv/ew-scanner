// -----------------------------
// Betfair JSON-RPC: get market book (lay odds)
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

  // If Betfair ever returns HTML, avoid crashing
  if (text.startsWith("<")) {
    return { layWin: null, layPlace: null };
  }

  const data = JSON.parse(text);
  const market = data?.result?.[0];
  if (!market || !market.runners) return { layWin: null, layPlace: null };

  const runner = market.runners.find(r => r.selectionId === selectionId);
  if (!runner || !runner.ex || !runner.ex.availableToLay) {
    return { layWin: null, layPlace: null };
  }

  const layWin = runner.ex.availableToLay[0]?.price || null;
  const layPlace = runner.ex.availableToLay[1]?.price || null;

  return { layWin, layPlace };
}

// -----------------------------
// Betfair JSON-RPC: get UK horse racing WIN markets
// -----------------------------
async function getBetfairMarkets() {
  const url = "https://api.betfair.com/exchange/betting/json-rpc/v1";

  const body = {
    jsonrpc: "2.0",
    method: "SportsAPING/v1.0/listMarketCatalogue",
    params: {
      filter: {
        eventTypeIds: ["7"],        // Horse racing
        marketCountries: ["GB"],    // UK
        marketTypeCodes: ["WIN"]    // Win markets
      },
      maxResults: 200,
      marketProjection: ["RUNNER_DESCRIPTION", "MARKET_START_TIME", "EVENT"]
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
  if (text.startsWith("<")) return [];

  const data = JSON.parse(text);
  return data.result || [];
}

// -----------------------------
// Helper: fuzzy match horse name to Betfair runner
// -----------------------------
function findMatchingRunner(betfairMarket, horseName) {
  if (!betfairMarket?.runners) return null;
  const target = horseName.toLowerCase();
  return betfairMarket.runners.find(
    r => r.runnerName && r.runnerName.toLowerCase().includes(target)
  );
}

// -----------------------------
// Helper: naive match event → Betfair market by name
// -----------------------------
function findMatchingMarket(betfairMarkets, event) {
  const name =
    event.home_team ||
    event.away_team ||
    event.id ||
    "";

  if (!name) return null;

  const target = name.toLowerCase();

  return betfairMarkets.find(
    m =>
      m.event &&
      m.event.name &&
      m.event.name.toLowerCase().includes(target)
  );
}

// -----------------------------
// MAIN HANDLER
// -----------------------------
export default async function handler(req, res) {
  try {
    // 1. Compute tomorrow's date (YYYY-MM-DD)
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);

    const yyyy = tomorrow.getFullYear();
    const mm = String(tomorrow.getMonth() + 1).padStart(2, "0");
    const dd = String(tomorrow.getDate()).padStart(2, "0");

    const tomorrowDate = `${yyyy}-${mm}-${dd}`;

    // 2. Fetch bookmaker odds for tomorrow (UK horse racing)
    const oddsRes = await fetch(
      `https://api.the-odds-api.com/v4/sports/horse_racing/odds/?apiKey=${process.env.ODDS_API_KEY}&regions=uk&date=${tomorrowDate}`
    );

    const oddsData = await oddsRes.json();

    if (!Array.isArray(oddsData) || oddsData.length === 0) {
      return res.status(200).json([]);
    }

    // 3. Fetch Betfair markets (all UK WIN), then filter to tomorrow
    const allBetfairMarkets = await getBetfairMarkets();

    const betfairMarkets = allBetfairMarkets.filter(
      m => m.marketStartTime && m.marketStartTime.startsWith(tomorrowDate)
    );

    const races = [];

    // 4. Loop through all bookmaker races
    for (const event of oddsData) {
      const raceName = event.home_team || event.id || "Unknown Race";

      const bookmaker = event.bookmakers?.[0];
      if (!bookmaker || !bookmaker.markets || bookmaker.markets.length === 0) {
        continue;
      }

      const winMarket = bookmaker.markets[0];
      if (!winMarket.outcomes) continue;

      // Try to find matching Betfair market
      const betfairMarket = findMatchingMarket(betfairMarkets, event);

      for (const outcome of winMarket.outcomes) {
        const horseName = outcome.name;
        const winOdds = outcome.price;

        let layWin = null;
        let layPlace = null;

        if (betfairMarket) {
          const runner = findMatchingRunner(betfairMarket, horseName);
          if (runner) {
            const layPrices = await getBetfairLayOdds(
              betfairMarket.marketId,
              runner.selectionId
            );
            layWin = layPrices.layWin;
            layPlace = layPrices.layPlace;
          }
        }

        races.push({
          race: raceName,
          horse: horseName,
          winOdds,
          placeFraction: 1 / 5,
          placesPaid: 3,
          layWin,
          layPlace,
          commission: 0.02
        });
      }
    }

    res.status(200).json(races);
  } catch (err) {
    res.status(500).json({
      error: "Failed to load real data",
      details: err.message
    });
  }
}
