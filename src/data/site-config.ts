export type Image = {
    src: string;
    alt?: string;
    caption?: string;
};

export type Link = {
    text: string;
    href: string;
    children?: Link[];
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
    email?: string;
    office?: string;
    headerNavLinks?: Link[];
    footerNavLinks?: Link[];
    socialLinks?: Link[];
    hero?: Hero;
    subscribe?: Subscribe;
    postsPerPage?: number;
    projectsPerPage?: number;
    research?: string;
};

const profile = "I am a Lecturer in Economics at the <a href=https://www.economics.ox.ac.uk/people/mehman-ismayilli> University of Oxford</a>. My research interests are industrial organization, experimental economics, and the application of machine learning in economic theory. Previously, I worked at the University of Manchester and the University of Warwick. I hold my PhD in Economics from the University of Leicester.";


const siteConfig: SiteConfig = {
    website: 'https://mnismayilli.github.io',
    title: 'Mehman Ismayilli',
    subtitle: 'Economist & Educator at the University of Oxford',
    description: 'Economist & Educator at the University of Oxford',
    email: 'mehman.ismayilli@economics.ox.ac.uk',
    office: 'Room 242, Department of Economics, University of Oxford, Manor Road, OX1 3UQ',
    headerNavLinks: [
        {
            text: 'Research',
            href: '/projects'
        },
        {
            text: 'Teaching',
            href: '/teaching'
        },
        {
            text: 'Lecture Notes',
            href: '/lectures'
        },
        {
            text: 'M&amp;A Watch',
            href: '/ma-watch'
        }
    ],
    footerNavLinks: [
        {
            text: 'CV',
            href: '/about'
        },
        {
            text: 'Contact',
            href: '/contact'
        }
    ],
    socialLinks: [
        {
            text: 'LinkedIn',
            href: 'https://www.linkedin.com/in/mismayilli/'
        },
        {
            text: 'Oxford',
            href: 'https://www.economics.ox.ac.uk/people/mehman-ismayilli'
        },
        {
            text: 'X/Twitter',
            href: 'https://x.com/IsmayilliMehman'
        }
    ],
    hero:{
        image: {
            src: '/profilephoto.jpg',
            alt: 'Mehman Ismayilli',
        },
        text: profile,
        actions: [
            {
                text: 'View CV',
                href: '/about'
            },
            {
                text: 'Contact',
                href: '/contact'
            }
        ]
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
