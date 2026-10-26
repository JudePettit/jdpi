title: Finance
intro: A first-year university finance course in twelve units: time value of money, bonds, shares, financial statements, risk, the cost of capital, investment decisions, derivatives, markets and banks. Each lesson ends with questions to check your understanding.

# Unit 1 · The time value of money

## What finance is about
Finance studies how people, companies and governments decide to **move money across time and across risk**. A saver gives up spending today for more spending later. A company raises money now and promises investors a share of uncertain future profits. A government borrows against future tax revenue.

Three ideas run through the whole subject:
- **Money has a time value.** A pound, dollar or euro today is worth more than the same amount next year, because today's money can be invested to earn a return.
- **Risk has a price.** Investors want a higher expected return for bearing more risk, but only for risk they cannot remove by diversifying.
- **Markets set prices.** In a competitive market the price of an asset reflects what investors expect it to pay and how risky those payments are.

The rest of this course applies these three ideas, one at a time, to savings, loans, bonds, shares, projects and derivatives.

! Key idea: Almost every valuation in finance is the same calculation: estimate future cash flows, then discount them back to today at a rate that reflects their timing and risk.

? Why is money today worth more than the same amount in a year?
* Because prices always fall over time
+ Because money today can be invested to earn a return
* Because banks charge fees on future money
= Money available now can earn interest or a return in the meantime; this "opportunity cost" is the time value of money. Inflation adds a further reason, but the core idea holds even with zero inflation.

## Compounding and discounting
If you invest an amount **PV** (present value) at an interest rate **r** per period, after one period you have PV × (1 + r). Interest then earns interest, so after **n** periods:

$ FV = PV × (1 + r)^n

Going the other way, the value today of a cash flow received in n periods is found by **discounting**:

$ PV = FV ÷ (1 + r)^n

! Worked example: €1,000 invested at 5% a year for 10 years grows to 1,000 × 1.05^10 = €1,628.89. Without compounding (simple interest) it would be only €1,500; the extra €128.89 is interest on interest.

! Worked example: What is €10,000 received in five years worth today, if you could earn 6% elsewhere? PV = 10,000 ÷ 1.06^5 = €7,472.58.

### The rule of 72
A quick way to estimate doubling time: divide 72 by the interest rate in percent. At 6% money doubles in about 72 ÷ 6 = 12 years (exact answer: 11.9 years).

### Effective annual rates
Lenders often quote an annual percentage rate (APR) that compounds more than once a year. The **effective annual rate** (EAR) shows what you really earn or pay:

$ EAR = (1 + APR / m)^m − 1      where m = compounding periods per year

A credit card charging 12% APR compounded monthly costs (1.01)^12 − 1 = **12.68%** a year.

? You invest $2,000 at 8% a year. Roughly how long until it doubles?
* About 6 years
+ About 9 years
* About 16 years
= Rule of 72: 72 ÷ 8 = 9 years. The exact figure is 9.006 years.

? Which is worth more today at a 10% discount rate: $1,100 in one year, or $1,200 in two years?
* They are worth exactly the same
+ $1,100 in one year
* $1,200 in two years
= $1,100 ÷ 1.1 = $1,000. $1,200 ÷ 1.21 = $991.74. So $1,100 in one year is worth slightly more, even though $1,200 looks bigger.

## Annuities and perpetuities
Many cash flows are a **stream of equal payments**: loan repayments, pensions, rents, bond coupons.

An **annuity** pays C every period for n periods. Its present value is:

$ PV = C × [1 − (1 + r)^−n] ÷ r

A **perpetuity** pays C forever. Its value is surprisingly simple:

$ PV = C ÷ r

A **growing perpetuity**, whose payment grows at rate g each period (with g < r), is worth:

$ PV = C₁ ÷ (r − g)

! Worked example: A lottery offers €1,000 a year for five years or €4,200 today. At 5%, the annuity is worth 1,000 × (1 − 1.05^−5) ÷ 0.05 = €4,329.48, so take the annual payments.

