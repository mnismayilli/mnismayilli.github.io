# =====================================================================
#  FI 362 - Advanced Financial Econometrics
#  Day 1 Supplement -- Asset Returns & Distributional Properties
#  Standalone, fully-commented R script (mirror of Day01_Supplement.qmd)
#
#  Author: Mehman Ismayilli
#
#  WHAT THIS SCRIPT DOES
#  ---------------------
#  It recomputes every concept from the Day 1 slides on REAL market data:
#    * simple vs log returns
#    * multi-period compounding and annualisation
#    * the limit (1 + r/m)^m -> e^r
#    * portfolio aggregation (exact for simple, approximate for log)
#    * the four sample moments (mean, sd, skewness, excess kurtosis)
#    * the stylised facts (fat tails, vol clustering, serial dependence)
#    * skewness / kurtosis / Jarque-Bera normality tests
#    * Worked Exercises 1 and 2
#
#  HOW TO RUN
#  ----------
#  Option A (RStudio):  open this file, then Code > Source  (or Ctrl/Cmd+Shift+S)
#  Option B (terminal): Rscript Day01_Supplement.R
#
#  The script auto-installs any missing packages and finds the data/ folder
#  automatically. Plots are written to a ./Day01_figures/ sub-folder when run
#  non-interactively, and drawn to screen when run interactively.
# =====================================================================


# ---------------------------------------------------------------------
# 0.  PACKAGES  -- install anything that is missing, then load
# ---------------------------------------------------------------------
# We only need a handful of packages. `moments` and `tseries` give us
# "off-the-shelf" skewness / kurtosis / Jarque-Bera so we can cross-check
# our own hand-coded versions; ggplot2 + zoo are for plotting / dates.
required_pkgs <- c("ggplot2", "moments", "tseries", "zoo", "knitr")

install_if_missing <- function(pkgs) {
  missing <- pkgs[!vapply(pkgs, requireNamespace, logical(1), quietly = TRUE)]
  if (length(missing)) {
    message("Installing missing packages: ", paste(missing, collapse = ", "))
    install.packages(missing, repos = "https://cloud.r-project.org")
  }
}
install_if_missing(required_pkgs)

suppressPackageStartupMessages({
  library(ggplot2)   # grammar-of-graphics plots
  library(moments)   # skewness(), kurtosis() (1/T scaling) -- for cross-checks
  library(tseries)   # jarque.bera.test()
  library(zoo)       # date helpers
  library(knitr)     # kable() pretty tables (printed to console here)
})

theme_set(theme_minimal(base_size = 12))

# Are we interactive (RStudio/console) or batch (Rscript)? If batch, we save
# plots to files instead of opening device windows.
INTERACTIVE <- interactive()
fig_dir <- "Day01_figures"
if (!INTERACTIVE) dir.create(fig_dir, showWarnings = FALSE)

# Small helper: open a PNG device when running in batch mode, otherwise no-op.
open_fig <- function(name, width = 900, height = 520) {
  if (!INTERACTIVE) png(file.path(fig_dir, name), width, height, res = 110)
}
close_fig <- function() if (!INTERACTIVE) invisible(dev.off())

# Helper to "show" a ggplot in either mode.
show_plot <- function(p, name, width = 900, height = 520) {
  if (INTERACTIVE) {
    print(p)
  } else {
    ggsave(file.path(fig_dir, name), p, width = width/110, height = height/110,
           dpi = 110)
  }
}

section <- function(txt) cat("\n\n========== ", txt, " ==========\n", sep = "")


# ---------------------------------------------------------------------
# 1.  LOCATE AND LOAD THE DATA
# ---------------------------------------------------------------------
# The CSV panels were built by data/download_data.R (daily Yahoo Finance
# adjusted-close prices, Jan 2000 - May 2026). We search a few likely
# locations so the script works whether you run it from the Chapter 1
# folder, the project root, or the data folder itself.
section("1. Loading data")

