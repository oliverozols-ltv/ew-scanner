import { useState, useEffect } from "react";
import "./styles.css";


function App() {
  // -----------------------------
  // STATE
  // -----------------------------
  const [races, setRaces] = useState([]);
  const [minEV, setMinEV] = useState(0);

  // Sorting state
  const [sortField, setSortField] = useState("ev");
  const [sortDirection, setSortDirection] = useState("desc");

  // -----------------------------
  // FILTERING
  // -----------------------------
  const filteredRaces = races.filter(
    (r) => parseFloat(r.ev) >= minEV
  );

  // -----------------------------
  // SORTING
  // -----------------------------
  const sortedRaces = [...filteredRaces].sort((a, b) => {
    const valA = parseFloat(a[sortField]);
    const valB = parseFloat(b[sortField]);

    if (sortDirection === "asc") return valA - valB;
    return valB - valA;
  });

  // -----------------------------
  // LOAD DATA FROM API
  // -----------------------------
  const loadData = async () => {
    const res = await fetch("/api/races");
    const data = await res.json();
    setRaces(data);
  };

  useEffect(() => {
    loadData();
  }, []);

  // -----------------------------
  // RENDER
  // -----------------------------
  return (
    <div className="container">

      <h1>Each-Way Value Scanner</h1>

      <button
        onClick={loadData}
        style={{ marginBottom: "20px", padding: "10px 20px" }}
      >
        Refresh Data
      </button>

      {/* Minimum EV Filter */}
      <div style={{ marginBottom: "20px" }}>
        <label>Minimum EV (%): </label>
        <input
          type="number"
          value={minEV}
          onChange={(e) => setMinEV(e.target.value)}
          style={{ width: "80px", marginLeft: "10px" }}
        />
      </div>

      <table border="1" cellPadding="10">
        <thead>
          <tr>
            <th onClick={() => setSortField("race")}>Race</th>
            <th onClick={() => setSortField("horse")}>Horse</th>
            <th onClick={() => setSortField("winOdds")}>Win Odds</th>
            <th>Place Terms</th>
            <th onClick={() => setSortField("layWin")}>Lay Win</th>
            <th onClick={() => setSortField("layPlace")}>Lay Place</th>
            <th
              onClick={() => {
                setSortField("ev");
                setSortDirection(
                  sortDirection === "asc" ? "desc" : "asc"
                );
              }}
            >
              EV
            </th>
          </tr>
        </thead>

        <tbody>
          {sortedRaces.map((r, i) => (
            <tr key={i}>
              <td>{r.race}</td>
              <td>{r.horse}</td>
              <td>{r.winOdds}</td>
              <td>{`${r.placeFraction} x ${r.placesPaid}`}</td>
              <td>{r.layWin}</td>
              <td>{r.layPlace}</td>
              <td>
                <span
                  className={
                    "ev-badge " +
                    (parseFloat(r.ev) > 0 ? "ev-positive" : "ev-negative")
                  }
                  >
                  {r.ev}
                </span>
              </td>

             
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default App;