! Worked example: A mortgage of £200,000 over 25 years at 4.5% a year (monthly payments, so r = 0.375% and n = 300). Solving the annuity formula for C gives a monthly payment of about £1,112.

? A perpetuity pays $50 a year and the discount rate is 5%. What is it worth?
* $250
+ $1,000
* $2,500
= PV = C ÷ r = 50 ÷ 0.05 = $1,000.

# Unit 2 · Interest rates and bonds

## Interest rates: nominal, real and the yield curve
The **nominal** interest rate is the rate quoted in money terms. The **real** rate is the increase in purchasing power after inflation. Irving Fisher's relationship links them:

$ (1 + nominal) = (1 + real) × (1 + expected inflation)       ≈  nominal ≈ real + inflation

If a deposit pays 5% while inflation is 3%, your real return is about 2% (exactly 1.05 ÷ 1.03 − 1 = 1.94%).

Interest rates differ by **maturity**. Plotting yields on government bonds against their maturity gives the **yield curve**.
- **Upward-sloping** (normal): long-term rates above short-term rates, usually because investors expect rates to rise or want extra pay for tying money up longer (the term premium).
- **Inverted**: short-term rates above long-term rates. In the US, an inverted curve has preceded most recessions since the 1960s, though not every inversion has been followed by one.

Interest rates also differ by **credit risk**: a company or country that might default must pay a **credit spread** above the risk-free rate.

? A bond pays 7% while inflation is expected to be 4%. What is the approximate real return?
+ About 3%
* About 11%
* About 7%
= Real ≈ nominal − inflation = 7% − 4% = 3% (exactly 2.88%).

## Pricing a bond
A standard bond pays a fixed **coupon** each year and repays its **face value** at maturity. Its price is the present value of those payments, discounted at the market's required yield:

$ Price = Σ Coupon ÷ (1 + y)^t  +  Face ÷ (1 + y)^n

! Worked example: A 5-year bond with a €1,000 face value pays a 5% annual coupon (€50). If investors require 6%, the price is 50 × (1 − 1.06^−5) ÷ 0.06 + 1,000 ÷ 1.06^5 = 210.62 + 747.26 = **€957.88**. It trades "below par" because its coupon is below the market rate.

Three rules follow:
1. **Bond prices and yields move in opposite directions.** If market yields rise, existing bonds with fixed coupons fall in price.
2. A bond trades at **par** when its coupon equals the market yield, at a **premium** when the coupon is higher and at a **discount** when it is lower.
3. The **yield to maturity** (YTM) is the single discount rate that makes the present value of a bond's payments equal its price. It is the bond's internal rate of return if held to maturity and nothing defaults.

? Market interest rates rise sharply. What happens to the price of an existing fixed-coupon bond?
* It rises
+ It falls
* It stays the same until maturity
= The bond's fixed payments are now discounted at a higher rate, so their present value — the price — falls.

## Duration and interest-rate risk
Long-dated bonds are more sensitive to interest rates than short-dated ones, because more of their value comes from cash flows far in the future. **Duration** measures this sensitivity.

- **Macaulay duration** is the weighted average time (in years) until the bond's cash flows arrive, weighted by their present values.
- **Modified duration** = Macaulay duration ÷ (1 + y). It approximates the percentage price change for a one-percentage-point change in yield.

$ % change in price ≈ − Modified duration × change in yield

! Worked example: A bond with a modified duration of 7 loses about 7% of its value if yields rise from 4% to 5%. A 30-year zero-coupon bond can have a duration near 30 and lose roughly 25% or more for the same move.

Banks and pension funds use duration to **match** their assets to their liabilities. The 2023 failure of Silicon Valley Bank showed what happens when a bank holds long-duration bonds funded by deposits that can leave quickly: rising rates cut the value of its bonds just as depositors withdrew.

? Which bond is most sensitive to a change in interest rates?
* A 1-year bond with a 5% coupon
* A 10-year bond with a 10% coupon
+ A 30-year zero-coupon bond
= Duration is highest for long maturities and low (or zero) coupons, because all the value comes from a single distant payment.