data_dir <- local({
  cands <- c("../data", "data", "../../data",
             file.path(getwd(), "data"))
  hit <- cands[file.exists(file.path(cands, "indices_adjclose.csv"))]
  if (!length(hit))
    stop("Could not find the data/ folder. Run data/download_data.R first, ",
         "or set the working directory to the Chapter 1 folder.")
  normalizePath(hit[1])
})
message("Using data folder: ", data_dir)

# read_prices: read a wide CSV (Date + one column per series) and parse dates.
# check.names = FALSE keeps column names exactly as written (e.g. "S&P").
read_prices <- function(file) {
  df <- read.csv(file.path(data_dir, file), check.names = FALSE)
  df$Date <- as.Date(df$Date)
  df
}

indices   <- read_prices("indices_adjclose.csv")  # daily, wide  (indices)
stocks    <- read_prices("stocks_adjclose.csv")   # daily, wide  (5 US stocks)
idx_month <- read_prices("indices_monthly.csv")   # month-end, wide (indices)
sp_month  <- read_prices("sp500_monthly.csv")     # month-end S&P 500
meta      <- read.csv(file.path(data_dir, "metadata.csv"))

cat("\nThe downloaded universe:\n")
print(kable(meta[, c("symbol", "name", "region", "asset_class",
                     "rows", "start", "end")]))

# We use the S&P 500 as the running index and AAPL as the running stock,
# but EVERY computation below is column-agnostic: change the column name
# and it all still works.


# ---------------------------------------------------------------------
# 2.  CORE HELPERS  -- returns and sample moments
# ---------------------------------------------------------------------
# These four functions are the analytical heart of the whole script.

# (a) one-step lag with no package dependency
lag1 <- function(x) c(NA, head(x, -1))

# (b) simple net return:  R_t = P_t / P_{t-1} - 1
simple_ret <- function(p) p / lag1(p) - 1

# (c) log (continuously compounded) return:  r_t = ln P_t - ln P_{t-1}
log_ret <- function(p) c(NA, diff(log(p)))

# (d) the four sample moments EXACTLY as defined on the slides.
#     NB: we divide by (T-1), matching Tsay's textbook convention.
#     (moments::skewness / kurtosis divide by T -- hence small differences.)
samp_stats <- function(x) {
  x <- x[is.finite(x)]                              # drop NA / Inf
  T <- length(x)
  m <- mean(x)
  s <- sqrt(sum((x - m)^2) / (T - 1))               # sample sd
  sk <- sum((x - m)^3) / ((T - 1) * s^3)            # sample skewness
  ku <- sum((x - m)^4) / ((T - 1) * s^4)            # sample kurtosis
  data.frame(n = T, mean = m, sd = s, skew = sk,
             exkurt = ku - 3,                       # EXCESS kurtosis
             min = min(x), max = max(x))
}

# (e) the three normality-test statistics from the slides.
#     Under H0 (normality):
#        skewness        ~ N(0, 6/T)
#        excess kurtosis ~ N(0, 24/T)
#        Jarque-Bera     = t_skew^2 + t_kurt^2  ~  Chi-square(2)
norm_tests <- function(x) {
  x <- x[is.finite(x)]; T <- length(x)
  st <- samp_stats(x)
  t_sk <- st$skew   / sqrt(6  / T)
  t_ku <- st$exkurt / sqrt(24 / T)
  JB   <- t_sk^2 + t_ku^2
  data.frame(skew = st$skew,   t_skew = t_sk, p_skew = 2 * (1 - pnorm(abs(t_sk))),
             exkurt = st$exkurt, t_kurt = t_ku, p_kurt = 2 * (1 - pnorm(abs(t_ku))),
             JB = JB, p_JB = 1 - pchisq(JB, df = 2))
}


# ---------------------------------------------------------------------
# 3.  FROM PRICES TO RETURNS
# ---------------------------------------------------------------------
# Slides: "Asset Returns - One period".
#   simple gross return  1 + R_t = P_t / P_{t-1}
#   simple net   return      R_t = P_t / P_{t-1} - 1
section("3. From prices to returns (S&P 500)")

sp <- data.frame(Date = indices$Date, Price = indices$SP500)
sp <- sp[is.finite(sp$Price), ]
sp$R <- simple_ret(sp$Price)   # simple net return
sp$r <- log_ret(sp$Price)      # log return

