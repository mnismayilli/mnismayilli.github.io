###############################################################################
##  sp500_nonlinear.R
##  Nonlinear time series models for the S&P 500
##  TAR/SETAR, Markov switching, nonlinearity tests, parametric bootstrap,
##  forecasting and forecast evaluation.
##
##  Companion to the Beamer deck "Nonlinear Models in Financial Econometrics".
##
##  Design principle: every core routine (SETAR grid search, Hamilton filter,
##  Kim smoother, parametric bootstrap, DM/Clark-West) is written in BASE R so
##  that you can read exactly what is being computed.  Contributed packages are
##  used only as OPTIONAL cross-checks.
##
##  Run time note: the bootstrap (Section 6) and the rolling forecast exercise
##  (Section 8) are the expensive parts.  Both have tuning constants at the top.
###############################################################################


## =============================================================================
## 0.  CONFIGURATION AND PACKAGES
## =============================================================================
## We keep every tuning constant in one place.  Reproducibility of a bootstrap
## p-value requires BOTH the seed and the number of replications to be recorded.

CFG <- list(
  ticker      = "^GSPC",
  start_date  = "2000-01-01",
  end_date    = format(Sys.Date()),   # through today
  p_max       = 5,      # maximum AR order considered
  d_max       = 3,      # maximum threshold delay considered
  trim        = 0.15,   # threshold grid trimmed to [trim, 1-trim] quantiles
  B_boot      = 499,    # bootstrap replications (use 999/1999 for final results)
  burn_in     = 300,    # burn-in when simulating the null DGP
  M_sim       = 5000,   # Monte Carlo paths for multi-step TAR forecasts
  window      = 1000,   # rolling estimation window (trading days ~ 4 years)
  max_origins = 1500,   # cap on out-of-sample origins (speed)
  refit_every = 20,     # re-estimate models every k origins (speed)
  seed        = 20260710
)
set.seed(CFG$seed)

## Optional packages.  The script degrades gracefully if they are missing:
## every result they produce is also produced by our own base-R code.
have <- function(pkg) requireNamespace(pkg, quietly = TRUE)
opt <- list(
  quantmod = have("quantmod"),   # data download
  tseries  = have("tseries"),    # bds.test, adf.test
  tsDyn    = have("tsDyn"),      # setar()  -- cross-check only
  MSwM     = have("MSwM")        # msmFit() -- cross-check only
)
print(unlist(opt))


## =============================================================================
## 1.  DATA: PRICES -> LOG RETURNS
## =============================================================================
## Why log returns?  (i) They are additive across time, so an h-day return is the
## sum of h daily returns; (ii) they are approximately stationary while the price
## level is I(1).  We scale by 100 so that r_t is in PERCENT -- this keeps the
## likelihood well conditioned (variances of order 1 rather than 1e-4) and makes
## optim() converge far more reliably.

get_sp500 <- function(cfg = CFG) {
  if (opt$quantmod) {
    out <- try({
      px <- quantmod::getSymbols(cfg$ticker, src = "yahoo",
                                 from = cfg$start_date, to = cfg$end_date,
                                 auto.assign = FALSE)
      px <- stats::na.omit(quantmod::Cl(px))
      list(dates = as.Date(zoo::index(px))[-1],
           r     = as.numeric(100 * diff(log(as.numeric(px)))))
    }, silent = TRUE)
    if (!inherits(out, "try-error")) return(out)
    message("Download failed; falling back to a simulated series.")
  }
  ## Fallback: simulate a two-regime series with the qualitative features of
  ## the S&P 500 (persistent calm regime, short violent regime).  This lets the
  ## whole script run offline; it is NOT a substitute for the real data.
  n <- 6000; P <- matrix(c(0.99, 0.01, 0.06, 0.94), 2, 2, byrow = TRUE)
  s <- integer(n); s[1] <- 1L
  for (t in 2:n) s[t] <- sample.int(2, 1, prob = P[s[t - 1], ])
  mu <- c(0.05, -0.10); sg <- c(0.70, 2.30)
  list(dates = seq.Date(as.Date(CFG$start_date), by = "day", length.out = n),
       r = mu[s] + sg[s] * rnorm(n))
}

dat <- get_sp500()
r <- dat$r
n <- length(r)
cat(sprintf("T = %d daily returns\n", n))

## Stylised facts.  Look for: mean ~ 0, excess kurtosis >> 0, negative skew,
## near-zero autocorrelation in r_t but strong autocorrelation in r_t^2.
stylised <- c(
  mean     = mean(r),
  sd       = sd(r),
  skewness = mean((r - mean(r))^3) / sd(r)^3,
  kurtosis = mean((r - mean(r))^4) / sd(r)^4,
  acf1_r   = as.numeric(acf(r,   lag.max = 1, plot = FALSE)$acf[2]),
  acf1_r2  = as.numeric(acf(r^2, lag.max = 1, plot = FALSE)$acf[2])
)
print(round(stylised, 4))
## Reading: kurtosis >> 3 and acf1_r2 >> acf1_r is the signature that the
## nonlinearity lives in the VARIANCE, not (yet) in the mean.


## =============================================================================
## 2.  LINEAR BENCHMARK: AR(p) BY AIC
## =============================================================================
## Everything downstream is a comparison against this benchmark.  We select p on
## the SAME sample that later feeds the tests -- note that for the out-of-sample
## exercise in Section 8 we re-select p inside the rolling window, otherwise we
## would be using future information (look-ahead bias).

