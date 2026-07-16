## ============================================================
##  FI 362 - Financial Econometrics
##  Week 2, Day 3: GARCH variants -- IGARCH, GARCH-M, EGARCH
##
##  R companion. Reproduces every figure and number in
##  Day3_variants.tex from the LOCAL data/ folder.
##
##  Running example: S&P 500 daily log returns, 2000-2026.
##
##  rugarch is not assumed present -- each variant is fitted by
##  transparent hand-rolled MLE (optim), as in the Day-1 code.
##  fGarch is used only for the baseline GARCH(1,1) cross-check.
## ============================================================

have <- function(p) requireNamespace(p, quietly = TRUE)
set.seed(362)
this_dir <- local({
  a <- commandArgs(trailingOnly = FALSE)
  f <- sub("^--file=", "", a[grep("^--file=", a)])
  if (length(f)) return(dirname(normalizePath(f))); getwd()
})
data_dir <- local({
  cands <- c(file.path(this_dir, "..", "data"), file.path(this_dir, "data"), "../data", "data")
  hit <- cands[file.exists(file.path(cands, "indices_adjclose.csv"))]
  if (!length(hit)) stop("Could not find data/ (needs indices_adjclose.csv)."); normalizePath(hit[1])
})
fig_dir <- file.path(this_dir, "figures_R"); if (!dir.exists(fig_dir)) dir.create(fig_dir, recursive = TRUE)
save_pdf <- function(name, expr, width = 8, height = 4.5) {
  pdf(file.path(fig_dir, paste0(name, ".pdf")), width = width, height = height)
  on.exit(dev.off()); force(expr)
}
rule <- function(s) cat("\n========== ", s, " ==========\n", sep = "")
col_blue <- "#466EB4"; col_orange <- "#D28C3C"; col_red <- "#C84646"; col_grey <- "grey55"

## ---- data -----------------------------------------------------
idx <- read.csv(file.path(data_dir, "indices_adjclose.csv"), check.names = FALSE)
dates_all <- as.Date(idx$Date)
ok <- is.finite(idx$SP500); sp_p <- idx$SP500[ok]; sp_dt <- dates_all[ok][-1]
r <- 100 * diff(log(sp_p)); Tn <- length(r); a <- r - mean(r)
LB <- function(x, m) Box.test(x, lag = m, type = "Ljung-Box")
kurt <- function(x){ x <- x - mean(x); mean(x^4)/mean(x^2)^2 }
cat(sprintf("Loaded %d S&P 500 daily returns.\n", Tn))

## ============================================================
##  BASELINE GARCH(1,1) (fGarch) for reference
## ============================================================
rule("Baseline GARCH(1,1) (fGarch)")
suppressWarnings(suppressMessages(library(fGarch)))
g11 <- garchFit(~garch(1,1), data = a, cond.dist = "norm", include.mean = FALSE, trace = FALSE)
cg <- coef(g11); omG <- cg["omega"]; alG <- cg["alpha1"]; beG <- cg["beta1"]
persistG <- as.numeric(alG + beG); lrG <- sqrt(omG/(1-persistG)); llG <- -g11@fit$llh
cat(sprintf("GARCH:  omega=%.4f alpha=%.4f beta=%.4f  a+b=%.4f  long-run sd=%.3f%%  loglik=%.1f\n",
            omG, alG, beG, persistG, lrG, llG))
sd_g <- sqrt(g11@h.t)

## ============================================================
##  1. IGARCH / EWMA (RiskMetrics):  omega = 0,  alpha + beta = 1
##     sigma^2_t = (1-lambda) a_{t-1}^2 + lambda sigma^2_{t-1}
## ============================================================
rule("IGARCH / EWMA (RiskMetrics)")
ewma_s2 <- function(x, lam){ n<-length(x); s2<-numeric(n); s2[1]<-var(x)
  for(t in 2:n) s2[t] <- (1-lam)*x[t-1]^2 + lam*s2[t-1]; s2 }
