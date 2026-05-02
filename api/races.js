export default function handler(req, res) {
  // Example race with real EV calculation
  const races = [
    {
      race: "3:15 Kempton",
      horse: "Thunder Strike",
      bookmakerOdds: 5.0,
      placeTerms: "1/5 3 places",
      exchangeLayOdds: 5.4,
      exchangeLayCommission: 0.02
    }
  ];

  const calculateEV = (race) => {
    const { bookmakerOdds, exchangeLayOdds, exchangeLayCommission } = race;

    // Win EV (simplified)
    const winEV = (1 / bookmakerOdds) - (1 / exchangeLayOdds);

    // Place EV (very simplified for now)
    const placeEV = (1 / (bookmakerOdds / 5)) - (1 / (exchangeLayOdds * 0.25));

    // Combined EV
    const totalEV = winEV + placeEV;

    return {
      ...race,
      ev: (totalEV * 100).toFixed(1) + "%"
    };
  };

  const output = races.map(calculateEV);

  res.status(200).json(output);
}