## Build the design matrix: column 1 of Z is y_t, column j+1 is y_{t-j}.
## `mlag` fixes how many initial observations are discarded.  This matters:
## an AR(p) and a SETAR with delay d > p must be compared on the SAME effective
## sample, otherwise the likelihood ratio between them is meaningless.
make_lags <- function(y, mlag) {
  Z <- embed(y, mlag + 1)
  list(y = Z[, 1], X = cbind(1, Z[, -1, drop = FALSE]))
}

fit_ar <- function(y, p, mlag = p) {
  L <- make_lags(y, mlag)
  X <- cbind(1, L$X[, 2:(p + 1), drop = FALSE])
  b <- qr.solve(X, L$y)         # OLS = conditional MLE under Gaussian errors
  a <- L$y - X %*% b
  neff <- length(a)
  list(p = p, mlag = mlag, coef = as.numeric(b), resid = as.numeric(a),
       ssr = sum(a^2), sigma2 = sum(a^2) / neff, n = neff,
       aic = neff * log(sum(a^2) / neff) + 2 * (p + 1))
}

ar_fits <- lapply(0:CFG$p_max, function(p) if (p == 0) NULL else fit_ar(r, p))
aics <- sapply(1:CFG$p_max, function(i) ar_fits[[i + 1]]$aic)
p_hat <- which.min(aics)
ar0 <- ar_fits[[p_hat + 1]]
cat(sprintf("Selected AR order p = %d (AIC)\n", p_hat))
print(round(setNames(ar0$coef, c("const", paste0("ar", 1:p_hat))), 5))
## Expect: |phi_1| well under 0.10.  Daily equity returns are close to a
## martingale difference in the MEAN.  This is exactly why MSFE gains from
## nonlinear mean models are small -- see Section 9.


## =============================================================================
## 3.  DIAGNOSTICS: IS THE NONLINEARITY IN THE MEAN OR THE VARIANCE?
## =============================================================================
## This ordering is not cosmetic.  BDS and the threshold tests reject against
## ANY departure from the null; if you have not first removed conditional
## heteroskedasticity, a GARCH effect will be mis-read as a threshold in the mean.

## (3a) Engle's ARCH-LM test.  Regress a_t^2 on q of its own lags; under H_0 of
## no ARCH, T*R^2 ~ chi^2_q.  Written out so you can see there is no magic.
arch_lm <- function(a, q = 12) {
  Z <- embed(a^2, q + 1)
  y <- Z[, 1]; X <- cbind(1, Z[, -1, drop = FALSE])
  fit <- lm.fit(X, y)
  r2 <- 1 - sum(fit$residuals^2) / sum((y - mean(y))^2)
  stat <- length(y) * r2
  c(statistic = stat, df = q, p.value = pchisq(stat, q, lower.tail = FALSE))
}

## (3b) McLeod-Li: Ljung-Box portmanteau applied to SQUARED residuals.
mcleod_li <- function(a, m = 12) {
  bt <- Box.test(a^2, lag = m, type = "Ljung-Box")
  c(statistic = unname(bt$statistic), df = m, p.value = unname(bt$p.value))
}

## (3c) Tsay's (1989) threshold F test via the ARRANGED autoregression.
## Idea: sort the rows of the AR design matrix by the switching variable
## y_{t-d}.  If the AR is stable across regimes, the recursive (predictive)
## residuals from the sorted recursion are orthogonal to the regressors.
## Regressing them on the regressors and testing joint significance gives an
## F statistic that is asymptotically F(p+1, T_eff - p - 1) UNDER H_0 -- and
## the threshold c never has to be estimated.  That is the point of the test.
tsay_F <- function(y, p, d, start_frac = 0.10) {
  L <- make_lags(y, max(p, d))
  yy <- L$y
  X  <- cbind(1, L$X[, 2:(p + 1), drop = FALSE])   # 1, y_{t-1},...,y_{t-p}
  zz <- L$X[, d + 1]                               # switching variable y_{t-d}
  ord <- order(zz)
  yy <- yy[ord]; X <- X[ord, , drop = FALSE]
  N <- length(yy); k <- ncol(X)
  m0 <- max(floor(start_frac * N), k + 2)          # observations to initialise

  ## Recursive least squares: at each step predict the next sorted observation
  ## out-of-sample, then update.  ehat are standardised predictive residuals.
  ehat <- numeric(N - m0)
  Xi <- X[1:m0, , drop = FALSE]; yi <- yy[1:m0]
  XtX_inv <- solve(crossprod(Xi)); b <- XtX_inv %*% crossprod(Xi, yi)
  for (i in seq_len(N - m0)) {
    xnew <- X[m0 + i, , drop = FALSE]
    fi <- as.numeric(1 + xnew %*% XtX_inv %*% t(xnew))
    ehat[i] <- as.numeric(yy[m0 + i] - xnew %*% b) / sqrt(fi)
    ## Sherman-Morrison rank-one update -- O(k^2) instead of O(k^3) per step.
    Kg <- XtX_inv %*% t(xnew) / fi
    b <- b + Kg * as.numeric(yy[m0 + i] - xnew %*% b)
    XtX_inv <- XtX_inv - Kg %*% (xnew %*% XtX_inv)
  }

  Xe <- X[(m0 + 1):N, , drop = FALSE]
  ssr1 <- sum(lm.fit(Xe, ehat)$residuals^2)        # regress ehat on the regressors
  ssr0 <- sum(ehat^2)                              # H0: all k coefficients are zero
  Neff <- length(ehat)
  Fstat <- ((ssr0 - ssr1) / k) / (ssr1 / (Neff - k))
  c(F = Fstat, df1 = k, df2 = Neff - k,
    p.value = pf(Fstat, k, Neff - k, lower.tail = FALSE))
}