# Unit 3 · Valuing shares

## Shares and the dividend discount model
A **share** (stock) is a claim on a company's profits after everything else has been paid. Shareholders receive **dividends** and can sell the share later. Its value is the present value of all expected future dividends, discounted at the return shareholders require (r):

$ P₀ = D₁ ÷ (1 + r) + D₂ ÷ (1 + r)² + D₃ ÷ (1 + r)³ + …

If dividends grow at a constant rate g forever, this collapses to the **Gordon growth model**:

$ P₀ = D₁ ÷ (r − g)

! Worked example: A company will pay a dividend of $2.00 next year, dividends grow 3% a year and investors require 8%. P₀ = 2.00 ÷ (0.08 − 0.03) = **$40**.

The model shows why share prices are so sensitive to growth expectations and interest rates: if r falls to 7%, the price jumps to $50; if expected growth drops to 2%, it falls to $33.33.

? Using the Gordon model, a share pays a $3 dividend next year, growth is 4% and the required return is 10%. What is it worth?
* $30
+ $50
* $75
= P₀ = 3 ÷ (0.10 − 0.04) = $50.

## Discounted cash flow and multiples
Many companies pay little or no dividend. Analysts therefore value the **free cash flow** the business generates for all its investors:

$ Free cash flow = operating profit after tax + depreciation − capital expenditure − increase in working capital

A **discounted cash flow (DCF)** valuation forecasts free cash flow for 5–10 years, adds a **terminal value** for the years after that (often a growing perpetuity), and discounts everything at the weighted average cost of capital (Unit 6). Subtracting net debt gives the value of the equity.

**Multiples** are a shortcut that compares a company with similar ones:
- **Price/earnings (P/E)**: share price ÷ earnings per share. A P/E of 20 means investors pay 20 times this year's profit.
- **EV/EBITDA**: enterprise value (equity + net debt) ÷ earnings before interest, tax, depreciation and amortisation. Useful for comparing firms with different debt levels.
- **Price/book**: share price ÷ accounting net assets per share; common for banks.

! Caution: A DCF is only as good as its assumptions. Small changes to the growth rate or discount rate in the terminal value can change the answer by half or more. Always test a range of assumptions.

? Why do analysts often use EV/EBITDA rather than P/E to compare companies?
* EBITDA is always larger than earnings
+ It is not distorted by differences in debt and interest costs
* It includes the share price twice
= Enterprise value and EBITDA are both measured before the split between lenders and shareholders, so companies with different financing can be compared fairly.

# Unit 4 · Reading financial statements

## The three statements
Companies report three linked statements.

| Statement | Shows | Key lines |
|---|---|---|
| Income statement | Performance over a period | Revenue, operating profit, interest, tax, net income |
| Balance sheet | Position at a point in time | Assets = liabilities + shareholders' equity |
| Cash-flow statement | Cash in and out over a period | Operating, investing and financing cash flows |

They connect: net income from the income statement increases retained earnings on the balance sheet, and the cash-flow statement explains the change in the balance sheet's cash.

**Profit is not cash.** A company can report profits while running out of cash (for example, if customers pay slowly or it is investing heavily), and it can report losses while generating cash (for example, because depreciation is a non-cash expense).

? A fast-growing company reports rising profits but its cash keeps falling. Which is a plausible reason?
+ Customers are paying more slowly, so receivables are growing
* Depreciation is too high
* It has paid off a loan, which reduces profit
= Rising receivables tie up cash: revenue is booked as profit before the cash arrives.

## Financial ratios
Ratios make statements comparable across companies and years.

- **Liquidity**: current ratio = current assets ÷ current liabilities. Below 1 can signal difficulty paying short-term bills.
- **Leverage**: debt ÷ equity, or net debt ÷ EBITDA. Higher leverage magnifies both gains and losses.
- **Coverage**: interest cover = operating profit ÷ interest expense.
- **Profitability**: operating margin = operating profit ÷ revenue; return on equity (ROE) = net income ÷ equity.
- **Efficiency**: asset turnover = revenue ÷ total assets.