negll_ewma <- function(par, x){ lam <- 1/(1+exp(-par)); s2 <- ewma_s2(x, lam)
  0.5*sum(log(2*pi) + log(s2) + x^2/s2) }
op_e <- optim(qlogis(0.94), negll_ewma, x = a, method = "BFGS")
lam_hat <- plogis(op_e$par); ll_ig <- -op_e$value
s2_rm <- ewma_s2(a, 0.94); sd_rm <- sqrt(s2_rm)          # RiskMetrics fixed lambda
cat(sprintf("RiskMetrics lambda=0.94 -> alpha=%.2f beta=%.2f (a+b=1, omega=0)\n", 0.06, 0.94))
cat(sprintf("MLE-fitted lambda_hat=%.4f  (=> alpha=%.3f beta=%.3f)  loglik=%.1f\n",
            lam_hat, 1-lam_hat, lam_hat, ll_ig))
cat(sprintf("corr(EWMA sd, GARCH sd) = %.3f  (near-identical in sample)\n", cor(sd_rm, sd_g)))

## ============================================================
##  2. GARCH-M (in mean):  r_t = mu + delta*sigma_t + a_t
##     a_t = r_t - mu - delta*sigma_t,  GARCH(1,1) for sigma^2_t
## ============================================================
rule("GARCH-M (in-mean risk premium)")
negll_garchm <- function(par, y){
  mu<-par[1]; del<-par[2]; om<-exp(par[3])
  s<-plogis(par[4]); u<-plogis(par[5]); al<-s*u; be<-s*(1-u)   # al+be=s<1
  n<-length(y); s2<-numeric(n); e<-numeric(n)
  s2[1]<-var(y); e[1]<-y[1]-mu-del*sqrt(s2[1])
  for(t in 2:n){ s2[t]<-om+al*e[t-1]^2+be*s2[t-1]; e[t]<-y[t]-mu-del*sqrt(s2[t]) }
  0.5*sum(log(2*pi)+log(s2)+e^2/s2)
}
init_m <- c(mu=mean(r), del=0.0, lom=log(0.02), s=qlogis(0.98), u=qlogis(0.12))
op_m <- optim(init_m, negll_garchm, y = r, method = "BFGS", hessian = TRUE)
pm <- op_m$par; se_m <- sqrt(diag(solve(op_m$hessian)))
mu_m<-pm[1]; del_m<-pm[2]; om_m<-exp(pm[3]); s<-plogis(pm[4]); u<-plogis(pm[5]); al_m<-s*u; be_m<-s*(1-u)
t_del <- del_m/se_m[2]; ll_m <- -op_m$value
cat(sprintf("GARCH-M: mu=%.4f  delta(risk premium)=%.4f  (SE=%.4f, t=%.2f)\n", mu_m, del_m, se_m[2], t_del))
cat(sprintf("         omega=%.4f alpha=%.3f beta=%.3f  a+b=%.4f  loglik=%.1f\n",
            om_m, al_m, be_m, al_m+be_m, ll_m))

## ============================================================
##  3. EGARCH(1,1) (Nelson 1991):  log sigma^2 with sign term
##     log s2_t = omega + beta*log s2_{t-1}
##              + alpha*(|z_{t-1}| - E|z|) + gamma*z_{t-1}
## ============================================================
rule("EGARCH(1,1) (leverage / asymmetry)")
Ez <- sqrt(2/pi)
negll_egarch <- function(par, x){
  om<-par[1]; al<-par[2]; ga<-par[3]; be<-plogis(par[4])
  n<-length(x); ls2<-numeric(n); ls2[1]<-log(var(x))
  for(t in 2:n){ z<-x[t-1]/sqrt(exp(ls2[t-1]))
    ls2[t]<-om+be*ls2[t-1]+al*(abs(z)-Ez)+ga*z }
  s2<-exp(ls2); 0.5*sum(log(2*pi)+log(s2)+x^2/s2)
}
init_e <- c(om=log(var(a))*(1-0.98), al=0.12, ga=-0.08, be=qlogis(0.98))
op_eg <- optim(init_e, negll_egarch, x = a, method = "BFGS", hessian = TRUE)
pe <- op_eg$par; se_e <- sqrt(diag(solve(op_eg$hessian)))
om_e<-pe[1]; al_e<-pe[2]; ga_e<-pe[3]; be_e<-plogis(pe[4]); ll_e <- -op_eg$value
t_ga <- ga_e/se_e[3]
cat(sprintf("EGARCH: omega=%.4f alpha=%.4f gamma=%.4f beta=%.4f  loglik=%.1f\n",
            om_e, al_e, ga_e, be_e, ll_e))