cat("\n--- Diagnostics on AR residuals ---\n")
print(round(arch_lm(ar0$resid, 12), 4))
print(round(mcleod_li(ar0$resid, 12), 4))
for (d in 1:CFG$d_max)
  cat(sprintf("Tsay F(p=%d, d=%d): F = %.3f, p = %.4f\n",
              p_hat, d, tsay_F(r, p_hat, d)[1], tsay_F(r, p_hat, d)[4]))

## (3d) BDS on AR residuals vs on GARCH-standardised residuals.
## The comparison is the whole point: if BDS rejects on a_t but not on a_t/h_t,
## the "nonlinearity" was volatility, and a threshold model is the wrong tool.
if (opt$tseries) {
  cat("\nBDS on AR residuals (eps = 1 sd):\n")
  print(tseries::bds.test(ar0$resid, m = 3, eps = sd(ar0$resid)))
}


## =============================================================================
## 4.  SETAR: ESTIMATION BY CONDITIONAL LEAST SQUARES + GRID SEARCH
## =============================================================================
## If c were known, a SETAR is just two OLS regressions on two subsamples.
## It is not known, so we profile it out: for each candidate c on a trimmed
## grid we compute the concentrated SSR, and take the minimiser.  Trimming
## (15% each tail) guarantees each regime keeps enough observations for the
## regime-specific OLS to be defined and reasonably precise.

setar_ssr <- function(y, p, d, c_val, mlag = max(p, d)) {
  L <- make_lags(y, mlag)
  yy <- L$y
  X  <- cbind(1, L$X[, 2:(p + 1), drop = FALSE])
  z  <- L$X[, d + 1]
  i1 <- z <= c_val; i2 <- !i1
  if (sum(i1) < ncol(X) + 5 || sum(i2) < ncol(X) + 5) return(NA_real_)
  s1 <- sum(lm.fit(X[i1, , drop = FALSE], yy[i1])$residuals^2)
  s2 <- sum(lm.fit(X[i2, , drop = FALSE], yy[i2])$residuals^2)
  s1 + s2
}

setar_grid <- function(y, p, d, trim = CFG$trim, ngrid = 200,
                       mlag = max(p, d)) {
  L <- make_lags(y, mlag)
  z <- L$X[, d + 1]
  lo <- quantile(z, trim); hi <- quantile(z, 1 - trim)
  grid <- unique(quantile(z[z >= lo & z <= hi],
                          probs = seq(0, 1, length.out = ngrid)))
  ssr <- vapply(grid, function(cc) setar_ssr(y, p, d, cc, mlag), numeric(1))
  k <- which.min(ssr)
  list(c_hat = as.numeric(grid[k]), ssr = as.numeric(ssr[k]),
       grid = as.numeric(grid), ssr_path = ssr, n = length(L$y), mlag = mlag)
}

## Full SETAR fit at a given (p, d, c): returns regime coefficients and sigmas.
setar_fit <- function(y, p, d, c_val, mlag = max(p, d)) {
  L <- make_lags(y, mlag)
  yy <- L$y; X <- cbind(1, L$X[, 2:(p + 1), drop = FALSE]); z <- L$X[, d + 1]
  i1 <- z <= c_val
  f1 <- lm.fit(X[i1, , drop = FALSE], yy[i1])
  f2 <- lm.fit(X[!i1, , drop = FALSE], yy[!i1])
  list(p = p, d = d, c = c_val,
       coef1 = f1$coefficients, coef2 = f2$coefficients,
       sigma1 = sqrt(mean(f1$residuals^2)), sigma2 = sqrt(mean(f2$residuals^2)),
       n1 = sum(i1), n2 = sum(!i1), mlag = mlag,
       ssr = sum(f1$residuals^2) + sum(f2$residuals^2), n = length(yy))
}

## Joint selection over (p, d) by AIC of the two-regime fit.  NOTE: this AIC is
## NOT a valid test of linearity (the grid search over c is not penalised); use
## it only to pick p and d, and use the bootstrap of Section 6 to test.
MLAG <- max(CFG$p_max, CFG$d_max)   # common effective sample for ALL candidates
sel <- expand.grid(p = 1:CFG$p_max, d = 1:CFG$d_max)
sel$aic <- NA_real_; sel$c_hat <- NA_real_
for (i in seq_len(nrow(sel))) {
  g  <- setar_grid(r, sel$p[i], sel$d[i], mlag = MLAG)
  fi <- setar_fit(r, sel$p[i], sel$d[i], g$c_hat, mlag = MLAG)
  k  <- 2 * (sel$p[i] + 1) + 2                  # coefficients + two variances
  sel$aic[i] <- fi$n * log(fi$ssr / fi$n) + 2 * k
  sel$c_hat[i] <- g$c_hat
}
best <- sel[which.min(sel$aic), ]
cat(sprintf("\nSETAR selection: p = %d, d = %d, c_hat = %.4f\n",
            best$p, best$d, best$c_hat))