The **DuPont analysis** splits ROE into three drivers:

$ ROE = (Net income ÷ Revenue) × (Revenue ÷ Assets) × (Assets ÷ Equity)
$     =  profit margin       ×  asset turnover     ×  leverage

Two firms with a 15% ROE can be very different: one earns high margins with little debt, the other earns thin margins but borrows heavily.

? Firm A and Firm B both have a 15% return on equity. A has assets/equity of 1.5; B has 5. What does this tell you?
* Both are equally risky
+ B relies far more on borrowing to reach the same ROE
* A must have lower profit margins
= Assets/equity measures leverage. B's ROE depends heavily on debt, which makes it more vulnerable if profits fall.

# Unit 5 · Risk and return

## Measuring risk and return
The **return** on an investment over a period is its price change plus any income, divided by the starting price. Looking forward, we work with the **expected return** (the probability-weighted average outcome) and **risk**, usually measured by the **standard deviation** (volatility) of returns.

Historically, riskier asset classes have earned higher average returns. Over long periods, shares have beaten government bonds, which have beaten cash, but with much larger swings along the way: global equity markets fell roughly half in 2008–09.

! Key idea: A higher expected return is the compensation investors demand for bearing risk. There is no reliable way to earn high returns without accepting risk.

## Diversification and the efficient frontier
Combining assets reduces risk whenever their returns do not move perfectly together. For two assets with weights w₁ and w₂:

$ σ²(portfolio) = w₁²σ₁² + w₂²σ₂² + 2·w₁·w₂·ρ·σ₁·σ₂      (ρ = correlation)

! Worked example: Two shares each have 20% volatility and a correlation of 0.3. Half in each gives σ² = 0.25×0.04 + 0.25×0.04 + 2×0.25×0.3×0.04 = 0.026, so σ ≈ **16.1%**, lower than either share alone, with the same expected return.

Harry Markowitz (1952) showed that investors should judge each asset by its effect on the **whole portfolio**. Plotting the best achievable return for each level of risk traces out the **efficient frontier**. Portfolios below it are inefficient: you could get more return for the same risk.

Diversification removes **specific** (idiosyncratic) risk, such as a single company's failed product. It cannot remove **systematic** (market) risk, such as a recession that hits almost every company. That distinction leads directly to the CAPM.

? Why doesn't diversification eliminate all risk?
* Because brokers charge fees
+ Because some risk affects nearly all assets at once (market or systematic risk)
* Because correlations are always zero
= Diversification cancels out company-specific risk, but economy-wide shocks move most assets together.

# Unit 6 · The cost of capital

## The capital asset pricing model (CAPM)
If investors can diversify away specific risk, the market will only reward **systematic** risk. The CAPM (Sharpe, Lintner, Mossin, 1960s) measures an asset's systematic risk by its **beta** (β): how much its returns move with the market's.

$ Expected return = Risk-free rate + β × (Expected market return − Risk-free rate)

- β = 1: moves with the market. β = 1.5: moves 50% more. β = 0.5: half as much.
- (Market return − risk-free rate) is the **market risk premium**, historically about 4–6% a year in developed markets.

! Worked example: Risk-free rate 4%, market risk premium 5%, β = 1.2. Expected return = 4% + 1.2 × 5% = **10%**.

The CAPM is simple and widely used, but its predictions fit the data only loosely. Fama and French (1992) found that size and value (price-to-book) explain returns beyond beta, which led to multi-factor models.

? A share has a beta of 0.8, the risk-free rate is 3% and the market risk premium is 6%. What is its CAPM expected return?
* 6.6%
+ 7.8%
* 9.0%
= 3% + 0.8 × 6% = 7.8%.

## Weighted average cost of capital (WACC)
A company is financed by equity and debt. Its overall cost of capital is the average of what each costs, weighted by market values. Interest is usually tax-deductible, so debt's cost is reduced by the tax rate:

$ WACC = (E ÷ V) × rₑ + (D ÷ V) × r_d × (1 − tax rate)