cat(sprintf("        gamma t-stat = %.2f  (gamma<0 => bad news raises vol more: leverage)\n", t_ga))
## asymmetry ratio: impact of a -1 sd shock vs +1 sd shock on log-variance
g_neg <- al_e*(1-Ez) + ga_e*(-1); g_pos <- al_e*(1-Ez) + ga_e*(1)
cat(sprintf("        log-var impact of z=-1: %.4f   z=+1: %.4f   ratio=%.2f\n",
            g_neg, g_pos, g_neg/g_pos))
AIC <- function(ll,k) -2*ll+2*k
cat(sprintf("\nAIC:  GARCH=%.1f (k=3)   EGARCH=%.1f (k=4)\n", AIC(llG,3), AIC(ll_e,4)))

## ============================================================
##  Empirical motivation for asymmetry: next-day |return|
##  after big-DOWN vs big-UP days
## ============================================================
rule("Empirical leverage: next-day |r| after down vs up days")
nxt <- abs(r[-1]); tod <- r[-Tn]
dn <- mean(nxt[tod < -1]); up <- mean(nxt[tod > 1]); al0 <- mean(nxt)
cat(sprintf("mean |r_{t+1}| after r_t<-1%%: %.3f   after r_t>+1%%: %.3f   overall: %.3f\n", dn, up, al0))

## ============================================================
##  FIGURE A -- empirical leverage bar chart
## ============================================================
save_pdf("fig_leverage_evidence", {
  par(mar=c(4,4.2,3,1))
  bins <- c("big down\n(r < -1%)","quiet\n(|r|<1%)","big up\n(r > +1%)")
  qt <- mean(nxt[abs(tod)<1])
  vals <- c(dn, qt, up)
  bp <- barplot(vals, names.arg=bins, col=c(col_red,col_grey,col_blue), border=NA,
                ylab=expression("mean  "*group("|",r[t+1],"|")*"  (%)"),
                main="Tomorrow's volatility is higher after a big DOWN day (leverage effect)")
  abline(h=al0, lty=2, col="grey40"); text(bp[1], vals[1]+0.05, sprintf("%.2f",vals[1]))
  text(bp[3], vals[3]+0.05, sprintf("%.2f",vals[3]))
}, width=8, height=4.3)

## ============================================================
##  FIGURE B -- news impact curve: GARCH (symmetric) vs EGARCH
## ============================================================
rule("Figure: news impact curves")
save_pdf("fig_news_impact", {
  par(mar=c(4,4.4,3,1))
  sig <- lrG                                   # hold yesterday's vol at long-run
  shock <- seq(-5, 5, length.out=401)          # yesterday's shock a_{t-1} (%)
  ni_garch <- omG + alG*shock^2 + beG*sig^2
  z <- shock/sig
  ni_egar  <- exp(om_e + be_e*log(sig^2) + al_e*(abs(z)-Ez) + ga_e*z)
  plot(shock, sqrt(ni_garch), type="l", lwd=2.5, col=col_blue, ylim=range(sqrt(ni_garch),sqrt(ni_egar)),
       xlab=expression("yesterday's shock  "*a[t-1]*"  (%)"), ylab=expression(hat(sigma)[t]~"(%)"),
       main="News impact curve: GARCH is symmetric, EGARCH tilts toward bad news")
  lines(shock, sqrt(ni_egar), lwd=2.5, col=col_red)
  abline(v=0, col="grey70", lty=3)
  legend("top", c("GARCH(1,1)  (symmetric)","EGARCH(1,1)  (leverage)"),
         col=c(col_blue,col_red), lwd=2.5, bty="n", cex=0.95)
}, width=8.5, height=4.4)