setar_hat <- setar_fit(r, best$p, best$d, best$c_hat, mlag = MLAG)
str(setar_hat[c("c", "coef1", "coef2", "sigma1", "sigma2", "n1", "n2")])
## Reading: sigma2 (upper regime) vs sigma1 (lower regime).  With c_hat near 0,
## sigma1 > sigma2 is the leverage effect showing up in a MEAN-equation model.

## Optional cross-check.  In tsDyn, thDelay is ZERO-based: thDelay = d - 1.
if (opt$tsDyn) {
  chk <- tsDyn::setar(r, m = best$p, thDelay = best$d - 1, nthresh = 1,
                      trim = CFG$trim)
  cat("tsDyn threshold:", round(tsDyn::getTh(chk), 4),
      " vs ours:", round(best$c_hat, 4), "\n")
}


## =============================================================================
## 5.  MARKOV SWITCHING: HAMILTON FILTER, KIM SMOOTHER, MLE
## =============================================================================
## Model:  r_t = mu_{s_t} + phi * r_{t-1} + sigma_{s_t} * e_t,   e_t ~ N(0,1)
##         s_t in {1,2}, first-order Markov with transition matrix P.
## The intercept and the variance switch; the AR slope is common (standard, and
## it keeps the likelihood well behaved).  Extending phi to switch is a one-line
## change and is left as an exercise.
##
## Parameterisation for optim(): variances via log, probabilities via logit.
## This makes the optimisation unconstrained -- the single most common source
## of "optim did not converge" is forgetting to do this.

ms_unpack <- function(par) {
  list(mu = par[1:2], phi = par[3], sig = exp(par[4:5]),
       p11 = plogis(par[6]), p22 = plogis(par[7]))
}

## Hamilton filter.  Two operations per period:
##   PREDICT   xi_{t|t-1} = P' xi_{t-1|t-1}
##   UPDATE    xi_{t|t}   = (xi_{t|t-1} * eta_t) / sum(xi_{t|t-1} * eta_t)
## The normalising constant IS the one-step predictive density, so the
## log-likelihood falls out of the filter for free.
ms_filter <- function(par, y) {
  th <- ms_unpack(par)
  P  <- matrix(c(th$p11, 1 - th$p11, 1 - th$p22, th$p22), 2, 2, byrow = TRUE)
  n  <- length(y)
  den <- 2 - th$p11 - th$p22
  xi  <- c((1 - th$p22) / den, (1 - th$p11) / den)   # ergodic initialisation
  xi_pred <- matrix(NA_real_, n, 2); xi_filt <- matrix(NA_real_, n, 2)
  llv <- numeric(n)
  for (t in 2:n) {
    pred <- as.vector(crossprod(P, xi))              # = t(P) %*% xi
    eta  <- dnorm(y[t], mean = th$mu + th$phi * y[t - 1], sd = th$sig)
    num  <- pred * eta
    f    <- sum(num)
    if (!is.finite(f) || f <= 0) return(NULL)
    xi_pred[t, ] <- pred; xi_filt[t, ] <- num / f; llv[t] <- log(f)
    xi <- num / f
  }
  list(loglik = sum(llv[-1]), xi_pred = xi_pred, xi_filt = xi_filt, P = P,
       theta = th)
}

ms_negll <- function(par, y) {
  out <- ms_filter(par, y)
  if (is.null(out) || !is.finite(out$loglik)) return(1e10)
  -out$loglik
}

## Kim (1994) smoother, run backwards:
##   xi_{t|T} = xi_{t|t} * [ P %*% ( xi_{t+1|T} / xi_{t+1|t} ) ]
## Note P (not P') here: element (i,j) is Pr(s_{t+1}=j | s_t=i), and we are
## summing over the FUTURE state j for a fixed current state i.
ms_smooth <- function(flt) {
  xi_f <- flt$xi_filt; xi_p <- flt$xi_pred; P <- flt$P
  n <- nrow(xi_f)
  xi_s <- matrix(NA_real_, n, 2); xi_s[n, ] <- xi_f[n, ]
  for (t in (n - 1):2) {
    ratio <- xi_s[t + 1, ] / xi_p[t + 1, ]
    xi_s[t, ] <- xi_f[t, ] * as.vector(P %*% ratio)
    xi_s[t, ] <- xi_s[t, ] / sum(xi_s[t, ])          # guard against drift
  }
  xi_s
}

## Starting values matter.  Label the LOW-variance regime as state 1 by
## construction; otherwise the two runs of optim() return the same likelihood
## with the labels swapped (the well-known label-switching non-identification).
start <- c(mu1 = 0.05, mu2 = -0.10, phi = 0,
           lsig1 = log(0.7), lsig2 = log(2.3),
           lp11 = qlogis(0.98), lp22 = qlogis(0.90))
fit_ms <- optim(start, ms_negll, y = r, method = "BFGS",
                control = list(maxit = 2000, reltol = 1e-10))
th <- ms_unpack(fit_ms$par)
if (th$sig[1] > th$sig[2]) {   # enforce sigma1 < sigma2 (state 1 = calm)
  fit_ms$par[c(1, 2)] <- fit_ms$par[c(2, 1)]
  fit_ms$par[c(4, 5)] <- fit_ms$par[c(5, 4)]
  fit_ms$par[c(6, 7)] <- fit_ms$par[c(7, 6)]
  th <- ms_unpack(fit_ms$par)
}
flt <- ms_filter(fit_ms$par, r)
sm  <- ms_smooth(flt)

