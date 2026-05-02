export default function handler(req, res) {
  const fakeData = [
    {
      race: "3:15 Kempton",
      horse: "Thunder Strike",
      bookmakerOdds: 5.0,
      exchangeLayOdds: 5.4,
      ev: "+12%"
    },
    {
      race: "4:05 Newbury",
      horse: "Golden Arrow",
      bookmakerOdds: 8.0,
      exchangeLayOdds: 8.6,
      ev: "+9%"
    }
  ];

  res.status(200).json(fakeData);
}
