export type Course = {
    title: string;
    href: string;
    code: string;
    level: string;
    blurb: string;
};

// Courses shown on both the Lecture Notes index and the homepage teaching section.
export const courses: Course[] = [
    {
        title: 'Microeconomics',
        href: '/lectures/Microeconomics',
        code: 'EC107',
        level: 'Undergraduate · 2026',
        blurb:
            'An introduction to microeconomic principles — consumer choice and demand, firm behaviour and costs, and competitive markets — with lecture slides and weekly problem sets.'
    },
    {
        title: 'Intermediate Microeconomics',
        href: '/lectures/Int_Micro',
        code: 'EC306',
        level: 'Undergraduate · 2026',
        blurb:
            'Intermediate microeconomics covering consumer and producer theory, market structure, and welfare, with lecture slides and weekly problem sets.'
    },
    {
        title: 'Advanced Financial Econometrics',
        href: '/lectures/FE',
        code: 'FI362',
        level: 'Summer module · 2026',
        blurb:
            'An introduction to the econometrics of financial markets: asset returns, linear time-series and volatility models, derivative pricing, and tail-risk measures, with applied R supplements on real market data.'
    }
];