! Worked example: 60% equity costing 10%, 40% debt costing 6%, tax rate 25%. WACC = 0.6 × 10% + 0.4 × 6% × 0.75 = 6% + 1.8% = **7.8%**.

The WACC is the discount rate for projects with the same risk as the company's existing business. A riskier project needs a higher rate, whatever the company's overall WACC.

? Why is the after-tax cost of debt used in the WACC?
+ Because interest payments reduce taxable profit
* Because lenders pay the company's tax
* Because debt is risk-free
= Interest is tax-deductible in most systems, so each unit of interest costs the company only (1 − tax rate) after tax.

# Unit 7 · Investment decisions

## Net present value and the internal rate of return
Companies should invest in projects that are worth more than they cost. **Net present value (NPV)** measures exactly that:

$ NPV = −Initial investment + Σ Cash flowₜ ÷ (1 + r)ᵗ

**Accept projects with a positive NPV**: they create value for the owners.

! Worked example: A machine costs €1,000 and generates €400 a year for three years. At an 8% cost of capital, NPV = −1,000 + 400 × (1 − 1.08^−3) ÷ 0.08 = −1,000 + 1,030.84 = **+€30.84**. Accept.

The **internal rate of return (IRR)** is the discount rate that makes NPV zero. For the machine, IRR ≈ 9.7%. If the IRR exceeds the cost of capital, NPV is positive.

IRR is popular but has pitfalls:
- When comparing **mutually exclusive** projects, the higher IRR is not always the higher NPV (scale and timing differ).
- Projects with cash flows that change sign more than once can have **several IRRs** or none.
- The **payback period** (how long until the investment is recovered) ignores the time value of money and everything after payback, so use it only as a rough check.

? Project A has an NPV of $5m and an IRR of 15%. Project B has an NPV of $8m and an IRR of 12%. You can only do one. Which creates more value?
* A, because its IRR is higher
+ B, because its NPV is higher
* They are equal
= NPV measures the value created in money terms. A higher IRR on a smaller or differently timed project can still create less value.

## Estimating project cash flows
Good capital budgeting depends on getting the cash flows right. Rules of thumb:
1. Use **cash flows**, not accounting profits. Add back depreciation; subtract capital spending and increases in working capital.
2. Include only **incremental** cash flows: what changes because of the project.
3. Ignore **sunk costs**: money already spent cannot be recovered whatever you decide.
4. Include **opportunity costs**: if the project uses a building you could otherwise rent out, the lost rent is a cost.
5. Count **side effects**, such as sales your new product takes from your existing ones (cannibalisation).
6. Be consistent about **inflation**: discount nominal cash flows at a nominal rate, or real cash flows at a real rate.

? A firm has spent €2m on research for a new product. When deciding whether to launch it, how should the €2m be treated?
* Added to the launch cost
+ Ignored, because it is a sunk cost
* Subtracted from the cash flows over five years
= The research money is spent whatever the decision, so it is irrelevant to whether launching adds value.

# Unit 8 · Financing and payout

## Capital structure: debt or equity?
In 1958 Modigliani and Miller showed that, in a world without taxes, bankruptcy costs or information problems, **the mix of debt and equity does not change a firm's value**: borrowing makes equity riskier, and shareholders demand a higher return that exactly offsets cheaper debt.

The real world adds frictions, which give the **trade-off theory**:
- **Tax shield**: interest is tax-deductible, so debt adds value.
- **Financial distress costs**: too much debt raises the risk of default, legal costs, lost customers and forced asset sales.
- Firms should borrow up to the point where the extra tax benefit equals the extra expected distress cost.

The **pecking-order theory** (Myers and Majluf, 1984) adds information: managers know more than investors, so issuing shares can signal that they think the shares are overvalued. Firms therefore prefer internal funds first, then debt, and new equity last.

? According to Modigliani–Miller without taxes, what happens to a firm's total value if it replaces equity with cheaper debt?
* It rises because debt is cheaper
+ It stays the same because equity becomes riskier and more expensive
* It falls because of bankruptcy risk
= With no taxes or frictions, the lower cost of debt is exactly offset by the higher required return on the now-riskier equity.