cat("\n--- Markov switching estimates ---\n")
cat(sprintf("mu    = (%.4f, %.4f)\n", th$mu[1], th$mu[2]))
cat(sprintf("sigma = (%.4f, %.4f)\n", th$sig[1], th$sig[2]))
cat(sprintf("phi   = %.4f\n", th$phi))
cat(sprintf("p11 = %.4f  p22 = %.4f\n", th$p11, th$p22))
cat(sprintf("expected durations: %.1f and %.1f days\n",
            1 / (1 - th$p11), 1 / (1 - th$p22)))
den <- 2 - th$p11 - th$p22
cat(sprintf("ergodic probabilities: (%.4f, %.4f)\n",
            (1 - th$p22) / den, (1 - th$p11) / den))
cat(sprintf("log-likelihood = %.3f\n", flt$loglik))
## Sanity checks you should always run:
##   (i) p11, p22 both > 0.9   -> regimes are persistent, not outlier dummies.
##   (ii) 1/(1-p22) > 5 days   -> the turbulent state is a state, not a jump.
##   (iii) ergodic prob of the turbulent state roughly 0.1-0.3.

## Crisis dating.  The smoothed probability of the high-variance regime is the
## model's own, entirely data-driven, crisis chronology.  Check it against 2008,
## March 2020, 2022 -- if it does not line up, something is wrong.
crisis <- dat$dates[which(sm[, 2] > 0.5)]
cat("Share of days in the turbulent regime (smoothed > 0.5):",
    round(mean(sm[-1, 2] > 0.5), 3), "\n")
cat("Turbulent days per calendar year:\n")
print(table(format(crisis, "%Y")))


## =============================================================================
## 6.  TESTING LINEARITY BY PARAMETRIC BOOTSTRAP
## =============================================================================
## H0: AR(p).   H1: SETAR(2; p, p) with delay d and UNKNOWN threshold c.
##
## Under H0 the threshold c is not identified: the likelihood is flat in c.
## Therefore sup_c LR(c) is NOT chi-square (the Davies problem).  We simulate
## its null distribution.
##
## THE ONE RULE: inside every bootstrap replication, re-run the ENTIRE
## procedure, including the grid search over c.  Fixing c = c_hat replaces
## sup_c LR(c) with LR(c_hat), which IS chi-square -- and the resulting p-value
## is far too small.  You will "discover" thresholds in linear data.

sup_LR <- function(y, p, d, trim = CFG$trim, mlag = max(p, d)) {
  ## CRITICAL: restricted and unrestricted models share the same effective
  ## sample (same mlag), otherwise SSR_0 and SSR_1 are not comparable.
  ar_f <- fit_ar(y, p, mlag = mlag)
  g    <- setar_grid(y, p, d, trim, mlag = mlag)
  nn   <- g$n
  ## Under Gaussian errors with a common variance, the LR reduces to
  ##   n * [log SSR_0 - log SSR_1(c)],  maximised at the SSR-minimising c.
  nn * (log(ar_f$ssr) - log(g$ssr))
}

## Simulate the null DGP: an AR(p) with the estimated coefficients.
## Two innovation schemes, chosen by `scheme`:
##   "parametric" : e* ~ N(0, sigma_hat^2)    -- efficient IF returns are normal
##   "residual"   : e* resampled from {a_hat} -- robust to fat tails
##   "wild"       : e* = a_hat_t * eta_t      -- survives conditional heterosked.
## For daily S&P 500 data "parametric" and "residual" both destroy volatility
## clustering, which makes the bootstrap null too calm and the test OVER-REJECT.
## "wild" is the safe default; better still is a bootstrap under an AR-GARCH null.
sim_ar_null <- function(arfit, T_out, burn = CFG$burn_in,
                        scheme = c("wild", "residual", "parametric")) {
  scheme <- match.arg(scheme)
  p <- arfit$p; b <- arfit$coef
  N <- T_out + burn + p
  e <- switch(scheme,
    parametric = rnorm(N, 0, sqrt(arfit$sigma2)),
    residual   = sample(arfit$resid, N, replace = TRUE),
    wild       = sample(arfit$resid, N, replace = TRUE) * rnorm(N)
  )
  y <- numeric(N)
  denom <- 1 - sum(b[-1])
  y[1:p] <- if (abs(denom) > 1e-6) b[1] / denom else 0  # unconditional mean
  for (t in (p + 1):N) y[t] <- b[1] + sum(b[-1] * y[(t - 1):(t - p)]) + e[t]
  y[(burn + p + 1):N]
}

boot_supLR <- function(y, p, d, B = CFG$B_boot, scheme = "wild",
                       mlag = max(p, d)) {
  obs <- sup_LR(y, p, d, mlag = mlag)
  arf <- fit_ar(y, p, mlag = mlag)
  Tn  <- length(y)
  stars <- numeric(B)
  for (b in seq_len(B)) {
    ystar <- sim_ar_null(arf, Tn, scheme = scheme)
    ## <-- the full procedure, re-run: AR refit AND grid search over c.
    stars[b] <- sup_LR(ystar, p, d, mlag = mlag)
  }
  ## The (1 + #) / (1 + B) form is exactly valid in finite samples.
  ## Choose B so that alpha*(1+B) is an integer: B = 499, 999, 1999.
  p_val <- (1 + sum(stars >= obs)) / (1 + B)
  list(stat = obs, boot = stars, p_value = p_val,
       crit95 = quantile(stars, 0.95), scheme = scheme, B = B)
}

