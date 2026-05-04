import fs from "fs";
import path from "path";

// -----------------------------
// Load local racecards JSON
// -----------------------------
function loadRacecards() {
  const filePath = path.join(process.cwd(), "data", "racecards_today.json");
  const raw = fs.readFileSync(filePath, "utf8");
  const json = JSON.parse(raw);
  return json.racecards || [];
}

// -----------------------------
// Normalise strings for matching
// -----------------------------
function norm(str) {
  return str
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9 ]/g, "") // remove punctuation
    .trim();
}

// -----------------------------
// Fetch Betfair market catalogue (WIN + PLACE)
// -----------------------------
async function fetchMarketCatalogue() {
  const url = "https://api.betfair.com/exchange/readonly/v1/listMarketCatalogue";

  const body = {
    filter: {
      eventTypeIds: ["7"], // horse racing
      marketTypeCodes: ["WIN", "PLACE"]
    },
    maxResults: 300,
    marketProjection: ["RUNNER_DESCRIPTION", "MARKET_START_TIME", "EVENT"]
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const text = await res.text();
  if (text.startsWith("<")) return [];

  const data = JSON.parse(text);
  return data.result || [];
}

// -----------------------------
// Fetch prices for a single marketId
// -----------------------------
async function fetchMarketBook(marketId) {
  const url = "https://api.betfair.com/exchange/readonly/v1/listMarketBook";

  const body = {
    marketIds: [marketId],
    priceProjection: {
      priceData: ["EX_BEST_OFFERS"]
    }
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  const text = await res.text();
  if (text.startsWith("<")) return null;

  const data = JSON.parse(text);
  return data.result?.[0] || null;
}

// -----------------------------
// Match Betfair market to race
// -----------------------------
function matchMarketToRace(markets, race) {
  const course = norm(race.course);
  const offDt = new Date(race.off_dt);
  const offUtc = offDt.toISOString().substring(0, 16); // "YYYY-MM-DDTHH:MM"

  return markets.find(m => {
    if (!m.event || !m.marketStartTime) return false;

    const venue = norm(m.event.venue || "");
    const mTime = m.marketStartTime.substring(0, 16);

    const courseMatch = venue.includes(course);
    const timeMatch =
      mTime === offUtc ||
      mTime.endsWith(race.off_time.padStart(5, "0"));

    return courseMatch && timeMatch;
  });
}

// -----------------------------
// Match runner to selectionId
// -----------------------------
function matchRunner(market, horseName) {
  if (!market || !market.runners) return null;

  const target = norm(horseName);

  return market.runners.find(r => {
    const rn = norm(r.runnerName || "");
    return rn.includes(target) || target.includes(rn);
  });
}

// -----------------------------
// Extract lay price
// -----------------------------
function getLayPrice(runner) {
  if (!runner || !runner.ex || !runner.ex.availableToLay) return null;
  return runner.ex.availableToLay[0]?.price || null;
}

// -----------------------------
// MAIN HANDLER
// -----------------------------
export default async function handler(req, res) {
  try {
    const racecards = loadRacecards();

    // Only GB + IE races
    const gbIeRaces = racecards.filter(
      r => r.region === "GB" || r.region === "IE"
    );

    if (!gbIeRaces.length) {
      return res.status(200).json([]);
    }

    // Fetch Betfair catalogue
    const catalogue = await fetchMarketCatalogue();

    // Split into WIN + PLACE
    const winMarkets = catalogue.filter(m => m.marketName === "Win");
    const placeMarkets = catalogue.filter(m => m.marketName === "Place");

    const rows = [];

    for (const race of gbIeRaces) {
      const winMarket = matchMarketToRace(winMarkets, race);
      const placeMarket = matchMarketToRace(placeMarkets, race);

      // Fetch prices only for matched markets
      const winBook = winMarket ? await fetchMarketBook(winMarket.marketId) : null;
      const placeBook = placeMarket ? await fetchMarketBook(placeMarket.marketId) : null;

      for (const runner of race.runners) {
        const horseName = runner.horse;

        let layWin = null;
        let layPlace = null;

        if (winBook) {
          const matched = matchRunner(winBook, horseName);
          layWin = getLayPrice(matched);
        }

        if (placeBook) {
          const matched = matchRunner(placeBook, horseName);
          layPlace = getLayPrice(matched);
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