cat("First 6 rows (price, simple R_t, log r_t):\n")
print(kable(head(sp, 6), digits = 5))

# Why returns, not prices? Returns are scale-free and roughly stationary;
# prices trend. Compare the level (non-stationary) with the return (mean 0).
open_fig("01_price_vs_return.png", 900, 620)
op <- par(mfrow = c(2, 1), mar = c(3, 4, 2, 1))
plot(sp$Date, sp$Price, type = "l", col = "steelblue", xlab = "",
     ylab = "Price (adj.)",
     main = "S&P 500 price level (trending, non-stationary)")
plot(sp$Date, 100 * sp$R, type = "l", col = "firebrick", xlab = "",
     ylab = "Simple return (%)",
     main = "S&P 500 daily return (mean-reverting around 0)")
abline(h = 0, col = "grey50"); par(op)
close_fig()


# ---------------------------------------------------------------------
# 4.  MULTI-PERIOD RETURNS & COMPOUNDING
# ---------------------------------------------------------------------
# Slides: "Asset Returns - Multi-period".
#   k-period gross return = product of one-period gross returns:
#       1 + R_t[k] = prod_{j=0}^{k-1} (1 + R_{t-j})
section("4. Multi-period returns & compounding")

# Verify on a concrete 5-day window: compounding daily returns must equal
# the direct price ratio P_t / P_{t-k}.
w <- sp[2:6, ]                         # five consecutive days
gross_prod <- prod(1 + w$R)            # product of (1 + R)
direct     <- sp$Price[6] / sp$Price[1]  # P_t / P_{t-k}
cat("Compounding identity check (should match to machine precision):\n")
print(c(`compounded product` = gross_prod,
        `direct price ratio` = direct,
        difference           = gross_prod - direct))

# Annualisation, three equivalent ways (~252 trading days / year).
R <- na.omit(sp$R)
geo       <- prod(1 + R)^(252 / length(R)) - 1   # exact geometric
arith     <- mean(R) * 252                       # arithmetic approximation
log_based <- exp(mean(log(1 + R)) * 252) - 1     # via log returns
cat("\nAnnualised S&P 500 return, three ways:\n")
print(c(`geometric (exact)` = geo, `arithmetic approx` = arith,
        `log-mean based` = log_based))


# ---------------------------------------------------------------------
# 5.  THE COMPOUNDING TABLE AND THE NUMBER e
# ---------------------------------------------------------------------
# Slides: "Compounding Interest Rate" + "Continuous Compounding".
#   As m -> infinity,  (1 + r/m)^m -> e^r.
section("5. Compounding frequency and the number e")

m <- c(Annual = 1, `Semi-annual` = 2, Quarterly = 4, Monthly = 12,
       Weekly = 52, Daily = 365)
r <- 0.10                                # 10% per annum, $1, 1 year
tab <- data.frame(
  Type        = names(m),
  Payments    = as.integer(m),
  `Rate/period` = r / m,
  `Net value` = (1 + r / m)^m,
  check.names = FALSE)
tab <- rbind(tab, data.frame(Type = "Continuous", Payments = Inf,
             `Rate/period` = NA, `Net value` = exp(r), check.names = FALSE))
cat("Effect of compounding frequency (r = 10% p.a.):\n")
print(kable(tab, digits = 5))

# Visualise the convergence to e^0.1.
open_fig("02_e_limit.png")
ms <- 2^(0:16)
plot(ms, (1 + r / ms)^ms, log = "x", type = "b", pch = 19, col = "darkgreen",
     xlab = "compounding periods per year (log scale)",
     ylab = "net value of $1",
     main = expression("Discrete -> continuous: (1 + r/m)^m -> e^r"))
abline(h = exp(r), lty = 2, col = "red")
text(2, exp(r), expression(e^{0.1}), pos = 1, col = "red")
close_fig()


