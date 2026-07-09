## ============================================================
##  FI 362 - Financial Econometrics
##  Week 2, Day 3 (add-on): Regime switching / Markov switching
##  -> bridge to Tsay Chapter 4 (nonlinear models)
##
##  Fits a 2-state Markov-switching model to daily S&P 500 returns
##  by a transparent hand-rolled Hamilton filter + EM (Baum-Welch),
##  so no special package is required. Reproduces the figures and
##  numbers used in Day3_variants.tex.
## ============================================================

set.seed(362)
this_dir <- local({
  a <- commandArgs(trailingOnly = FALSE); f <- sub("^--file=", "", a[grep("^--file=", a)])
  if (length(f)) dirname(normalizePath(f)) else getwd()
})
data_dir <- local({
  cands <- c(file.path(this_dir, "..", "data"), file.path(this_dir, "data"), "../data", "data")
  hit <- cands[file.exists(file.path(cands, "indices_adjclose.csv"))]
  if (!length(hit)) stop("Could not find data/."); normalizePath(hit[1])
})
fig_dir <- file.path(this_dir, "figures_R"); if (!dir.exists(fig_dir)) dir.create(fig_dir, recursive = TRUE)
save_pdf <- function(name, expr, width = 8, height = 4.5) {
  pdf(file.path(fig_dir, paste0(name, ".pdf")), width = width, height = height)
  on.exit(dev.off()); force(expr) }
rule <- function(s) cat("\n========== ", s, " ==========\n", sep = "")
col_blue <- "#466EB4"; col_orange <- "#D28C3C"; col_red <- "#C84646"; col_grey <- "grey55"

idx <- read.csv(file.path(data_dir, "indices_adjclose.csv"), check.names = FALSE)
dates <- as.Date(idx$Date); ok <- is.finite(idx$SP500)
sp_dt <- dates[ok][-1]; r <- 100 * diff(log(idx$SP500[ok])); n <- length(r)
cat(sprintf("Loaded %d S&P 500 daily returns.\n", n))

## ------------------------------------------------------------
##  2-state Markov-switching Gaussian model (Hamilton filter+EM)
##    S_t in {1,2} follows a Markov chain, P[i,j]=Pr(S_t=j|S_{t-1}=i)
##    r_t | S_t=s  ~  N(mu_s, sigma_s^2)
## ------------------------------------------------------------
ms2_fit <- function(y, iter = 300, tol = 1e-7){
  n <- length(y)
  mu <- c(mean(y), mean(y))                     # break symmetry through variance
  s  <- c(0.6, 1.8) * sd(y)
  P  <- matrix(c(0.97, 0.03, 0.10, 0.90), 2, 2, byrow = TRUE)
  pi0 <- c(0.5, 0.5); oldll <- -Inf
  for (it in 1:iter){
    B <- cbind(dnorm(y, mu[1], s[1]), dnorm(y, mu[2], s[2]))   # emissions
    ## forward (scaled)
    al <- matrix(0, n, 2); cs <- numeric(n)
    al[1, ] <- pi0 * B[1, ]; cs[1] <- sum(al[1, ]); al[1, ] <- al[1, ]/cs[1]
    for (t in 2:n){ al[t, ] <- (al[t-1, ] %*% P) * B[t, ]; cs[t] <- sum(al[t, ]); al[t, ] <- al[t, ]/cs[t] }
    ll <- sum(log(cs))
    ## backward (scaled)
    be <- matrix(0, n, 2); be[n, ] <- 1
    for (t in (n-1):1) be[t, ] <- as.numeric(P %*% (B[t+1, ] * be[t+1, ])) / cs[t+1]
    ga <- al * be; ga <- ga / rowSums(ga)                     # smoothed P(S_t=s)
    ## pairwise expected transitions
    xi <- matrix(0, 2, 2)
    for (t in 1:(n-1)) xi <- xi + (al[t, ] %o% (B[t+1, ] * be[t+1, ])) * P / cs[t+1]
    ## M-step
    P   <- xi / rowSums(xi); pi0 <- ga[1, ]
    for (k in 1:2){ w <- ga[, k]; mu[k] <- sum(w*y)/sum(w); s[k] <- sqrt(sum(w*(y-mu[k])^2)/sum(w)) }
    if (abs(ll - oldll) < tol) break; oldll <- ll
  }
  ord <- order(s)                                             # state 1 = calm, 2 = turbulent
  list(mu = mu[ord], s = s[ord], P = P[ord, ord], smooth = ga[, ord], ll = ll, iter = it)
}