cat("\n--- Bootstrap test of AR vs SETAR ---\n")
bt_wild <- boot_supLR(r, best$p, best$d, scheme = "wild",     mlag = MLAG)
bt_resi <- boot_supLR(r, best$p, best$d, scheme = "residual", mlag = MLAG)
cat(sprintf("sup-LR = %.3f\n", bt_wild$stat))
cat(sprintf("  wild bootstrap:     p = %.4f   (95%% crit = %.3f)\n",
            bt_wild$p_value, bt_wild$crit95))
cat(sprintf("  residual bootstrap: p = %.4f   (95%% crit = %.3f)\n",
            bt_resi$p_value, bt_resi$crit95))
cat(sprintf("  naive chi2_%d 95%% crit = %.3f  <-- much too small\n",
            best$p + 1, qchisq(0.95, best$p + 1)))
## Report the p-value TOGETHER with the null DGP used to generate it.  A
## threshold test is only as credible as its null.  If the wild-bootstrap
## p-value is large while the residual-bootstrap p-value is tiny, you have
## found GARCH, not a threshold.


## =============================================================================
## 7.  FORECASTING
## =============================================================================

## (7a) SETAR: one step ahead the regime is KNOWN (you observe y_{T+1-d}).
setar_forecast1 <- function(fit, ylast) {
  ## ylast = c(y_T, y_{T-1}, ..., y_{T-p+1}) most recent first
  z <- ylast[fit$d]
  b <- if (z <= fit$c) fit$coef1 else fit$coef2
  as.numeric(b[1] + sum(b[-1] * ylast[1:fit$p]))
}

## (7b) SETAR, h > 1: the regime at T+h depends on the RANDOM y_{T+h-d}.
## E[f(Y)] != f(E[Y]) because f is nonlinear (Jensen).  Iterating the point
## forecast through the skeleton is simply wrong.  Simulate instead, and get
## the whole predictive distribution -- often skewed, sometimes bimodal.
setar_forecast_mc <- function(fit, yhist, h, M = CFG$M_sim, resid_pool = NULL) {
  pmax <- max(fit$p, fit$d)
  paths <- matrix(NA_real_, M, h)
  for (m in 1:M) {
    yl <- rev(tail(yhist, pmax))               # yl[1] = y_T, yl[2] = y_{T-1}...
    for (j in 1:h) {
      z <- yl[fit$d]
      inlow <- z <= fit$c
      b  <- if (inlow) fit$coef1 else fit$coef2
      sg <- if (inlow) fit$sigma1 else fit$sigma2
      e  <- if (is.null(resid_pool)) rnorm(1) else sample(resid_pool, 1)
      ynew <- b[1] + sum(b[-1] * yl[1:fit$p]) + sg * e
      yl <- c(ynew, yl[-pmax])
      paths[m, j] <- ynew
    }
  }
  list(mean = colMeans(paths),
       q05  = apply(paths, 2, quantile, 0.05),
       q95  = apply(paths, 2, quantile, 0.95),
       var1 = apply(paths, 2, quantile, 0.01),   # 1% VaR
       paths = paths)
}

## (7c) Markov switching: closed form for the regime, mixture for the density.
##   xi_{T+h|T} = (P')^h xi_{T|T}
##   E[r_{T+h}] = sum_j xi_j * (mu_j + phi * r_{T+h-1})
##   Var        = sum_j xi_j sigma_j^2  +  sum_j xi_j (m_j - mbar)^2
##                 ^ within-regime          ^ across-regime  <- ignored at your peril
ms_forecast1 <- function(th, xi_T, ylast) {
  P <- matrix(c(th$p11, 1 - th$p11, 1 - th$p22, th$p22), 2, 2, byrow = TRUE)
  xi1 <- as.vector(crossprod(P, xi_T))
  m_j <- th$mu + th$phi * ylast
  mbar <- sum(xi1 * m_j)
  v <- sum(xi1 * th$sig^2) + sum(xi1 * (m_j - mbar)^2)
  list(xi = xi1, mean = mbar, var = v, comp_mean = m_j, comp_sd = th$sig)
}

## Mixture density / quantile: needed for VaR and the log predictive score.
ms_dens <- function(x, fc) sum(fc$xi * dnorm(x, fc$comp_mean, fc$comp_sd))
ms_cdf  <- function(x, fc) sum(fc$xi * pnorm(x, fc$comp_mean, fc$comp_sd))
ms_quantile <- function(alpha, fc)
  uniroot(function(x) ms_cdf(x, fc) - alpha,
          interval = c(min(fc$comp_mean) - 12 * max(fc$comp_sd),
                       max(fc$comp_mean) + 12 * max(fc$comp_sd)))$root

fc_ms <- ms_forecast1(th, flt$xi_filt[n, ], r[n])
cat("\n--- One-step-ahead forecasts at T ---\n")
cat(sprintf("MS: xi_{T+1|T} = (%.4f, %.4f), mean = %.4f, sd = %.4f\n",
            fc_ms$xi[1], fc_ms$xi[2], fc_ms$mean, sqrt(fc_ms$var)))
cat(sprintf("MS  1%% VaR (mixture)  = %.4f\n", ms_quantile(0.01, fc_ms)))
cat(sprintf("Gaussian 1%% VaR (same mean/var) = %.4f  <-- too optimistic\n",
            qnorm(0.01, fc_ms$mean, sqrt(fc_ms$var))))