# ---------------------------------------------------------------------
# 6.  LOG RETURNS AND WHY WE LOVE THEM
# ---------------------------------------------------------------------
# Slides: "Continuously Compounding Return".
#   r_t = ln(1 + R_t) = ln P_t - ln P_{t-1}  is ADDITIVE across time:
#       r_t[k] = sum_{j=0}^{k-1} r_{t-j}
section("6. Log returns: additivity and the simple-vs-log gap")

# Additivity check: sum of daily log returns over the 5-day window equals
# the log of the price ratio.
cat("Log-return additivity check:\n")
print(c(`sum of daily log returns` = sum(w$r),
        `log of price ratio`       = log(direct),
        difference                 = sum(w$r) - log(direct)))

# Simple vs log: near-identical for small moves, diverge for large ones.
d <- na.omit(data.frame(R = sp$R, r = sp$r))
p_svl <- ggplot(d, aes(100 * R, 100 * r)) +
  geom_point(alpha = 0.25, size = 0.6, colour = "steelblue") +
  geom_abline(slope = 1, intercept = 0, colour = "firebrick", linewidth = 0.8) +
  labs(x = "Simple return R (%)", y = "Log return r (%)",
       title = "Daily S&P 500: log vs simple return",
       subtitle = "Equal for small moves; they diverge in the tails")
show_plot(p_svl, "03_simple_vs_log.png")

# The 5 days where they disagree most.
d$gap <- 100 * (d$R - d$r)
cat("\nDays where simple and log returns disagree most (gap, %-pts):\n")
print(kable(head(d[order(-abs(d$gap)), ], 5), digits = 3))


# ---------------------------------------------------------------------
# 7.  PORTFOLIO RETURNS
# ---------------------------------------------------------------------
# Slides: "Portfolio Return".
#   simple returns aggregate EXACTLY:        R_p = sum_i w_i R_i
#   log returns aggregate only APPROXIMATELY: r_p ~ sum_i w_i r_i
section("7. Portfolio returns (equal-weight 5 US stocks)")

px <- stocks[, c("AAPL", "MSFT", "AXP", "CAT", "SBUX")]
Rs <- as.data.frame(lapply(px, simple_ret))   # simple returns matrix
rs <- as.data.frame(lapply(px, log_ret))      # log returns matrix
wts <- rep(1/5, 5)                            # equal weights

Rp        <- as.numeric(as.matrix(Rs) %*% wts)  # EXACT portfolio simple return
rp_exact  <- log(1 + Rp)                         # its true log return
rp_approx <- as.numeric(as.matrix(rs) %*% wts)   # weighted-average log return

cmp <- na.omit(data.frame(rp_exact = 100 * rp_exact,
                          rp_approx = 100 * rp_approx))
cat(sprintf("Correlation(exact, approx) = %.6f;  max abs error = %.4f %%-pts\n",
            cor(cmp$rp_exact, cmp$rp_approx),
            max(abs(cmp$rp_exact - cmp$rp_approx))))

p_port <- ggplot(cmp, aes(rp_approx, rp_exact)) +
  geom_point(alpha = 0.2, size = 0.6, colour = "darkorange") +
  geom_abline(slope = 1, intercept = 0, colour = "black") +
  labs(x = "Weighted-average log return  sum w_i r_i (%)",
       y = "True portfolio log return  ln(1 + sum w_i R_i) (%)",
       title = "Log-return aggregation: excellent at daily frequency")
show_plot(p_port, "04_portfolio_aggregation.png")


# ---------------------------------------------------------------------
# 8.  DISTRIBUTIONAL PROPERTIES OF RETURNS
# ---------------------------------------------------------------------
# Slides: "Variance, Skewness, Kurtosis" -> "Moments of a Random Sample".
section("8. Sample moments of every series")

# Build one combined price matrix (indices + stocks, aligned on index dates),
# then turn each column into a % LOG return series.
all_px  <- cbind(indices[, -1],
                 stocks[match(indices$Date, stocks$Date), -1])
ret_pct <- lapply(all_px, function(p) 100 * log_ret(p))

mom_tab <- do.call(rbind, lapply(names(ret_pct), function(nm) {
  cbind(Series = nm, samp_stats(ret_pct[[nm]]))
}))
rownames(mom_tab) <- NULL
cat("Sample moments of daily % log returns",
    "(note: positive excess kurtosis everywhere, mostly negative skew):\n")
