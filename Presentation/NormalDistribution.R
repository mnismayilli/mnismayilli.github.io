library(ggplot2)
library(dplyr)
library(tidyr)
library(plotly)
set.seed(1)
data <- rnorm(50, mean = 5, sd = 2)

hist(data, col = "blue", main = "Sample Data Histogram", xlab = "Value", breaks = 10)

library(shiny)

ui <- fluidPage(
  sliderInput("mu", "Mean (μ):", min = 0, max = 10, value = 5, step = 0.1),
  sliderInput("sigma", "Standard Deviation (σ):", min = 0.1, max = 5, value = 2, step = 0.1),
  plotOutput("loglikPlot")
)

server <- function(input, output) {
  output$loglikPlot <- renderPlot({
    mu <- input$mu
    sigma <- input$sigma
    log_likelihood <- sum(dnorm(data, mean = mu, sd = sigma, log = TRUE))
    
    ggplot(data.frame(x = data), aes(x)) +
      geom_histogram(aes(y = ..density..), fill = "lightblue", bins = 9) +
      stat_function(fun = function(x) dnorm(x, mean = mu, sd = sigma), color = "red", size = 1.2) +
      labs(title = paste("Log-Likelihood:", round(log_likelihood, 2)),
           x = "Value", y = "Density")
  })
}

shinyApp(ui, server)

mu_seq <- seq(3, 7, length.out = 50)
sigma_seq <- seq(1, 3, length.out = 50)

grid <- expand.grid(mu = mu_seq, sigma = sigma_seq)
grid$loglik <- apply(grid, 1, function(p) {
  sum(dnorm(data, mean = p[1], sd = p[2], log = TRUE))
})

mle_mu <- mean(data)
mle_sd <- sd(data)

plot_ly(grid, x = ~mu, y = ~sigma, z = ~loglik, type = "surface") %>%
  layout(title = "Log-Likelihood Surface",
         scene = list(
           xaxis = list(title = "μ"),
           yaxis = list(title = "σ"),
           zaxis = list(title = "Log-Likelihood")
         ))

