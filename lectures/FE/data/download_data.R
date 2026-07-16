# =====================================================================
# download_data.R
# FI 362 - Advanced Financial Econometrics
# Downloads daily prices for a panel of global stocks & market indices
# from Yahoo Finance (Jan 2000 - May 2026) and writes tidy CSV files.
#
# Output (all written into the folder that holds this script):
#   raw/<TICKER>.csv          full OHLCV + adjusted close, one file per series
#   indices_adjclose.csv      wide panel: Date + adjusted close of each index
#   stocks_adjclose.csv       wide panel: Date + adjusted close of each stock
#   indices_monthly.csv       month-end adjusted close of each index
#   sp500_monthly.csv         month-end S&P 500 (for the Exercise-2 task)
#   metadata.csv              ticker -> name / region / asset class / rows
#
# Run:  Rscript download_data.R
# =====================================================================

suppressPackageStartupMessages({
  library(quantmod)
  library(zoo)
})

options(timeout = 120)

## --- where am I? write everything next to this script -----------------
get_script_dir <- function() {
  a <- commandArgs(trailingOnly = FALSE)
  f <- sub("^--file=", "", a[grep("^--file=", a)])
  if (length(f)) return(normalizePath(dirname(f)))
  getwd()
}
out_dir <- get_script_dir()
raw_dir <- file.path(out_dir, "raw")
dir.create(raw_dir, showWarnings = FALSE, recursive = TRUE)

from_date <- "2000-01-01"
to_date   <- "2026-06-01"   # 'to' is exclusive -> captures through 31 May 2026

## --- the universe -----------------------------------------------------
## Each row: yahoo symbol, a clean name we use for files/columns, region, class
universe <- read.csv(text = "
symbol,name,region,asset_class
^GSPC,SP500,United States,Equity index
^IXIC,NASDAQ,United States,Equity index
^DJI,DowJones,United States,Equity index
^FTSE,FTSE100,United Kingdom,Equity index
^GDAXI,DAX,Germany,Equity index
^FCHI,CAC40,France,Equity index
^N225,Nikkei225,Japan,Equity index
^HSI,HangSeng,Hong Kong,Equity index
000001.SS,SSEComposite,China,Equity index
^KS11,KOSPI,South Korea,Equity index
^BSESN,Sensex,India,Equity index
AAPL,AAPL,United States,Stock
MSFT,MSFT,United States,Stock
AXP,AXP,United States,Stock
CAT,CAT,United States,Stock
SBUX,SBUX,United States,Stock
", stringsAsFactors = FALSE, strip.white = TRUE)
universe <- universe[universe$symbol != "", ]

## --- robust single-ticker fetch with retries -------------------------
fetch_one <- function(sym, tries = 3) {
  for (i in seq_len(tries)) {
    x <- tryCatch(
      getSymbols(sym, src = "yahoo", from = from_date, to = to_date,
                 auto.assign = FALSE),
      error = function(e) { message("  attempt ", i, " failed: ",
                                    conditionMessage(e)); NULL })
    if (!is.null(x) && nrow(x) > 0) return(x)
    Sys.sleep(2)
  }
  NULL
}

## --- main loop --------------------------------------------------------
adj_list <- list()   # name -> xts of adjusted close
meta_rows <- list()

for (k in seq_len(nrow(universe))) {
  sym  <- universe$symbol[k]
  name <- universe$name[k]
  message(sprintf("[%2d/%2d] %-12s (%s)", k, nrow(universe), sym, name))

  x <- fetch_one(sym)
  if (is.null(x)) {
    message("  !! giving up on ", sym)
    meta_rows[[name]] <- data.frame(symbol = sym, name = name,
      region = universe$region[k], asset_class = universe$asset_class[k],
      rows = 0L, start = NA, end = NA, stringsAsFactors = FALSE)
    next
  }

  # standardise column names: Open High Low Close Volume Adjusted.
  # Strip everything up to the LAST dot so symbols that themselves
  # contain a dot (e.g. 000001.SS) are handled correctly.
  cn <- sub(".*\\.", "", colnames(x))
  colnames(x) <- cn
  df <- data.frame(Date = index(x), coredata(x), row.names = NULL)

  # full OHLCV file
  write.csv(df, file.path(raw_dir, paste0(name, ".csv")), row.names = FALSE)

  # keep adjusted close (fall back to Close if Adjusted missing)
  adj_col <- if ("Adjusted" %in% colnames(x)) "Adjusted" else "Close"
  adj <- x[, adj_col]; colnames(adj) <- name
  adj_list[[name]] <- adj

  meta_rows[[name]] <- data.frame(symbol = sym, name = name,
    region = universe$region[k], asset_class = universe$asset_class[k],
    rows = nrow(x), start = as.character(start(x)),
    end = as.character(end(x)), stringsAsFactors = FALSE)

  Sys.sleep(1)  # be polite to Yahoo
}

## --- wide panels (Date + one column per series) ----------------------
write_panel <- function(names, file) {
  names <- names[names %in% names(adj_list)]
  if (!length(names)) return(invisible())
  panel <- do.call(merge, adj_list[names])     # outer join on dates
  colnames(panel) <- names
  out <- data.frame(Date = index(panel), coredata(panel), row.names = NULL)
  write.csv(out, file.path(out_dir, file), row.names = FALSE)
  message("wrote ", file, "  (", nrow(out), " rows x ", length(names), " series)")
}

index_names <- universe$name[universe$asset_class == "Equity index"]
stock_names <- universe$name[universe$asset_class == "Stock"]

write_panel(index_names, "indices_adjclose.csv")
write_panel(stock_names, "stocks_adjclose.csv")

## --- monthly (month-end) panels --------------------------------------
to_monthly_last <- function(x) {
  m <- apply.monthly(x, last)
  # stamp each row with the actual month-end calendar date
  zoo::index(m) <- as.Date(zoo::as.yearmon(zoo::index(m)), frac = 1)
  m
}
if (length(index_names)) {
  idx_m <- do.call(merge, lapply(adj_list[index_names], to_monthly_last))
  colnames(idx_m) <- index_names
  write.csv(data.frame(Date = index(idx_m), coredata(idx_m), row.names = NULL),
            file.path(out_dir, "indices_monthly.csv"), row.names = FALSE)
  message("wrote indices_monthly.csv (", nrow(idx_m), " months)")

  if ("SP500" %in% index_names) {
    sp <- to_monthly_last(adj_list[["SP500"]]); colnames(sp) <- "SP500"
    write.csv(data.frame(Date = index(sp), coredata(sp), row.names = NULL),
              file.path(out_dir, "sp500_monthly.csv"), row.names = FALSE)
    message("wrote sp500_monthly.csv (", nrow(sp), " months)")
  }
}

## --- metadata ---------------------------------------------------------
meta <- do.call(rbind, meta_rows)
write.csv(meta, file.path(out_dir, "metadata.csv"), row.names = FALSE)

message("\nDONE. Files in: ", out_dir)
print(meta[, c("symbol", "name", "region", "rows", "start", "end")],
      row.names = FALSE)
