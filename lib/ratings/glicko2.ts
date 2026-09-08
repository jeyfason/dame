// Pure Glicko-2 per Glickman (http://www.glicko.net/glicko/glicko2.pdf).
// tau 0.5, eps 1e-6, scale 173.7178 (400 / ln 10). No I/O, no deps.

export const GLICKO2_SCALE = 173.7178;
export const GLICKO2_TAU = 0.5;
export const GLICKO2_EPSILON = 1e-6;

export const DEFAULT_RATING = 1500;
export const DEFAULT_RD = 350;
export const DEFAULT_VOL = 0.06;

export interface Glicko2Rating {
  rating: number;
  rd: number;
  vol: number;
}

export interface Glicko2Opponent {
  rating: number;
  rd: number;
  /** 1 = win, 0.5 = draw, 0 = loss (from player's perspective). */
  score: number;
}

export function newPlayerRating(): Glicko2Rating {
  return { rating: DEFAULT_RATING, rd: DEFAULT_RD, vol: DEFAULT_VOL };
}

/** Step 3 of the paper: g(phi). */
export function g(phi: number): number {
  return 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
}

/** Step 3 of the paper: E(mu, mu_j, phi_j). */
export function expectedScore(mu: number, muJ: number, phiJ: number): number {
  return 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));
}

function updateVolatility(
  sigma: number,
  phi: number,
  v: number,
  delta: number,
): number {
  const a = Math.log(sigma * sigma);
  const f = (x: number): number => {
    const ex = Math.exp(x);
    const num = ex * (delta * delta - phi * phi - v - ex);
    const den = 2 * Math.pow(phi * phi + v + ex, 2);
    return num / den - (x - a) / (GLICKO2_TAU * GLICKO2_TAU);
  };

  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * GLICKO2_TAU) < 0) k++;
    B = a - k * GLICKO2_TAU;
  }

  let fA = f(A);
  let fB = f(B);
  while (Math.abs(B - A) > GLICKO2_EPSILON) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }
    B = C;
    fB = fC;
  }
  return Math.exp(A / 2);
}

/**
 * Rating-period update for one player against `opponents`.
 * Empty opponent list: rating/vol unchanged, RD grows by volatility
 * (paper's "not competing" case).
 */
export function updateRating(
  player: Glicko2Rating,
  opponents: Glicko2Opponent[],
): Glicko2Rating {
  const mu = (player.rating - DEFAULT_RATING) / GLICKO2_SCALE;
  const phi = player.rd / GLICKO2_SCALE;

  if (opponents.length === 0) {
    const phiStar = Math.sqrt(phi * phi + player.vol * player.vol);
    return { rating: player.rating, rd: phiStar * GLICKO2_SCALE, vol: player.vol };
  }

  const mus = opponents.map((o) => (o.rating - DEFAULT_RATING) / GLICKO2_SCALE);
  const phis = opponents.map((o) => o.rd / GLICKO2_SCALE);

  // Step 4: estimated variance.
  let vInv = 0;
  for (let j = 0; j < opponents.length; j++) {
    const E = expectedScore(mu, mus[j], phis[j]);
    const gj = g(phis[j]);
    vInv += gj * gj * E * (1 - E);
  }
  const v = 1 / vInv;

  // Step 5: estimated improvement.
  let sum = 0;
  for (let j = 0; j < opponents.length; j++) {
    sum += g(phis[j]) * (opponents[j].score - expectedScore(mu, mus[j], phis[j]));
  }
  const delta = v * sum;

  // Steps 5-6: new volatility, then phiStar.
  const volPrime = updateVolatility(player.vol, phi, v, delta);
  const phiStar = Math.sqrt(phi * phi + volPrime * volPrime);

  // Step 7: new phi and mu.
  const phiPrime = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muPrime = mu + phiPrime * phiPrime * sum;

  return {
    rating: GLICKO2_SCALE * muPrime + DEFAULT_RATING,
    rd: GLICKO2_SCALE * phiPrime,
    vol: volPrime,
  };
}
