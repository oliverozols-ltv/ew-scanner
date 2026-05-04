// -----------------------------
// Racing API: Basic Auth header
// -----------------------------
function getRacingApiAuthHeader() {
  const username = process.env.RACING_API_USERNAME;
  const password = process.env.RACING_API_PASSWORD;
  const token = Buffer.from(`${username}:${password}`).toString("base64");
  return `Basic ${token}`;
}

// -----------------------------
// Racing API: Fetch today's UK + IRE racecards
// -----------------------------
async function getRacingApiRacecards(date) {
  const url = `https://api.theracingapi.com/v1/racecards?date=${date}&region=GB,IE`;

  const res = await fetch(url, {
    headers: {
      Authorization: getRacingApiAuthHeader()
    }
  });

  if (!res.ok) {
    console.error("Racing API error:", await res.text());
    return [];
  }

  const data = await res.json();
  return data.races || [];
}

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
  if (text.startsWith("<")) return { layWin: null, layPlace: null };

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
        marketCountries: ["GB", "IE"],
        marketTypeCodes: ["WIN"]
      },
      maxResults: 300,
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
// Helper: match race → Betfair market by course + time
// -----------------------------
function findMatchingMarket(betfairMarkets, race) {
  const course = race.course?.toLowerCase() || "";
  const time = race.time?.substring(11, 16); // HH:MM

  return betfairMarkets.find(m => {
    const mCourse = m.event?.venue?.toLowerCase() || "";
    const mTime = m.marketStartTime?.substring(11, 16) || "";
    return mCourse.includes(course) && mTime === time;
  });
}

// -----------------------------
// MAIN HANDLER — TODAY'S RACES
// -----------------------------
export default async function handler(req, res) {
  try {
    // 1. Compute today's date (YYYY-MM-DD)
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const today = `${yyyy}-${mm}-${dd}`;

    // 2. Fetch racecards from Racing API
    const racecards = await getRacingApiRacecards(today);
    if (!racecards.length) {
      return res.status(200).json([]);
    }

    // 3. Fetch Betfair markets
    const betfairMarkets = await getBetfairMarkets();

    const rows = [];

    // 4. Loop through each race
    for (const race of racecards) {
      const betfairMarket = findMatchingMarket(betfairMarkets, race);

      for (const runner of race.runners) {
        const horseName = runner.name;

        let layWin = null;
        let layPlace = null;

        if (betfairMarket) {
          const matchedRunner = findMatchingRunner(betfairMarket, horseName);
          if (matchedRunner) {
            const layPrices = await getBetfairLayOdds(
              betfairMarket.marketId,
              matchedRunner.selectionId
            );
            layWin = layPrices.layWin;
            layPlace = layPrices.layPlace;
          }
        }

        rows.push({
          race: `${race.course} ${race.time.substring(11, 16)}`,
          horse: horseName,
          winOdds: null, // will fill from Odds API later
          placeFraction: 1 / 5,
          placesPaid: 3,
          layWin,
          layPlace,
          commission: 0.02
        });
      }
    }

    res.status(200).json(rows);
  } catch (err) {
    res.status(500).json({
      error: "Failed to load real data",
      details: err.message
    });
  }
}
