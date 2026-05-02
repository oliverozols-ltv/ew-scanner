export default function handler(req, res) {
  const races = [
    {
      race: "3:15 Kempton",
      horse: "Thunder Strike",
      winOdds: 5.0,
      placeFraction: 1 / 5,
      placesPaid: 3,
      layWin: 5.4,
      layPlace: 2.1,
      commission: 0.02
    },
    {
      race: "4:05 Newbury",
      horse: "Golden Arrow",
      winOdds: 8.0,
      placeFraction: 1 / 4,
      placesPaid: 4,
      layWin: 8.6,
      layPlace: 3.0,
      commission: 0.02
    }
  ];

  const calculateEV = (r) => {
    const {
      winOdds,
      placeFraction,
      layWin,
      layPlace,
      commission
    } = r;

    // Win EV
    const winProb = 1 / winOdds;
    const layWinProb = 1 / layWin;
    const winEV = winProb - layWinProb * (1 - commission);

    // Place EV
    const placeOdds = winOdds * placeFraction;
    const placeProb = 1 / placeOdds;
    const layPlaceProb = 1 / layPlace;
    const placeEV = placeProb - layPlaceProb * (1 - commission);

    const totalEV = winEV + placeEV;

    return {
      ...r,
      ev: (totalEV * 100).toFixed(1) + "%"
    };
  };

  const output = races.map(calculateEV);

  res.status(200).json(output);
}