print(kable(mom_tab, digits = 3))


# ---------------------------------------------------------------------
# 9.  THE STYLISED FACTS, MADE VISIBLE
# ---------------------------------------------------------------------
# Slide: "Why i.i.d. normal is unrealistic" -- vol clustering, fat tails,
# skew, and serial dependence. Here they are, on the S&P 500.
section("9. Stylised facts (2x2 panel)")

rr  <- 100 * na.omit(sp$r)
dts <- sp$Date[is.finite(sp$r)]

open_fig("05_stylised_facts.png", 1000, 750)
op <- par(mfrow = c(2, 2), mar = c(4, 4, 2.5, 1))

## (1) Volatility clustering -- big moves cluster in time
plot(dts, rr, type = "l", col = "grey30", xlab = "", ylab = "log return (%)",
     main = "(1) Volatility clustering")

## (2) Fat tails -- histogram with fitted Normal overlay
hist(rr, breaks = 120, freq = FALSE, col = "grey85", border = "grey60",
     xlab = "log return (%)", main = "(2) Fat tails vs Normal")
curve(dnorm(x, mean(rr), sd(rr)), add = TRUE, col = "firebrick", lwd = 2)

## (3) Normal Q-Q -- tails bend off the line
qqnorm(rr, pch = 16, cex = 0.4, col = "steelblue",
       main = "(3) Normal Q-Q (tails bend off)")
qqline(rr, col = "firebrick", lwd = 2)

## (4) Serial dependence -- ACF of returns (grey) vs squared returns (red)
a1 <- acf(rr,   lag.max = 30, plot = FALSE)
a2 <- acf(rr^2, lag.max = 30, plot = FALSE)
plot(a1$lag, a1$acf, type = "h", lwd = 2, col = "grey50", ylim = c(-0.05, 0.3),
     xlab = "lag", ylab = "ACF", main = "(4) ACF: returns vs squared")
lines(a2$lag + 0.3, a2$acf, type = "h", lwd = 2, col = "firebrick")
abline(h = c(-1.96, 1.96) / sqrt(length(rr)), lty = 2, col = "blue")
par(op)
close_fig()

cat("Read-off: returns are nearly serially uncorrelated (grey), but SQUARED\n",
    "returns are strongly autocorrelated (red): volatility is predictable\n",
    "even when direction is not. This motivates ARCH/GARCH later.\n", sep = "")


# ---------------------------------------------------------------------
# 10.  TESTING NORMALITY
# ---------------------------------------------------------------------
# Slides: "Testing Skewness and Kurtosis" + "Jarque-Bera Test".
section("10. Normality tests (skewness, kurtosis, Jarque-Bera)")

jb <- do.call(rbind, lapply(names(ret_pct), function(nm)
  cbind(Series = nm, norm_tests(ret_pct[[nm]]))))
rownames(jb) <- NULL
cat("p ~ 0  =>  reject normality. Excess kurtosis dominates JB:\n")
print(kable(jb, digits = c(0, 3, 2, 4, 3, 2, 4, 1, 4)))

# Cross-check our hand-coded JB against tseries::jarque.bera.test for the S&P.
cat("\nCross-check vs tseries::jarque.bera.test (S&P 500):\n")
print(jarque.bera.test(na.omit(sp$r)))
cat("Our hand-coded version (slightly different scaling, same conclusion):\n")
print(norm_tests(100 * sp$r)[, c("JB", "p_JB")])


# ---------------------------------------------------------------------
# 11.  WORKED EXERCISE 1
# ---------------------------------------------------------------------
# Daily returns of AXP, CAT, SBUX over the last 5 years:
#   (1)&(3) summary stats of simple % and log % returns
#   (4) test that the mean log return is zero.
section("11. Exercise 1 -- AXP, CAT, SBUX, last 5 years")

cutoff <- max(stocks$Date) - 365 * 5
ex1 <- stocks[stocks$Date >= cutoff, c("Date", "AXP", "CAT", "SBUX")]
cat(sprintf("Window: %s to %s  (%d trading days)\n",
            format(min(ex1$Date)), format(max(ex1$Date)), nrow(ex1)))