## The two have IDENTICAL mean and variance, hence identical MSFE and identical
## Mincer-Zarnowitz regressions, but different tails.  Point-forecast evaluation
## is structurally blind to the difference.  Evaluate the DENSITY.


## =============================================================================
## 8.  ROLLING OUT-OF-SAMPLE EXERCISE
## =============================================================================
## Design rules that are easy to break and expensive to break:
##  * Re-estimate EVERYTHING inside the window: p, d, c, and the MS parameters.
##    Selecting p once on the full sample is look-ahead bias.
##  * Nonlinear models need long windows: each regime must be populated.  With a
##    500-day window the crash regime may never appear.
##  * `refit_every` re-estimates only every k origins and reuses the parameters
##    in between.  This is standard practice and mimics a real desk; set it to 1
##    for the textbook-pure (and very slow) version.

R_win <- CFG$window
origins <- seq(R_win, n - 1, by = 1)
if (length(origins) > CFG$max_origins)          # keep the run time sane
  origins <- tail(origins, CFG$max_origins)
P_oos <- length(origins)
f_ar <- f_setar <- f_ms <- rep(NA_real_, P_oos)
ls_ar <- ls_setar <- ls_ms <- rep(NA_real_, P_oos)   # log predictive scores
pit_ms <- rep(NA_real_, P_oos)           # probability integral transforms
actual <- r[origins + 1]

par_ms <- fit_ms$par
for (i in seq_along(origins)) {
  t0 <- origins[i]
  yw <- r[(t0 - R_win + 1):t0]

  if ((i - 1) %% CFG$refit_every == 0) {
    arw <- fit_ar(yw, p_hat, mlag = MLAG)
    gw  <- setar_grid(yw, p_hat, best$d, mlag = MLAG)
    stw <- setar_fit(yw, p_hat, best$d, gw$c_hat, mlag = MLAG)
    msw <- try(optim(par_ms, ms_negll, y = yw, method = "BFGS",
                     control = list(maxit = 1000)), silent = TRUE)
    if (!inherits(msw, "try-error")) par_ms <- msw$par
    thw <- ms_unpack(par_ms)
    if (thw$sig[1] > thw$sig[2]) {
      par_ms[c(1, 2)] <- par_ms[c(2, 1)]; par_ms[c(4, 5)] <- par_ms[c(5, 4)]
      par_ms[c(6, 7)] <- par_ms[c(7, 6)]; thw <- ms_unpack(par_ms)
    }
  }
  fw <- ms_filter(par_ms, yw)
  if (is.null(fw)) next

  ylast <- rev(tail(yw, max(p_hat, best$d)))
  f_ar[i]    <- arw$coef[1] + sum(arw$coef[-1] * ylast[1:p_hat])
  f_setar[i] <- setar_forecast1(stw, ylast)
  sg_st      <- if (ylast[stw$d] <= stw$c) stw$sigma1 else stw$sigma2
  fc         <- ms_forecast1(thw, fw$xi_filt[length(yw), ], yw[length(yw)])
  f_ms[i]    <- fc$mean

  ## Density evaluation: log predictive score and PIT.
  ls_ar[i]    <- dnorm(actual[i], f_ar[i], sqrt(arw$sigma2), log = TRUE)
  ls_setar[i] <- dnorm(actual[i], f_setar[i], sg_st, log = TRUE)
  ls_ms[i]    <- log(ms_dens(actual[i], fc))
  pit_ms[i]   <- ms_cdf(actual[i], fc)
}

ok <- complete.cases(f_ar, f_setar, f_ms)
e_ar <- actual[ok] - f_ar[ok]
e_st <- actual[ok] - f_setar[ok]
e_ms <- actual[ok] - f_ms[ok]
cat(sprintf("\nOOS origins used: %d\n", sum(ok)))
cat(sprintf("MSFE  AR = %.5f  SETAR = %.5f  MS = %.5f\n",
            mean(e_ar^2), mean(e_st^2), mean(e_ms^2)))
cat(sprintf("Mean log score  AR = %.4f  SETAR = %.4f  MS = %.4f\n",
            mean(ls_ar[ok]), mean(ls_setar[ok]), mean(ls_ms[ok])))
## Expected pattern: MSFE essentially tied, log score clearly better for MS.
## Nonlinear models earn their keep in the DENSITY, not in the mean.


## =============================================================================
## 9.  FORECAST EVALUATION: DM, CLARK-WEST, DIRECTIONAL ACCURACY, PIT
## =============================================================================

## (9a) Diebold-Mariano.  Valid for NON-NESTED models only.
## For h > 1 the loss differential is MA(h-1); use a Newey-West long-run
## variance with bandwidth h-1.  Harvey-Leybourne-Newbold rescales for small P.
dm_test <- function(e1, e2, h = 1, power = 2, hln = TRUE) {
  d <- abs(e1)^power - abs(e2)^power
  P <- length(d); dbar <- mean(d)
  ## acf() requires lag.max >= 1; for h = 1 we simply ignore g[2].
  g <- acf(d, lag.max = max(h - 1, 1), type = "covariance", plot = FALSE)$acf
  lrv <- g[1] + if (h > 1) 2 * sum(g[2:h]) else 0
  stat <- dbar / sqrt(lrv / P)
  if (hln) {
    corr <- sqrt((P + 1 - 2 * h + h * (h - 1) / P) / P)
    stat <- stat * corr
    pv <- 2 * pt(-abs(stat), df = P - 1)
  } else pv <- 2 * pnorm(-abs(stat))
  c(DM = stat, p.value = pv, dbar = dbar)
}