## Dividends and buybacks
Companies return cash to shareholders through **dividends** or **share buybacks**. In a perfect market (Miller and Modigliani, 1961) payout policy does not affect value: shareholders who want cash can sell shares, and those who don't can reinvest dividends.

In practice payout matters because of:
- **Taxes**: dividends and capital gains are often taxed differently.
- **Signalling**: companies are reluctant to cut dividends, so raising one signals confidence.
- **Agency costs**: paying out cash stops managers wasting it on poor investments.
- **Flexibility**: buybacks can be varied year to year more easily than dividends.

# Unit 9 · Derivatives

## Forwards, futures and swaps
A **derivative** is a contract whose value depends on another asset: a share, an index, a currency, an interest rate or a commodity.

- A **forward** is an agreement to buy or sell an asset at a fixed price on a future date. A farmer can lock in a wheat price; an importer can lock in an exchange rate.
- A **future** is a standardised forward traded on an exchange, with gains and losses settled daily through a margin account, which removes most counterparty risk.
- A **swap** exchanges one stream of cash flows for another, for example a fixed interest rate for a floating one.

The fair forward price comes from **no-arbitrage**: buying the asset today and holding it must cost the same as agreeing to buy it later.

$ Forward price = Spot price × (1 + r)^T      (for an asset with no income or storage costs)

? An airline wants to protect itself against a rise in jet fuel prices. Which position helps?
+ Buying fuel futures (a long position)
* Selling fuel futures
* Buying shares in another airline
= A long futures position gains when fuel prices rise, offsetting the airline's higher fuel bill.

## Options
An **option** gives the right, but not the obligation, to buy (**call**) or sell (**put**) an asset at a fixed **strike price** before or on an expiry date. The buyer pays a **premium** for this right.