# (1) & (3) summary statistics
summ <- function(col, type = c("simple", "log")) {
  type <- match.arg(type)
  p <- ex1[[col]]
  x <- if (type == "simple") 100 * simple_ret(p) else 100 * log_ret(p)
  cbind(Stock = col, Type = type,
        samp_stats(x)[, c("mean", "sd", "skew", "exkurt", "min", "max")])
}
res <- do.call(rbind, c(
  lapply(c("AXP", "CAT", "SBUX"), summ, type = "simple"),
  lapply(c("AXP", "CAT", "SBUX"), summ, type = "log")))
rownames(res) <- NULL
cat("\nSimple vs log % return statistics:\n")
print(kable(res, digits = 3))

# (4) H0: E[r] = 0  -- one-sample t-test on log returns
ttab <- do.call(rbind, lapply(c("AXP", "CAT", "SBUX"), function(col) {
  rg <- na.omit(100 * log_ret(ex1[[col]]))
  tt <- t.test(rg, mu = 0)
  data.frame(Stock = col, mean_pct = mean(rg), t_stat = unname(tt$statistic),
             p_value = tt$p.value, reject_5pct = tt$p.value < 0.05)
}))
cat("\nH0: mean log return = 0 (5% level):\n")
print(kable(ttab, digits = 4))


# ---------------------------------------------------------------------
# 12.  WORKED EXERCISE 2
# ---------------------------------------------------------------------
# Monthly S&P 500, Jan 2000 - Dec 2025:
#   (a) average annual log return
#   (b) value at end-2025 of $1 invested at the start of 2010.
section("12. Exercise 2 -- monthly S&P 500, 2000-2025")

mm <- sp_month[sp_month$Date >= as.Date("2000-01-01") &
               sp_month$Date <= as.Date("2025-12-31"), ]
mm$r <- log_ret(mm$SP500)                 # monthly log returns
mean_monthly <- mean(mm$r, na.rm = TRUE)
avg_annual   <- 12 * mean_monthly         # log returns add => x12

# (b) buy at first month-end of 2010, sell at last month-end of 2025
p0 <- mm$SP500[format(mm$Date, "%Y") == "2010"][1]
p1 <- tail(mm$SP500[format(mm$Date, "%Y") == "2025"], 1)
value_2025 <- 1 * p1 / p0

cat(sprintf("(a) Average annual log return, 2000-2025:  %.2f%%\n",
            100 * avg_annual))
cat(sprintf("(b) $1 invested start-2010 is worth        $%.2f at end-2025\n",
            value_2025))
cat(sprintf("    (a %.1f%% total / %.2f%% annualised simple return)\n",
            100 * (value_2025 - 1),
            100 * ((value_2025)^(1 / (2025 - 2010 + 1)) - 1)))

open_fig("06_sp500_monthly.png")
plot(mm$Date, mm$SP500, type = "l", col = "steelblue", lwd = 1.5, xlab = "",
     ylab = "S&P 500 (month-end, adj.)", main = "S&P 500 monthly, 2000-2025")
abline(v = c(as.Date("2010-01-01"), as.Date("2025-12-31")),
       lty = 2, col = "firebrick")
close_fig()


# ---------------------------------------------------------------------
# 13.  KEY TAKEAWAYS
# ---------------------------------------------------------------------
section("13. Key takeaways")
cat(
"1. Returns, not prices: returns are scale-free and ~stationary; prices trend.\n",
"2. Simple returns MULTIPLY across time, ADD across assets; log returns ADD\n",
"   across time, ~ADD across assets. At daily frequency they are nearly equal.\n",
"3. Compounding frequency -> infinity gives continuous compounding and e^r.\n",
"4. Real returns are NOT Normal: fat tails, mild negative skew, vol clustering.\n",
"   Jarque-Bera rejects normality for every series -> motivates GARCH, EVT, VaR.\n",
sep = "")

if (!INTERACTIVE)
  message("\nDONE. Figures saved in: ", normalizePath(fig_dir))
