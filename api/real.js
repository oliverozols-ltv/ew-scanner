export default async function handler(req, res) {
  try {
    // 1. Fetch bookmaker odds (Odds API)
    const oddsRes = await fetch(
      `https://api.the-odds-api.com/v4/sports/horse_racing/odds/?apiKey=${process.env.ODDS_API_KEY}&regions=uk`
    );
    const oddsData = await oddsRes.json();

    // 2. Fetch Betfair Exchange odds (placeholder for now)
    const betfairLayWin = 5.4;
    const betfairLayPlace = 2.1;

    // 3. Build a simple race object
    const race = {
      race: "Example Race",
      horse: "Example Horse",
      winOdds: oddsData[0]?.bookmakers[0]?.markets[0]?.outcomes[0]?.price || 5.0,
      placeFraction: 1 / 5,
      placesPaid: 3,
      layWin: betfairLayWin,
      layPlace: betfairLayPlace,
      commission: 0.02
    };

    res.status(200).json([race]);
  } catch (err) {
    res.status(500).json({ error: "Failed to load real data", details: err });
  }
}