## (9b) Clark-West.  Use this when model 2 NESTS model 1 (AR nested in SETAR).
## Under H0 the two forecasts coincide asymptotically, so d_t -> 0 AND
## Var(d_t) -> 0: DM is degenerate and badly undersized.  CW removes the
## estimation-noise penalty (f1 - f2)^2 that mechanically inflates the larger
## model's MSFE.  It is a ONE-SIDED test.
cw_test <- function(y, f_small, f_large, h = 1) {
  ft <- (y - f_small)^2 - ((y - f_large)^2 - (f_small - f_large)^2)
  P <- length(ft); fbar <- mean(ft)
  g <- acf(ft, lag.max = max(h - 1, 1), type = "covariance", plot = FALSE)$acf
  lrv <- g[1] + if (h > 1) 2 * sum(g[2:h]) else 0
  stat <- fbar / sqrt(lrv / P)
  c(CW = stat, p.value = pnorm(stat, lower.tail = FALSE), fbar = fbar)
}

## (9c) Directional accuracy + Pesaran-Timmermann.  For returns this matters
## more than MSFE: a model can be terrible at levels and profitable at signs.
pt_test <- function(y, f) {
  ok <- y != 0 & f != 0
  y <- y[ok]; f <- f[ok]; P <- length(y)
  Phat <- mean(sign(y) == sign(f))
  py <- mean(y > 0); pf <- mean(f > 0)
  Pstar <- py * pf + (1 - py) * (1 - pf)
  vP  <- Pstar * (1 - Pstar) / P
  vPs <- ((2 * py - 1)^2 * pf * (1 - pf) + (2 * pf - 1)^2 * py * (1 - py) +
            4 * py * pf * (1 - py) * (1 - pf) / P) / P
  stat <- (Phat - Pstar) / sqrt(max(vP - vPs, .Machine$double.eps))
  c(hit_rate = Phat, PT = stat, p.value = pnorm(stat, lower.tail = FALSE))
}

cat("\n--- Forecast comparison ---\n")
cat("DM, SETAR vs MS (non-nested -- DM is legitimate here):\n")
print(round(dm_test(e_st, e_ms, h = 1), 4))
cat("\nDM, AR vs SETAR (NESTED -- reported only to show it is uninformative):\n")
print(round(dm_test(e_ar, e_st, h = 1), 4))
cat("\nClark-West, AR nested in SETAR (the correct test):\n")
print(round(cw_test(actual[ok], f_ar[ok], f_setar[ok]), 4))
cat("\nDirectional accuracy:\n")
cat(" AR:    "); print(round(pt_test(actual[ok], f_ar[ok]), 4))
cat(" SETAR: "); print(round(pt_test(actual[ok], f_setar[ok]), 4))

## (9d) PIT for the MS density forecast.  If the density is correctly specified,
## u_t = F_t(r_t) is i.i.d. U(0,1).  A U-shaped histogram = intervals too narrow
## (underestimated tails); a hump = too wide.  Test uniformity and independence.
u <- pit_ms[ok]
cat("\nPIT: KS test of uniformity:\n")
print(ks.test(u, "punif"))
cat("PIT: Ljung-Box on (u - mean(u)) -- tests independence:\n")
print(Box.test(u - mean(u), lag = 10, type = "Ljung-Box"))


## =============================================================================
## 10.  PLOTS
## =============================================================================
op <- par(no.readonly = TRUE)
par(mfrow = c(3, 1), mar = c(3, 4, 2, 1))

plot(dat$dates, r, type = "l", col = "steelblue", xlab = "", ylab = "r_t (%)",
     main = "S&P 500 daily log returns")
abline(h = 0, col = "grey60")

plot(dat$dates[-1], sm[-1, 2], type = "l", col = "firebrick", ylim = c(0, 1),
     xlab = "", ylab = expression(Pr(s[t] == 2 * "|" * F[T])),
     main = "Smoothed probability of the turbulent regime")
abline(h = 0.5, lty = 2)

hist(bt_wild$boot, breaks = 40, freq = FALSE, col = "grey85", border = "white",
     xlab = "sup-LR", main = "Bootstrap null vs naive chi-square")
curve(dchisq(x, best$p + 1), add = TRUE, col = "red", lwd = 2)
abline(v = bt_wild$stat, lty = 2, lwd = 2)
legend("topright", c("bootstrap null", "chi-square (naive)", "observed"),
       col = c("grey60", "red", "black"), lwd = c(6, 2, 2), lty = c(1, 1, 2),
       bty = "n", cex = 0.8)
par(op)

## PIT histogram: the single most informative density-forecast diagnostic.
hist(u, breaks = 20, freq = FALSE, col = "grey85", border = "white",
     xlab = "PIT", main = "PIT of the MS density forecast")
abline(h = 1, col = "red", lwd = 2)

###############################################################################
## END.  Checklist before you believe any of the above:
##  1. Did the AR order p get re-selected inside the rolling window?      (yes)
##  2. Did the bootstrap re-run the grid search over c in every draw?     (yes)
##  3. Did you report the bootstrap NULL DGP alongside the p-value?       (do it)
##  4. Is the DM test being applied to nested models?                     (never)
##  5. Are you judging a nonlinear model on MSFE alone?                   (don't)
###############################################################################
