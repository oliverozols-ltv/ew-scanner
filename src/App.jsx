import { useState, useEffect } from "react";

function App() {
  const [races, setRaces] = useState([]);

  const loadData = async () => {
    const res = await fetch("/api/races");
    const data = await res.json();
    setRaces(data);
  };

  useEffect(() => {
    loadData();
  }, []);

  return (
    <div style={{ padding: "40px", fontFamily: "Arial" }}>
      <h1>Each-Way Value Scanner</h1>

      <button
        onClick={loadData}
        style={{ marginBottom: "20px", padding: "10px 20px" }}
      >
        Refresh Data
      </button>

      <table border="1" cellPadding="10">
  <thead>
    <tr>
      <th>Race</th>
      <th>Horse</th>
      <th>Win Odds</th>
      <th>Place Terms</th>
      <th>Lay Win</th>
      <th>Lay Place</th>
      <th>EV</th>
    </tr>
  </thead>
  <tbody>
    {races.map((r, i) => (
      <tr key={i}>
        <td>{r.race}</td>
        <td>{r.horse}</td>
        <td>{r.winOdds}</td>
        <td>{`${r.placeFraction} x ${r.placesPaid}`}</td>
        <td>{r.layWin}</td>
        <td>{r.layPlace}</td>
        <td>{r.ev}</td>
      </tr>
    ))}
  </tbody>
</table>

    </div>
  );
}

export default App;

