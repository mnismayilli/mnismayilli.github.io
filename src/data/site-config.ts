export type Image = {
    src: string;
    alt?: string;
    caption?: string;
};

export type Link = {
    text: string;
    href: string;
};

export type Hero = {
    title?: string;
    text?: string;
    image?: Image;
    actions?: Link[];
};

export type Subscribe = {
    title?: string;
    text?: string;
    formUrl: string;
};

export type SiteConfig = {
    website: string;
    logo?: Image;
    title: string;
    subtitle?: string;
    description: string;
    image?: Image;
    headerNavLinks?: Link[];
    footerNavLinks?: Link[];
    socialLinks?: Link[];
    hero?: Hero;
    subscribe?: Subscribe;
    postsPerPage?: number;
    projectsPerPage?: number;
    research?: string;
};

const profile = "I am a lecturer in the Department of Economics at the <a href=https://www.ox.ac.uk> University of Oxford</a> . My research interests are industrial organisation, experimental economics, and the application of machine learning in economic theory. Previously, I worked at the University of Manchester and the University of Warwick. I hold my PhD in Economics from the University of Leicester.";


const siteConfig: SiteConfig = {
    website: 'https://mnismayilli.github.io',
    title: 'Mehman Ismayilli',
    subtitle: 'Economist & Educator at the University of Oxford',
    description: 'Economist & Educator at the University of Oxford',
    headerNavLinks: [
        {
            text: 'Home',
            href: '/'
        },
        {
            text: 'Research',
            href: '/projects'
        },
        {
            text: 'Teaching',
            href: '/teaching'
        },
    ],
    footerNavLinks: [
        {
            text: 'About',
            href: '/about'
        },
    ],
    socialLinks: [
        {
            text: 'LinkedIn',
            href: 'https://www.linkedin.com/in/mismayilli/'
        },
        {
            text: 'Oxford',
            href: 'https://www.ox.ac.uk'
        },
        {
            text: 'X/Twitter',
            href: 'https://x.com/IsmayilliMehman'
        }
    ],
    hero:{
        //     image: {
        //     src: '/mehmanismayilli.jpeg',
        //     alt: 'Mehman Ismayilli',
        // },
        text: profile,
        // actions: [
        //     {
        //         text: 'Get in Touch',
        //         href: '/contact'
        //     }
        // ]
    },
    // subscribe: {
    //     title: 'Subscribe to Dante Newsletter',
    //     text: 'One update per week. All the latest posts directly in your inbox.',
    //     formUrl: '#'
    // },
    // postsPerPage: 4,
    // projectsPerPage: 4
};

export default siteConfig;
