import fs from "fs";
import path from "path";

// -----------------------------
// Load local racecards JSON (TheRacingAPI download)
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
  return (str || "")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "") // accents
    .replace(/[^a-z0-9 ]/g, "") // punctuation
    .trim();
}

// -----------------------------
// BETFAIR JSON-RPC CORE
// -----------------------------
async function betfairRequest(method, params) {
  const url = "https://api.betfair.com/exchange/betting/json-rpc/v1";

  const body = {
    jsonrpc: "2.0",
    method: `SportsAPING/v1.0/${method}`,
    params,
    id: 1
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "X-Application": process.env.BETFAIR_APP_KEY,
      "X-Authentication": process.env.BETFAIR_SESSION_TOKEN,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const text = await res.text();

  // If Betfair returns HTML, session token is invalid/expired
  if (text.startsWith("<")) {
    console.error("BETFAIR HTML ERROR:", text.slice(0, 200));
    throw new Error("Betfair returned HTML (check session token)");
  }

  const json = JSON.parse(text);

  if (json.error) {
    console.error("BETFAIR API ERROR:", json.error);
    throw new Error(json.error.data?.APINGException?.errorCode || "Betfair API error");
  }

  return json.result;
}

// -----------------------------
// Fetch Betfair WIN + PLACE market catalogue (GB + IE)
// -----------------------------
async function getBetfairCatalogue() {
  return await betfairRequest("listMarketCatalogue", {
    filter: {
      eventTypeIds: ["7"], // horse racing
      marketTypeCodes: ["WIN", "PLACE"],
      marketCountries: ["GB", "IE"]
    },
    maxResults: 400,
    marketProjection: [
      "RUNNER_DESCRIPTION",
      "MARKET_START_TIME",
      "EVENT"
    ]
  });
}

// -----------------------------
// Fetch Betfair prices for a single market
// -----------------------------
async function getBetfairPrices(marketId) {
  const result = await betfairRequest("listMarketBook", {
    marketIds: [marketId],
    priceProjection: {
      priceData: ["EX_BEST_OFFERS"]
    }
  });

  return result && result.length ? result[0] : null;
}

// -----------------------------
// Match Betfair market to race (course + time)
// -----------------------------
function matchMarketToRace(markets, race) {
  const course = norm(race.course);
  const offDt = new Date(race.off_dt); // includes offset
  const offUtc = offDt.toISOString().substring(0, 16); // "YYYY-MM-DDTHH:MM"
  const offTimePadded = race.off_time.padStart(5, "0"); // "2:15" -> "02:15"

  return markets.find(m => {
    if (!m.event || !m.marketStartTime) return false;

    const venue = norm(m.event.venue || "");
    const mTime = m.marketStartTime.substring(0, 16); // UTC

    const courseMatch = venue.includes(course);
    const timeMatch =
      mTime === offUtc ||
      mTime.endsWith(offTimePadded);

    return courseMatch && timeMatch;
  });
}

// -----------------------------
// Match runner to selection in Betfair marketBook
// -----------------------------
function matchRunnerInBook(marketBook, horseName) {
  if (!marketBook || !marketBook.runners) return null;

  const target = norm(horseName);

  return marketBook.runners.find(r => {
    const rn = norm(r.runnerName || "");
    return rn.includes(target) || target.includes(rn);
  });
}

// -----------------------------
// Extract best lay price from Betfair runner
// -----------------------------
function getLayPrice(runner) {
  if (!runner || !runner.ex || !runner.ex.availableToLay) return null;
  return runner.ex.availableToLay[0]?.price || null;
}

// -----------------------------
// Fetch bookmaker odds from The Odds API (UK horse racing)
// -----------------------------
async function fetchBookmakerOdds() {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return [];

  const sport = "horse_racing_uk"; // The Odds API sport key for UK racing
  const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${apiKey}&regions=uk&markets=h2h&oddsFormat=decimal`;

  const res = await fetch(url);
  const text = await res.text();

  if (text.startsWith("<")) {
    console.error("ODDS API HTML ERROR:", text.slice(0, 200));
    return [];
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    console.error("ODDS API PARSE ERROR:", e, text.slice(0, 200));
    return [];
  }

  // data is an array of events
  return Array.isArray(data) ? data : [];
}

// -----------------------------
// Build a lookup: race -> event, runner -> best win odds
// (simple, pragmatic matching)
// -----------------------------
function buildBookmakerLookup(oddsEvents) {
  const byRace = new Map();

  for (const ev of oddsEvents) {
    const commence = ev.commence_time ? ev.commence_time.substring(0, 16) : null; // "YYYY-MM-DDTHH:MM"
    const nameNorm = norm(ev.home_team || ev.sport_title || ev.id || "");

    const key = `${commence}|${nameNorm}`;
    if (!byRace.has(key)) byRace.set(key, []);
    byRace.get(key).push(ev);
  }

  return {
    getBestWinOddsFor(race, horseName) {
      // Very rough: match by date/time only, then by runner name inside outcomes
      const offDt = new Date(race.off_dt);
      const offUtc = offDt.toISOString().substring(0, 16);

      const candidates = [];
      for (const [k, events] of byRace.entries()) {
        if (k.startsWith(offUtc)) {
          candidates.push(...events);
        }
      }

      if (!candidates.length) return null;

      const target = norm(horseName);
      let best = null;

      for (const ev of candidates) {
        if (!ev.bookmakers) continue;
        for (const b of ev.bookmakers) {
          if (!b.markets) continue;
          for (const m of b.markets) {
            if (m.key !== "h2h") continue;
            if (!m.outcomes) continue;
            for (const o of m.outcomes) {
              const on = norm(o.name || "");
              if (on.includes(target) || target.includes(on)) {
                const price = o.price;
                if (!best || price > best) best = price;
              }
            }
          }
        }
      }

      return best;
    }
  };
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

    // 1) Fetch Betfair catalogue (WIN + PLACE)
    const catalogue = await getBetfairCatalogue();

    const winMarkets = catalogue.filter(m => m.marketName === "Win");
    const placeMarkets = catalogue.filter(m => m.marketName === "Place");

    // 2) Fetch bookmaker odds from The Odds API
    const oddsEvents = await fetchBookmakerOdds();
    const bmLookup = buildBookmakerLookup(oddsEvents);

    const rows = [];

    for (const race of gbIeRaces) {
      const winMarket = matchMarketToRace(winMarkets, race);
      const placeMarket = matchMarketToRace(placeMarkets, race);

      const winBook = winMarket ? await getBetfairPrices(winMarket.marketId) : null;
      const placeBook = placeMarket ? await getBetfairPrices(placeMarket.marketId) : null;

      for (const runner of race.runners) {
        const horseName = runner.horse;

        // Betfair lay odds
        let layWin = null;
        let layPlace = null;

        if (winBook) {
          const matched = matchRunnerInBook(winBook, horseName);
          layWin = getLayPrice(matched);
        }

        if (placeBook) {
          const matched = matchRunnerInBook(placeBook, horseName);
          layPlace = getLayPrice(matched);
        }

        // Bookmaker win odds (best across bookies)
        const winOdds = bmLookup.getBestWinOddsFor(race, horseName);

        // TEMP: simple default EW terms until we wire real ones
        const placeFraction = 1 / 5;
        const placesPaid = 3;

        rows.push({
          race: `${race.course} ${race.off_time}`,
          horse: horseName,
          winOdds: winOdds || null,
          placeFraction,
          placesPaid,
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
