import fs from "fs";
import path from "path";

// -----------------------------
// Load local racecards JSON (today)
// -----------------------------
function loadRacecards() {
  const filePath = path.join(process.cwd(), "data", "racecards_today.json");
  const raw = fs.readFileSync(filePath, "utf8");
  const json = JSON.parse(raw);
  return json.racecards || [];
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
// Betfair JSON-RPC: get UK/IRE WIN markets
// -----------------------------
async function getBetfairMarkets() {
  const url = "https://api.betfair.com/exchange/betting/json-rpc/v1";

  const body = {
    jsonrpc: "2.0",
    method: "SportsAPING/v1.0/listMarketCatalogue",
    params: {
      filter: {
        eventTypeIds: ["7"],
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
  const offTime = race.off_time; // e.g. "3:35"

  return betfairMarkets.find(m => {
    const mCourse = m.event?.venue?.toLowerCase() || "";
    const mTime = m.marketStartTime?.substring(11, 16) || ""; // "HH:MM"
    return mCourse.includes(course) && mTime.endsWith(offTime.split(":")[1]);
  });
}

// -----------------------------
// MAIN HANDLER — TODAY FROM LOCAL FILE
// -----------------------------
export default async function handler(req, res) {
  try {
    const racecards = loadRacecards();

    // GB + IE only
    const gbIeRaces = racecards.filter(
      r => r.region === "GB" || r.region === "IE"
    );

    if (!gbIeRaces.length) {
      return res.status(200).json([]);
    }

    const betfairMarkets = await getBetfairMarkets();

// DEBUG: print one market to Vercel logs
console.log("BETFAIR MARKET SAMPLE:", JSON.stringify(betfairMarkets[0], null, 2));

    const rows = [];

    for (const race of gbIeRaces) {
      const betfairMarket = findMatchingMarket(betfairMarkets, race);

      for (const runner of race.runners) {
        const horseName = runner.horse;
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
          race: `${race.course} ${race.off_time}`,
          horse: horseName,
          winOdds: null,
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
    console.error("REAL API ERROR:", err);
    res.status(500).json({
      error: "Failed to load real data",
      details: err.message
    });
  }
}
