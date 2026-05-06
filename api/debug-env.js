export default function handler(req, res) {
  res.json({
    hasToken: !!process.env.BETFAIR_SESSION_TOKEN_B64,
    tokenLength: process.env.BETFAIR_SESSION_TOKEN_B64?.length || 0
  });
}