## ============================================================
##  FIGURE C -- forecast: GARCH reverts, IGARCH stays flat
## ============================================================
rule("Figure: GARCH vs IGARCH forecast")
save_pdf("fig_igarch_forecast", {
  par(mar=c(4,4.2,3,1)); h<-1:60
  s2_1 <- omG + alG*a[Tn]^2 + beG*sd_g[Tn]^2   # 1-step from last obs
  fc_g <- numeric(60); fc_g[1]<-s2_1; for(k in 2:60) fc_g[k]<-omG+persistG*fc_g[k-1]
  fc_i <- rep(s2_1, 60)                         # EWMA: flat (omega=0, a+b=1)
  plot(h, sqrt(fc_g), type="l", lwd=2.5, col=col_blue, ylim=range(sqrt(fc_g),sqrt(fc_i),lrG),
       xlab="forecast horizon h (days)", ylab=expression(hat(sigma)[t](h)~"(%)"),
       main="GARCH forecast mean-reverts; IGARCH (EWMA) never does")
  lines(h, sqrt(fc_i), lwd=2.5, col=col_orange)
  abline(h=lrG, lty=2, col="grey40")
  legend("right", c("GARCH(1,1)","IGARCH / EWMA","long-run sigma (GARCH)"),
         col=c(col_blue,col_orange,"grey40"), lwd=c(2.5,2.5,1), lty=c(1,1,2), bty="n", cex=0.9)
}, width=8.5, height=4.3)

## ============================================================
##  FIGURE D -- EWMA vs GARCH conditional vol, in-sample (2008-09)
## ============================================================
save_pdf("fig_ewma_vs_garch", {
  par(mar=c(3,4,2.6,1))
  win <- sp_dt>=as.Date("2008-01-01") & sp_dt<=as.Date("2009-12-31")
  plot(sp_dt[win], sd_g[win], type="l", lwd=2, col=col_blue, ylim=range(sd_g[win],sd_rm[win]),
       xlab="", ylab=expression(hat(sigma)[t]~"(%/day)"),
       main="In sample, IGARCH/EWMA and GARCH track closely; they differ only in FORECASTS")
  lines(sp_dt[win], sd_rm[win], lwd=2, col=col_orange, lty=1)
  legend("topleft", c("GARCH(1,1)","EWMA (lambda=0.94)"), col=c(col_blue,col_orange),
         lwd=2, bty="n", cex=0.95)
}, width=9, height=4.2)

rule("SUMMARY of fitted variants (daily S&P 500)")
cat(sprintf("GARCH   : a=%.3f b=%.3f  a+b=%.3f  reverts (H=%.0fd), symmetric\n",
            alG, beG, persistG, log(0.5)/log(persistG)))
cat(sprintf("IGARCH  : lambda=%.3f (a+b=1)  no reversion (H=inf), symmetric\n", lam_hat))
cat(sprintf("GARCH-M : delta=%.4f (t=%.2f) adds risk premium to the MEAN\n", del_m, t_del))
cat(sprintf("EGARCH  : gamma=%.4f (t=%.2f) log-variance, asymmetric (leverage)\n", ga_e, t_ga))

rule("DONE -- figures written to figures_R/")
print(grep("leverage|news|igarch|ewma", list.files(fig_dir, pattern="\\.pdf$"), value=TRUE))