- A call is worth max(S − K, 0) at expiry; a put is worth max(K − S, 0), where S is the asset price and K the strike.
- The buyer's loss is limited to the premium; the seller's (writer's) loss on a call is unlimited.

! Worked example: You buy a call with a strike of $100 for a $5 premium. At expiry the share is $120. Payoff = $20, profit = $20 − $5 = **$15**. If the share ends at $95, the option expires worthless and you lose the $5 premium.

**Put–call parity** links European calls and puts with the same strike and expiry:

$ Call − Put = Share price − Strike ÷ (1 + r)^T

Option prices rise with the asset's **volatility** and the **time to expiry**. The Black–Scholes–Merton model (1973) prices options from these inputs, and option prices in turn reveal the market's expected volatility (the VIX index does this for the S&P 500).

Derivatives are used to **hedge** risk, to **speculate** with leverage, and to build tailored exposures. Leverage cuts both ways: the 2008 crisis showed how derivatives can spread losses through the financial system when positions are opaque and poorly collateralised.

? You buy a put option with a strike of €50 for €3. At expiry the share is €40. What is your profit?
* €3
+ €7
* €10
= Payoff = max(50 − 40, 0) = €10; profit = €10 − €3 premium = €7.

# Unit 10 · Markets and behaviour

## The efficient market hypothesis
Eugene Fama's **efficient market hypothesis** (EMH) says prices quickly reflect available information, so it is hard to earn returns above what the risk justifies.
- **Weak form**: past prices can't predict future returns, so chart patterns don't reliably beat the market.
- **Semi-strong form**: prices reflect all public information, so studying published accounts doesn't reliably beat the market.
- **Strong form**: prices reflect even private information. Insider-trading profits show this form does not hold.

The strongest evidence for efficiency is practical: most actively managed funds underperform low-cost index funds over long periods after fees. That is why passive investing has grown so fast.

? A fund manager's strategy uses only past share-price charts. Which form of market efficiency says it should not reliably beat the market?
+ Weak form
* Only strong form
* None of them
= The weak form already rules out profiting from past prices, and the semi-strong and strong forms include it.

## Behavioural finance and bubbles
Behavioural finance studies how real investors depart from rational models:
- **Overconfidence**: investors overrate their own skill and trade too much.
- **Loss aversion** (Kahneman and Tversky): losses hurt about twice as much as equal gains please, so investors hold losers too long and sell winners too early.
- **Herding and momentum**: people follow the crowd, so trends can persist.
- **Limits to arbitrage**: even when prices are wrong, betting against them can be risky and costly ("markets can remain irrational longer than you can remain solvent").

These effects help explain **bubbles**, such as the dot-com boom of the late 1990s and the US housing bubble before 2008, when prices rose far above values justified by cash flows before collapsing.

# Unit 11 · Banks, money and central banks

## How banks work
Banks borrow short (deposits that can be withdrawn at any time) and lend long (mortgages and business loans). This **maturity transformation** is useful but fragile: if many depositors want their money at once, a sound bank can fail in a **bank run**.

When a bank makes a loan it credits the borrower's account with a new deposit. In this sense, **commercial banks create most of the money in a modern economy** (Bank of England, 2014). Their lending is limited by profitability, regulation (capital and liquidity requirements) and the central bank's interest rate, not by a fixed pool of savings. The Economics course explores the competing views on this, including Richard Werner's credit creation theory.

Safeguards include:
- **Capital requirements** (Basel III): equity that absorbs losses before depositors are hurt.
- **Liquidity requirements**: enough easily-sold assets to cover a 30-day outflow.
- **Deposit insurance**: protects small savers (for example, €100,000 per depositor per bank in the EU) and reduces runs.
- **Lender of last resort**: the central bank lends to solvent banks facing a run.

? Why can a perfectly solvent bank still fail?
+ Because its assets are long-term loans but its deposits can be withdrawn immediately
* Because banks are not allowed to hold any cash
* Because deposit insurance forces it to close
= A run can force a bank to sell long-term assets at a loss, turning a liquidity problem into a solvency one.

## Central banks and monetary policy
Central banks (the Federal Reserve, the European Central Bank, the Bank of England, the Bank of Japan) aim mainly at **price stability**, often an inflation target of 2%, and some also at employment.

Their main tools:
- **Policy interest rate**: changing the rate at which banks borrow from the central bank shifts borrowing costs across the economy.
- **Quantitative easing (QE)**: buying government bonds and other assets with newly created central-bank money to push down long-term interest rates when the policy rate is near zero.
- **Forward guidance**: signalling the future path of rates.
- **Macroprudential policy**: limits on lending, such as caps on mortgage size relative to income.

Higher rates usually slow borrowing, spending and inflation with a lag of a year or more; lower rates do the reverse. Different economic schools disagree sharply about how well this works — see the Economics course.

# Unit 12 · Putting it into practice

## Personal finance with the tools of this course
The same principles apply to your own money.
1. **Compounding works for and against you.** €200 a month invested at 6% for 40 years grows to about €398,000; the same rate on credit-card debt compounds just as fast against you. Clear high-interest debt first.
2. **Keep an emergency fund** of several months' spending in cash, so a shock doesn't force you to sell investments at a bad time.
3. **Diversify cheaply.** A low-cost global index fund gives exposure to thousands of companies. Fees of 1% a year instead of 0.1% can cost more than a fifth of your final pot over 40 years.
4. **Match risk to your time horizon.** Money needed within a few years shouldn't be in shares; money for decades can ride out downturns.
5. **Real returns matter.** A 4% savings rate with 3% inflation is a 1% real return.
6. **Beware of anything promising high returns with low risk.** Unit 5 explains why that combination rarely exists.

! Note: This course is for education. It is not personal financial advice; consider your own circumstances or speak to a regulated adviser before making decisions.

? Fund A charges 0.1% a year and Fund B charges 1.0% a year, and both earn 6% before fees. Over 40 years, roughly how much less does €10,000 grow to in Fund B?
* About 1% less
* About 10% less
+ About 30% less
= Fund A: 10,000 × 1.059^40 ≈ €98,900. Fund B: 10,000 × 1.05^40 ≈ €70,400. That is about 29% less, from a fee difference of 0.9 percentage points.