rule("Fitting 2-state Markov-switching model to daily S&P 500")
fit <- ms2_fit(r)
mu <- fit$mu; s <- fit$s; P <- fit$P
p11 <- P[1,1]; p22 <- P[2,2]
pi_stat <- c(1 - p22, 1 - p11) / (2 - p11 - p22)              # stationary distribution
dur <- 1/(1 - diag(P))                                        # expected duration in days
cat(sprintf("CALM  regime:  mu1=%.3f  sigma1=%.3f %%/day\n", mu[1], s[1]))
cat(sprintf("STORM regime:  mu2=%.3f  sigma2=%.3f %%/day\n", mu[2], s[2]))
cat(sprintf("Transition P = [%.3f %.3f ; %.3f %.3f]\n", P[1,1],P[1,2],P[2,1],P[2,2]))
cat(sprintf("Stay probs: p11=%.3f (calm), p22=%.3f (storm)\n", p11, p22))
cat(sprintf("Expected duration: calm=%.0f days, storm=%.0f days\n", dur[1], dur[2]))
cat(sprintf("Stationary (long-run) time in each: calm=%.1f%%, storm=%.1f%%\n",
            100*pi_stat[1], 100*pi_stat[2]))
uncond_sd <- sqrt(pi_stat[1]*(s[1]^2+mu[1]^2) + pi_stat[2]*(s[2]^2+mu[2]^2) -
                  (pi_stat[1]*mu[1]+pi_stat[2]*mu[2])^2)
cat(sprintf("Mixture unconditional sd = %.3f %% (sample sd = %.3f %%)\n", uncond_sd, sd(r)))
cat(sprintf("Vol ratio storm/calm = %.1fx\n", s[2]/s[1]))

## ------------------------------------------------------------
##  FIGURE 1 -- smoothed probability of the turbulent regime
## ------------------------------------------------------------
rule("Figure: smoothed high-volatility regime probability")
pstorm <- fit$smooth[, 2]
save_pdf("fig_regime_prob", {
  layout(matrix(1:2, 2, 1)); par(mar = c(2.4, 4, 2.2, 1))
  plot(sp_dt, r, type = "l", col = "grey55", lwd = 0.4, xlab = "", ylab = "r_t (%)",
       main = "S&P 500 daily returns")
  abline(h = 0, col = "grey80")
  par(mar = c(3, 4, 2.2, 1))
  plot(sp_dt, pstorm, type = "h", col = col_red, lwd = 0.4, ylim = c(0,1),
       xlab = "", ylab = "P(storm | data)",
       main = "Smoothed probability of the turbulent regime (spikes in 2008 and 2020)")
}, width = 9, height = 5.2)

## ------------------------------------------------------------
##  FIGURE 2 -- fat tails as a mixture of two regimes
## ------------------------------------------------------------
rule("Figure: return density as a two-regime mixture")
save_pdf("fig_regime_density", {
  par(mar = c(4, 4, 3, 1))
  h <- hist(r, breaks = 160, plot = FALSE)
  plot(h, freq = FALSE, border = "grey75", col = "grey92", xlim = c(-6, 6),
       xlab = "r_t (%)", main = "One fat-tailed distribution = a mixture of two calm/storm Normals")
  xs <- seq(-8, 8, length.out = 600)
  lines(xs, pi_stat[1]*dnorm(xs, mu[1], s[1]), col = col_blue,   lwd = 2)
  lines(xs, pi_stat[2]*dnorm(xs, mu[2], s[2]), col = col_red,    lwd = 2)
  lines(xs, pi_stat[1]*dnorm(xs, mu[1], s[1]) + pi_stat[2]*dnorm(xs, mu[2], s[2]),
        col = col_orange, lwd = 2.5, lty = 1)
  legend("topright", c(sprintf("calm  N(%.2f, %.2f)", mu[1], s[1]),
                       sprintf("storm N(%.2f, %.2f)", mu[2], s[2]), "mixture"),
         col = c(col_blue, col_red, col_orange), lwd = 2, bty = "n", cex = 0.9)
}, width = 8.5, height = 4.4)

rule("DONE -- regime figures written")
print(grep("regime", list.files(fig_dir, pattern = "\\.pdf$"), value = TRUE))
